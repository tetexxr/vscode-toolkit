import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import * as path from 'node:path'
import {
  addHistoryEntry,
  buildCurl,
  describeHistoryEntry,
  environmentNames,
  findHeader,
  findRequestAtLine,
  formatResponse,
  inferLanguageFromContentType,
  interpolate,
  mergeEnvironmentVariables,
  parseBodyFileRef,
  parseDotenv,
  parseEnvironmentFile,
  parseHttpFile,
  truncateForHistory,
  type BodyFileRef,
  type EnvironmentFile,
  type HttpRequest,
  type InterpolateOptions,
  type ParsedHttpFile,
  type ResponseHistoryEntry
} from './rest-client-utils'

const FILE_GLOB = '**/*.{http,rest}'

/** Hard cap on buffered response bodies (mirrors utils/http.ts). */
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

/** Reads the response body as text, aborting if it exceeds the cap. */
async function readBodyCapped(response: Response): Promise<string> {
  if (!response.body) {
    return ''
  }
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || value === undefined) {
      break
    }
    received += value.byteLength
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error(`Response body exceeded ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB — request aborted.`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

interface RestClientConfig {
  timeoutMs: number
  followRedirects: boolean
  previewResponseAs: 'auto' | 'raw' | 'json'
}

function readConfig(): RestClientConfig {
  const config = vscode.workspace.getConfiguration('toolkit.restClient')
  return {
    timeoutMs: Math.max(0, config.get<number>('timeout', 30000)),
    followRedirects: config.get<boolean>('followRedirects', true),
    previewResponseAs: config.get<'auto' | 'raw' | 'json'>('previewResponseAs', 'auto')
  }
}

function isHttpFile(document: vscode.TextDocument): boolean {
  const lower = document.uri.path.toLowerCase()
  return lower.endsWith('.http') || lower.endsWith('.rest')
}

function variablesAsRecord(parsed: ParsedHttpFile): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of parsed.variables) {
    out[v.name] = v.value
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  Environments                                                              */
/* -------------------------------------------------------------------------- */

const ENV_STATE_KEY = 'toolkit.restClient.environment'
const ENV_FILE_NAME = 'http-client.env.json'
const PRIVATE_ENV_FILE_NAME = 'http-client.private.env.json'

let extensionContext: vscode.ExtensionContext | undefined
let environmentStatusBar: vscode.StatusBarItem | undefined

function selectedEnvironment(): string {
  return extensionContext?.workspaceState.get<string>(ENV_STATE_KEY, '') ?? ''
}

async function readJsonIfExists(uri: vscode.Uri): Promise<EnvironmentFile | null> {
  try {
    return parseEnvironmentFile(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Finds http-client.env.json (+ private overlay) next to the .http file,
 * walking up to the workspace folder root. The nearest directory containing
 * either file wins; both files are read from that directory.
 */
async function findEnvironmentFiles(
  documentUri: vscode.Uri
): Promise<{ publicFile: EnvironmentFile | null; privateFile: EnvironmentFile | null }> {
  const folder = vscode.workspace.getWorkspaceFolder(documentUri)
  const stopAt = folder ? folder.uri.fsPath : path.dirname(documentUri.fsPath)
  let dir = path.dirname(documentUri.fsPath)
  for (;;) {
    const publicFile = await readJsonIfExists(vscode.Uri.file(path.join(dir, ENV_FILE_NAME)))
    const privateFile = await readJsonIfExists(vscode.Uri.file(path.join(dir, PRIVATE_ENV_FILE_NAME)))
    if (publicFile || privateFile) {
      return { publicFile, privateFile }
    }
    if (dir === stopAt || path.dirname(dir) === dir) {
      return { publicFile: null, privateFile: null }
    }
    dir = path.dirname(dir)
  }
}

async function loadEnvironmentVariables(documentUri: vscode.Uri): Promise<Record<string, string>> {
  const environment = selectedEnvironment()
  if (!environment) {
    return {}
  }
  const { publicFile, privateFile } = await findEnvironmentFiles(documentUri)
  return mergeEnvironmentVariables(publicFile, privateFile, environment)
}

function updateEnvironmentStatusBar(): void {
  if (!environmentStatusBar) {
    return
  }
  const editor = vscode.window.activeTextEditor
  if (!editor || !isHttpFile(editor.document)) {
    environmentStatusBar.hide()
    return
  }
  const environment = selectedEnvironment()
  environmentStatusBar.text = `$(globe) ${environment || 'No env'}`
  environmentStatusBar.tooltip = environment
    ? `REST Client environment: ${environment} — click to change`
    : 'REST Client: no environment selected — click to choose one'
  environmentStatusBar.show()
}

async function selectEnvironment(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !isHttpFile(editor.document)) {
    vscode.window.showInformationMessage('Toolkit: open a .http or .rest file to select its environment.')
    return
  }
  const { publicFile, privateFile } = await findEnvironmentFiles(editor.document.uri)
  const names = environmentNames(publicFile, privateFile)
  if (names.length === 0) {
    vscode.window.showInformationMessage(
      `Toolkit: no ${ENV_FILE_NAME} found next to this file (or in a parent folder up to the workspace root).`
    )
    return
  }
  type Item = vscode.QuickPickItem & { environment: string }
  const current = selectedEnvironment()
  const items: Item[] = [
    { label: '$(circle-slash) No environment', environment: '' },
    ...names.map(name => ({
      label: `$(globe) ${name}`,
      description: name === current ? 'current' : '',
      environment: name
    }))
  ]
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'REST Client environment' })
  if (!picked) {
    return
  }
  await extensionContext?.workspaceState.update(ENV_STATE_KEY, picked.environment)
  updateEnvironmentStatusBar()
}

/* -------------------------------------------------------------------------- */
/*  Response history                                                          */
/* -------------------------------------------------------------------------- */

const HISTORY_STATE_KEY = 'toolkit.restClient.history'
const HISTORY_SCHEME = 'toolkit-rest-history'
/** Per-entry body cap stored in workspace state (~1 MB) so history stays small. */
const MAX_HISTORY_BODY_CHARS = 1_000_000

function historySize(): number {
  return Math.max(0, vscode.workspace.getConfiguration('toolkit.restClient').get<number>('historySize', 30))
}

function getHistory(): ResponseHistoryEntry[] {
  return extensionContext?.workspaceState.get<ResponseHistoryEntry[]>(HISTORY_STATE_KEY, []) ?? []
}

async function recordHistory(response: Awaited<ReturnType<typeof executeRequest>>, method: string): Promise<void> {
  const max = historySize()
  if (max <= 0) {
    return
  }
  const { body, truncated } = truncateForHistory(response.body, MAX_HISTORY_BODY_CHARS)
  const entry: ResponseHistoryEntry = {
    id: randomUUID(),
    method,
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    durationMs: response.durationMs,
    timestamp: Date.now(),
    headers: response.headers,
    body,
    bodyTruncated: truncated
  }
  await extensionContext?.workspaceState.update(HISTORY_STATE_KEY, addHistoryEntry(getHistory(), entry, max))
}

/** Maps a content-type to a file extension so the diff editor highlights the body. */
function historyExtension(entry: ResponseHistoryEntry): string {
  const lang = inferLanguageFromContentType(findHeader(entry.headers, 'content-type'))
  switch (lang) {
    case 'json':
      return 'json'
    case 'xml':
      return 'xml'
    case 'html':
      return 'html'
    case 'javascript':
      return 'js'
    case 'css':
      return 'css'
    case 'csv':
      return 'csv'
    default:
      return 'txt'
  }
}

/** Virtual URI addressing a history entry by id (content served read-only for diffs). */
function historyUri(entry: ResponseHistoryEntry): vscode.Uri {
  return vscode.Uri.from({
    scheme: HISTORY_SCHEME,
    path: `/${entry.method} ${entry.status}.${historyExtension(entry)}`,
    query: entry.id
  })
}

/** Serves a history entry's formatted response as a read-only virtual document. */
class HistoryContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const entry = getHistory().find(e => e.id === uri.query)
    return entry ? formatResponse(entry) : ''
  }
}

