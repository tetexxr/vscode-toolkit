import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import * as path from 'node:path'
import {
  buildCurl,
  environmentNames,
  findHeader,
  findRequestAtLine,
  formatResponse,
  inferLanguageFromContentType,
  interpolate,
  mergeEnvironmentVariables,
  parseEnvironmentFile,
  parseHttpFile,
  type EnvironmentFile,
  type HttpRequest,
  type ParsedHttpFile
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
/*  CodeLens                                                                  */
/* -------------------------------------------------------------------------- */

class HttpCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isHttpFile(document)) {
      return []
    }
    const parsed = parseHttpFile(document.getText())
    return parsed.requests.map((req, index) => {
      const range = new vscode.Range(req.startLine, 0, req.startLine, 0)
      return new vscode.CodeLens(range, {
        title: `$(play) Send Request${req.name && req.name !== `Request ${index + 1}` ? `: ${req.name}` : ''}`,
        command: 'toolkit.restClient.sendByIndex',
        arguments: [document.uri.toString(), index]
      })
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
  config: RestClientConfig
): Promise<{
  status: number
  statusText: string
  headers: Array<{ name: string; value: string }>
  body: string
  durationMs: number
}> {
  const url = interpolate(req.url, variables, { nextUuid: () => randomUUID() })
  const headers: Record<string, string> = {}
  for (const h of req.headers) {
    headers[h.name] = interpolate(h.value, variables, { nextUuid: () => randomUUID() })
  }
  let body: string | undefined
  if (req.body && req.body.length > 0) {
    body = interpolate(req.body, variables, { nextUuid: () => randomUUID() })
  }

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
      durationMs
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

async function runAndShow(req: HttpRequest, parsed: ParsedHttpFile, documentUri: vscode.Uri): Promise<void> {
  const config = readConfig()
  const variables = await composeVariables(parsed, documentUri)
  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${req.method} ${req.url}`,
        cancellable: false
      },
      () => executeRequest(req, variables, config)
    )
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
  const variables = await composeVariables(parsed, editor.document.uri)
  const opts = { nextUuid: () => randomUUID() }
  const curl = buildCurl({
    method: req.method,
    url: interpolate(req.url, variables, opts),
    headers: req.headers.map(h => ({ name: h.name, value: interpolate(h.value, variables, opts) })),
    body: interpolate(req.body, variables, opts)
  })
  await vscode.env.clipboard.writeText(curl)
  vscode.window.showInformationMessage('Toolkit: curl command copied to the clipboard.')
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
    vscode.languages.registerCodeLensProvider({ pattern: FILE_GLOB }, new HttpCodeLensProvider())
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
    vscode.commands.registerCommand('toolkit.restClient.copyAsCurl', () => copyAsCurl())
  )
}