type HistoryItem = vscode.QuickPickItem & { entry: ResponseHistoryEntry }

function historyQuickPickItems(history: ResponseHistoryEntry[]): HistoryItem[] {
  return history.map(entry => {
    const { label, description } = describeHistoryEntry(entry)
    return { label: `$(arrow-small-right) ${label}`, description, entry }
  })
}

async function showHistory(): Promise<void> {
  const history = getHistory()
  if (history.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no REST Client response history yet.')
    return
  }
  const picked = await vscode.window.showQuickPick(historyQuickPickItems(history), {
    placeHolder: 'REST Client — response history (pick one to reopen)'
  })
  if (!picked) {
    return
  }
  await showResponse(picked.entry, readConfig().previewResponseAs)
}

async function diffHistory(): Promise<void> {
  const history = getHistory()
  if (history.length < 2) {
    vscode.window.showInformationMessage('Toolkit: need at least two responses in history to diff.')
    return
  }
  const first = await vscode.window.showQuickPick(historyQuickPickItems(history), {
    placeHolder: 'Diff: pick the first response'
  })
  if (!first) {
    return
  }
  const rest = history.filter(e => e.id !== first.entry.id)
  const second = await vscode.window.showQuickPick(historyQuickPickItems(rest), {
    placeHolder: 'Diff: pick the second response'
  })
  if (!second) {
    return
  }
  // Diff oldest → newest so additions read as "what changed since".
  const [older, newer] =
    first.entry.timestamp <= second.entry.timestamp
      ? [first.entry, second.entry]
      : [second.entry, first.entry]
  await vscode.commands.executeCommand(
    'vscode.diff',
    historyUri(older),
    historyUri(newer),
    `REST history: ${older.method} ${older.status} ↔ ${newer.method} ${newer.status}`
  )
}

async function clearHistory(): Promise<void> {
  if (getHistory().length === 0) {
    vscode.window.showInformationMessage('Toolkit: REST Client history is already empty.')
    return
  }
  await extensionContext?.workspaceState.update(HISTORY_STATE_KEY, [])
  vscode.window.showInformationMessage('Toolkit: REST Client response history cleared.')
}

/* -------------------------------------------------------------------------- */
/*  CodeLens                                                                  */
/* -------------------------------------------------------------------------- */

class HttpCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isHttpFile(document)) {
      return []
    }
    const parsed = parseHttpFile(document.getText())
    return parsed.requests.flatMap((req, index) => {
      const range = new vscode.Range(req.startLine, 0, req.startLine, 0)
      return [
        new vscode.CodeLens(range, {
          title: `$(play) Send Request${req.name && req.name !== `Request ${index + 1}` ? `: ${req.name}` : ''}`,
          command: 'toolkit.restClient.sendByIndex',
          arguments: [document.uri.toString(), index]
        }),
        new vscode.CodeLens(range, {
          title: 'Copy as curl',
          command: 'toolkit.restClient.copyAsCurlByIndex',
          arguments: [document.uri.toString(), index]
        })
      ]
    })
  }
}

/* -------------------------------------------------------------------------- */
/*  Executor                                                                  */
/* -------------------------------------------------------------------------- */

const inflight: Set<AbortController> = new Set()

async function executeRequest(
  req: HttpRequest,
  variables: Record<string, string>,
  config: RestClientConfig,
  baseDir: string,
  opts: InterpolateOptions
): Promise<{
  status: number
  statusText: string
  headers: Array<{ name: string; value: string }>
  body: string
  durationMs: number
  url: string
}> {
  const url = interpolate(req.url, variables, opts)
  const headers: Record<string, string> = {}
  for (const h of req.headers) {
    headers[h.name] = interpolate(h.value, variables, opts)
  }
  const { body } = await resolveBody(req, variables, opts, baseDir)

  const controller = new AbortController()
  inflight.add(controller)
  const timer = config.timeoutMs > 0 ? setTimeout(() => controller.abort(), config.timeoutMs) : null
  const start = Date.now()
  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      redirect: config.followRedirects ? 'follow' : 'manual'
    })
    const text = await readBodyCapped(response)
    const durationMs = Date.now() - start
    const responseHeaders: Array<{ name: string; value: string }> = []
    response.headers.forEach((value, name) => {
      responseHeaders.push({ name, value })
    })
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: text,
      durationMs,
      url
    }
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    inflight.delete(controller)
  }
}

async function showResponse(
  response: Awaited<ReturnType<typeof executeRequest>>,
  previewResponseAs: 'auto' | 'raw' | 'json'
): Promise<void> {
  const formatted = formatResponse(response)
  let language: string
  if (previewResponseAs === 'raw') {
    language = 'http'
  } else if (previewResponseAs === 'json') {
    language = 'json'
  } else {
    language = inferLanguageFromContentType(findHeader(response.headers, 'content-type'))
  }
  const doc = await vscode.workspace.openTextDocument({ content: formatted, language })
  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside })
}

async function composeVariables(parsed: ParsedHttpFile, documentUri: vscode.Uri): Promise<Record<string, string>> {
  // File-level @vars win over environment variables.
  return { ...(await loadEnvironmentVariables(documentUri)), ...variablesAsRecord(parsed) }
}

/** Reads the `.env` file sitting next to the .http file, for {{$dotenv NAME}}. Empty when absent. */
async function loadDotenv(documentUri: vscode.Uri): Promise<Record<string, string>> {
  const envUri = vscode.Uri.file(path.join(path.dirname(documentUri.fsPath), '.env'))
  try {
    return parseDotenv(Buffer.from(await vscode.workspace.fs.readFile(envUri)).toString('utf8'))
  } catch {
    return {}
  }
}

/** Builds the interpolation options shared by execution and curl export. */
async function buildInterpolateOptions(documentUri: vscode.Uri): Promise<InterpolateOptions> {
  return {
    nextUuid: () => randomUUID(),
    processEnv: process.env,
    dotenv: await loadDotenv(documentUri)
  }
}

/**
 * Resolves a request body: an inline body is interpolated in place; a
 * `< path` / `<@ path` directive reads the file (relative to the .http file),
 * decodes it, and optionally interpolates `{{variables}}` inside it.
 */
async function resolveBody(
  req: HttpRequest,
  variables: Record<string, string>,
  opts: InterpolateOptions,
  baseDir: string
): Promise<{ body: string | undefined; fileRef: BodyFileRef | null; absolutePath?: string }> {
  if (!req.body || req.body.length === 0) {
    return { body: undefined, fileRef: null }
  }
  const fileRef = parseBodyFileRef(req.body)
  if (!fileRef) {
    return { body: interpolate(req.body, variables, opts), fileRef: null }
  }
  const absolutePath = path.isAbsolute(fileRef.path) ? fileRef.path : path.join(baseDir, fileRef.path)
  const fileUri = vscode.Uri.file(absolutePath)
  const stat = await vscode.workspace.fs.stat(fileUri)
  if (stat.size > MAX_RESPONSE_BYTES) {
    throw new Error(`Body file exceeds ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB — request aborted.`)
  }
  let text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString(fileRef.encoding)
  if (fileRef.interpolateVariables) {
    text = interpolate(text, variables, opts)
  }
  return { body: text, fileRef, absolutePath }
}

async function runAndShow(req: HttpRequest, parsed: ParsedHttpFile, documentUri: vscode.Uri): Promise<void> {
  const config = readConfig()
  const variables = await composeVariables(parsed, documentUri)
  const opts = await buildInterpolateOptions(documentUri)
  const baseDir = path.dirname(documentUri.fsPath)
  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${req.method} ${req.url}`,
        cancellable: false
      },
      () => executeRequest(req, variables, config, baseDir, opts)
    )
    await recordHistory(response, req.method)
    await showResponse(response, config.previewResponseAs)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      vscode.window.showWarningMessage('Toolkit: request aborted.')
      return
    }
    vscode.window.showWarningMessage(`Toolkit: request failed — ${(error as Error).message}`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Commands                                                                  */
/* -------------------------------------------------------------------------- */

async function sendAtCursor(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !isHttpFile(editor.document)) {
    vscode.window.showInformationMessage('Toolkit: open a .http or .rest file to send a request.')
    return
  }
  const parsed = parseHttpFile(editor.document.getText())
  const req = findRequestAtLine(parsed, editor.selection.active.line)
  if (!req) {
    vscode.window.showInformationMessage('Toolkit: place the cursor inside a request block.')
    return
  }
  await runAndShow(req, parsed, editor.document.uri)
}

async function sendByIndex(uriString: string, index: number): Promise<void> {
  const uri = vscode.Uri.parse(uriString)
  const document = await vscode.workspace.openTextDocument(uri)
  const parsed = parseHttpFile(document.getText())
  const req = parsed.requests[index]
  if (!req) {
    return
  }
  await runAndShow(req, parsed, uri)
}

async function copyCurlFor(req: HttpRequest, parsed: ParsedHttpFile, documentUri: vscode.Uri): Promise<void> {
  const variables = await composeVariables(parsed, documentUri)
  const opts = await buildInterpolateOptions(documentUri)
  const baseDir = path.dirname(documentUri.fsPath)

  // A raw `< path` body maps to curl's `--data @path` (curl reads the file), so
  // we don't read it ourselves. An interpolated `<@ path` body (and inline
  // bodies) are resolved to text and inlined.
  const fileRef = req.body ? parseBodyFileRef(req.body) : null
  let body = ''
  let bodyFile: string | undefined
  if (fileRef && !fileRef.interpolateVariables) {
    bodyFile = path.isAbsolute(fileRef.path) ? fileRef.path : path.join(baseDir, fileRef.path)
  } else {
    try {
      body = (await resolveBody(req, variables, opts, baseDir)).body ?? ''
    } catch (error) {
      vscode.window.showWarningMessage(`Toolkit: could not build curl — ${(error as Error).message}`)
      return
    }
  }

  const curl = buildCurl({
    method: req.method,
    url: interpolate(req.url, variables, opts),
    headers: req.headers.map(h => ({ name: h.name, value: interpolate(h.value, variables, opts) })),
    body,
    bodyFile
  })
  await vscode.env.clipboard.writeText(curl)
  vscode.window.showInformationMessage('Toolkit: curl command copied to the clipboard.')
}

async function copyAsCurl(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !isHttpFile(editor.document)) {
    vscode.window.showInformationMessage('Toolkit: open a .http or .rest file first.')
    return
  }
  const parsed = parseHttpFile(editor.document.getText())
  const req = findRequestAtLine(parsed, editor.selection.active.line)
  if (!req) {
    vscode.window.showInformationMessage('Toolkit: place the cursor inside a request block.')
    return
  }
  await copyCurlFor(req, parsed, editor.document.uri)
}

async function copyAsCurlByIndex(uriString: string, index: number): Promise<void> {
  const uri = vscode.Uri.parse(uriString)
  const document = await vscode.workspace.openTextDocument(uri)
  const parsed = parseHttpFile(document.getText())
  const req = parsed.requests[index]
  if (!req) {
    return
  }
  await copyCurlFor(req, parsed, uri)
}

async function sendAll(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !isHttpFile(editor.document)) {
    vscode.window.showInformationMessage('Toolkit: open a .http or .rest file first.')
    return
  }
  const parsed = parseHttpFile(editor.document.getText())
  if (parsed.requests.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no requests found.')
    return
  }
  for (const req of parsed.requests) {
    await runAndShow(req, parsed, editor.document.uri)
  }
}

function cancelAll(): void {
  if (inflight.size === 0) {
    vscode.window.showInformationMessage('Toolkit: no requests in flight.')
    return
  }
  for (const controller of inflight) {
    controller.abort()
  }
}

export function registerRestClientCommands(context: vscode.ExtensionContext): void {
  extensionContext = context

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: FILE_GLOB }, new HttpCodeLensProvider()),
    vscode.workspace.registerTextDocumentContentProvider(HISTORY_SCHEME, new HistoryContentProvider())
  )

  environmentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  environmentStatusBar.command = 'toolkit.restClient.selectEnvironment'
  context.subscriptions.push(
    environmentStatusBar,
    vscode.window.onDidChangeActiveTextEditor(() => updateEnvironmentStatusBar())
  )
  updateEnvironmentStatusBar()

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.restClient.send', () => sendAtCursor()),
    vscode.commands.registerCommand('toolkit.restClient.sendByIndex', (uri: string, index: number) =>
      sendByIndex(uri, index)
    ),
    vscode.commands.registerCommand('toolkit.restClient.sendAll', () => sendAll()),
    vscode.commands.registerCommand('toolkit.restClient.cancelAll', () => cancelAll()),
    vscode.commands.registerCommand('toolkit.restClient.selectEnvironment', () => selectEnvironment()),
    vscode.commands.registerCommand('toolkit.restClient.copyAsCurl', () => copyAsCurl()),
    vscode.commands.registerCommand('toolkit.restClient.copyAsCurlByIndex', (uri: string, index: number) =>
      copyAsCurlByIndex(uri, index)
    ),
    vscode.commands.registerCommand('toolkit.restClient.showHistory', () => showHistory()),
    vscode.commands.registerCommand('toolkit.restClient.diffHistory', () => diffHistory()),
    vscode.commands.registerCommand('toolkit.restClient.clearHistory', () => clearHistory())
  )
}
