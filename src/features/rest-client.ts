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
  buildResponseDetailHtml,
  filterHistory,
  formatBytes,
  formatResponse,
  groupHistoryByRequest,
  historyEntryTiming,
  historyStatusKind,
  historyStatusLabel,
  inferLanguageFromContentType,
  interpolate,
  mergeEnvironmentVariables,
  parseBodyFileRef,
  parseDotenv,
  parseEnvironmentFile,
  parseHttpFile,
  summarizeGroupStatuses,
  truncateForHistory,
  type BodyFileRef,
  type EnvironmentFile,
  type HistoryStatusKind,
  type HttpRequest,
  type InterpolateOptions,
  type ParsedHttpFile,
  type RequestGroup,
  type ResolvedRequest,
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
  /** When false, request headers/body are not kept in history (re-send falls back to source). */
  storeRequest: boolean
  /** What clicking a history entry opens. */
  historyClickAction: 'editor' | 'panel'
}

function readConfig(): RestClientConfig {
  const config = vscode.workspace.getConfiguration('toolkit.restClient')
  return {
    timeoutMs: Math.max(0, config.get<number>('timeout', 30000)),
    followRedirects: config.get<boolean>('followRedirects', true),
    previewResponseAs: config.get<'auto' | 'raw' | 'json'>('previewResponseAs', 'auto'),
    storeRequest: config.get<boolean>('history.storeRequest', true),
    historyClickAction: config.get<'editor' | 'panel'>('history.clickAction', 'editor')
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

async function pushHistory(entry: ResponseHistoryEntry): Promise<void> {
  const max = historySize()
  if (max <= 0) {
    return
  }
  await extensionContext?.workspaceState.update(HISTORY_STATE_KEY, addHistoryEntry(getHistory(), entry, max))
  historyProvider?.refresh()
}

interface HistorySource {
  uri: string
  name: string
}

/** The request fields to persist, honoring the storeRequest privacy setting. */
function storedRequestFields(
  request: ResolvedRequest,
  config: RestClientConfig
): Pick<ResponseHistoryEntry, 'requestHeaders' | 'requestBody'> {
  if (!config.storeRequest) {
    return {}
  }
  const { body } = truncateForHistory(request.body ?? '', MAX_HISTORY_BODY_CHARS)
  return { requestHeaders: request.headers, requestBody: request.body !== undefined ? body : undefined }
}

async function recordHistory(
  response: FetchResult,
  request: ResolvedRequest,
  source: HistorySource,
  config: RestClientConfig
): Promise<ResponseHistoryEntry> {
  const { body, truncated } = truncateForHistory(response.body, MAX_HISTORY_BODY_CHARS)
  const entry: ResponseHistoryEntry = {
    id: randomUUID(),
    method: request.method,
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    durationMs: response.durationMs,
    timestamp: Date.now(),
    headers: response.headers,
    body,
    bodyTruncated: truncated,
    bodyBytes: Buffer.byteLength(response.body, 'utf-8'),
    source,
    ...storedRequestFields(request, config)
  }
  await pushHistory(entry)
  return entry
}

/** Records a request that never got an HTTP response (network error / timeout). */
async function recordFailure(
  request: ResolvedRequest,
  source: HistorySource,
  durationMs: number,
  message: string,
  config: RestClientConfig
): Promise<ResponseHistoryEntry> {
  const entry: ResponseHistoryEntry = {
    id: randomUUID(),
    method: request.method,
    url: request.url,
    status: 0,
    statusText: 'Request failed',
    durationMs,
    timestamp: Date.now(),
    headers: [],
    body: message,
    bodyTruncated: false,
    source,
    ...storedRequestFields(request, config),
    error: message
  }
  await pushHistory(entry)
  return entry
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

/* -------------------------------------------------------------------------- */
/*  Response preview (read-only virtual docs — no "save?" prompt on close)    */
/* -------------------------------------------------------------------------- */

const RESPONSE_SCHEME = 'toolkit-rest-response'
const RESPONSE_CACHE_MAX = 50

/**
 * Serves formatted responses as read-only virtual documents. Unlike an untitled
 * document seeded with content, these are never "dirty", so closing the tab
 * doesn't prompt to save. Content is cached per URI with bounded FIFO eviction.
 */
class ResponsePreviewProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>()
  private emitter = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this.emitter.event

  set(uri: vscode.Uri, content: string): void {
    const key = uri.toString()
    this.cache.delete(key)
    this.cache.set(key, content)
    while (this.cache.size > RESPONSE_CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
    this.emitter.fire(uri)
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? ''
  }
}

const responsePreviewProvider = new ResponsePreviewProvider()
/** Monotonic id so each opened response gets its own virtual URI (no collisions). */
let responsePreviewSeq = 0

/** File extension matching an editor language, for the preview tab title. */
function extensionForLanguage(language: string): string {
  switch (language) {
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
    case 'http':
      return 'http'
    default:
      return 'txt'
  }
}

type HistoryItem = vscode.QuickPickItem & { entry: ResponseHistoryEntry }

function historyIcon(entry: ResponseHistoryEntry): string {
  if (entry.error) {
    return '$(error)'
  }
  if (entry.status >= 400) {
    return '$(warning)'
  }
  return '$(arrow-small-right)'
}

function historyQuickPickItems(history: ResponseHistoryEntry[]): HistoryItem[] {
  return history.map(entry => {
    const { label, description } = describeHistoryEntry(entry)
    return { label: `${historyIcon(entry)} ${label}`, description, entry }
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
  await openEntryPreferred(picked.entry)
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
  historyProvider?.refresh()
  syncDetailPanel()
  vscode.window.showInformationMessage('Toolkit: REST Client response history cleared.')
}

/* -------------------------------------------------------------------------- */
/*  Response history — tree view (sidebar)                                    */
/* -------------------------------------------------------------------------- */

const HISTORY_VIEW_ID = 'toolkitRestHistory'
const HISTORY_GROUP_BY_KEY = 'toolkit.restClient.history.groupBy'
/** Context key mirrored for the view-title toggle buttons' `when` clauses. */
const HISTORY_GROUP_BY_CONTEXT = 'toolkitRestHistoryGroupBy'

/** `request` collapses repeated calls to one endpoint together; `flat` is a plain timeline. */
type HistoryGroupBy = 'request' | 'flat'

function historyGroupBy(): HistoryGroupBy {
  return extensionContext?.workspaceState.get<HistoryGroupBy>(HISTORY_GROUP_BY_KEY, 'request') ?? 'request'
}

async function setHistoryGroupBy(mode: HistoryGroupBy): Promise<void> {
  await extensionContext?.workspaceState.update(HISTORY_GROUP_BY_KEY, mode)
  await vscode.commands.executeCommand('setContext', HISTORY_GROUP_BY_CONTEXT, mode)
  historyProvider?.refresh()
}

const HISTORY_FILTER_KEY = 'toolkit.restClient.history.filter'
/** Context key driving the filter/clear-filter view-title buttons' `when` clauses. */
const HISTORY_FILTER_CONTEXT = 'toolkitRestHistoryFiltered'
let historyView: vscode.TreeView<HistoryNode> | undefined

function historyFilter(): string {
  return extensionContext?.workspaceState.get<string>(HISTORY_FILTER_KEY, '') ?? ''
}

/** Stores the active filter, reflects it in a context key + a banner, and refreshes the tree. */
async function setHistoryFilter(value: string): Promise<void> {
  const filter = value.trim()
  await extensionContext?.workspaceState.update(HISTORY_FILTER_KEY, filter)
  await vscode.commands.executeCommand('setContext', HISTORY_FILTER_CONTEXT, filter.length > 0)
  if (historyView) {
    historyView.message = filter ? `Filter: ${filter}` : undefined
  }
  historyProvider?.refresh()
}

/** Prompts for a filter (method / URL / status terms, AND-ed). */
async function promptHistoryFilter(): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: 'Filter response history',
    prompt: 'Match by method, URL or status — space-separated terms are combined (e.g. "POST users" or "500").',
    value: historyFilter(),
    placeHolder: 'e.g. POST users · 404 · api.example.com'
  })
  if (value === undefined) {
    return
  }
  await setHistoryFilter(value)
}

/** A request group (parent) or a single response (leaf). */
type HistoryNode =
  | { kind: 'group'; group: RequestGroup }
  | { kind: 'entry'; entry: ResponseHistoryEntry; showRequest: boolean }

/** Codicon + theme color per status bucket, so a glance at the tree reads pass/warn/fail. */
const STATUS_ICON: Record<HistoryStatusKind, { icon: string; color: string }> = {
  success: { icon: 'pass', color: 'testing.iconPassed' },
  redirect: { icon: 'arrow-right', color: 'charts.blue' },
  clientError: { icon: 'warning', color: 'charts.yellow' },
  serverError: { icon: 'error', color: 'charts.red' },
  failed: { icon: 'error', color: 'errorForeground' }
}

class RestHistoryTreeProvider implements vscode.TreeDataProvider<HistoryNode> {
  private emitter = new vscode.EventEmitter<HistoryNode | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  refresh(): void {
    this.emitter.fire()
  }

  getTreeItem(node: HistoryNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const { method, url, entries } = node.group
      const item = new vscode.TreeItem(`${method} ${url}`, vscode.TreeItemCollapsibleState.Expanded)
      item.description = `${entries.length}× · ${summarizeGroupStatuses(entries)}`
      item.iconPath = new vscode.ThemeIcon('globe')
      item.tooltip = new vscode.MarkdownString(
        `**${method}** \`${url}\`\n\n${entries.length} response(s) — ${summarizeGroupStatuses(entries)}`
      )
      item.contextValue = 'restHistoryGroup'
      return item
    }
    const { entry, showRequest } = node
    const kind = historyStatusKind(entry)
    const { icon, color } = STATUS_ICON[kind]
    const size = formatBytes(entry.bodyBytes)
    const timing = size ? `${historyEntryTiming(entry)} · ${size}` : historyEntryTiming(entry)
    const item = new vscode.TreeItem(
      showRequest ? `${entry.method} ${entry.url}` : historyStatusLabel(entry),
      vscode.TreeItemCollapsibleState.None
    )
    item.description = showRequest ? `${historyStatusLabel(entry)} · ${timing}` : timing
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color))
    item.tooltip = new vscode.MarkdownString(
      `**${entry.method}** \`${entry.url}\`\n\n${historyStatusLabel(entry)} · ${timing}`
    )
    item.command = {
      title: 'Open Response',
      command: 'toolkit.restClient.history.open',
      arguments: [entry.id]
    }
    // Only entries that have an earlier call to the same endpoint can be diffed,
    // so flag those with a distinct contextValue to drive the inline diff icon.
    item.contextValue = hasPreviousResponse(entry) ? 'restHistoryEntryWithPrevious' : 'restHistoryEntry'
    return item
  }

  getChildren(parent?: HistoryNode): HistoryNode[] {
    if (!parent) {
      const history = filterHistory(getHistory(), historyFilter())
      if (history.length === 0) {
        return []
      }
      if (historyGroupBy() === 'flat') {
        return history.map<HistoryNode>(entry => ({ kind: 'entry', entry, showRequest: true }))
      }
      return groupHistoryByRequest(history).map<HistoryNode>(group => ({ kind: 'group', group }))
    }
    if (parent.kind === 'group') {
      return parent.group.entries.map<HistoryNode>(entry => ({ kind: 'entry', entry, showRequest: false }))
    }
    return []
  }
}

let historyProvider: RestHistoryTreeProvider | undefined

function entryById(id: string): ResponseHistoryEntry | undefined {
  return getHistory().find(e => e.id === id)
}

/** The entry behind a tree node (commands invoked from the tree receive the node). */
function nodeEntry(node: HistoryNode | undefined): ResponseHistoryEntry | undefined {
  return node && node.kind === 'entry' ? node.entry : undefined
}

/**
 * Opens the entry in a read-only preview tab. Stable key (the entry id) + preview
 * mode + preserved focus means clicking around the history reuses a single side
 * tab instead of stacking one per click; double-click pins it (native behavior).
 */
async function openHistoryAsText(entry: ResponseHistoryEntry): Promise<void> {
  await showResponse(entry, {
    previewResponseAs: readConfig().previewResponseAs,
    stableKey: entry.id,
    preview: true,
    preserveFocus: true
  })
}

/** Opens an entry per the configured action (detail panel by default, or text editor). */
async function openEntryPreferred(entry: ResponseHistoryEntry): Promise<void> {
  if (readConfig().historyClickAction === 'panel') {
    showDetailPanel(entry)
  } else {
    await openHistoryAsText(entry)
  }
}

/** Click handler from the tree: opens the entry (looked up by id) per the setting. */
async function openHistoryEntry(id: string): Promise<void> {
  const entry = entryById(id)
  if (!entry) {
    return
  }
  await openEntryPreferred(entry)
}

/* ---- Re-send -------------------------------------------------------------- */

/** Rebuilds the resolved request stored alongside an entry, if any. */
function resolvedFromEntry(entry: ResponseHistoryEntry): ResolvedRequest | undefined {
  if (entry.requestHeaders === undefined && entry.requestBody === undefined) {
    return undefined
  }
  return { method: entry.method, url: entry.url, headers: entry.requestHeaders ?? [], body: entry.requestBody }
}

/** Re-runs a request from history: replays the stored request, or re-runs from source. */
async function resendEntry(entry: ResponseHistoryEntry): Promise<void> {
  const resolved = resolvedFromEntry(entry)
  if (resolved) {
    const source: HistorySource = entry.source ?? { uri: '', name: entry.method }
    await sendResolved(resolved, source, readConfig(), 'preferred')
    return
  }
  // No stored request (storeRequest disabled, or a pre-upgrade entry): re-run the
  // original request from its source file, which re-interpolates current values.
  if (!entry.source?.uri) {
    vscode.window.showWarningMessage(
      'Toolkit: no stored request to re-send. Enable "toolkit.restClient.history.storeRequest" and send again.'
    )
    return
  }
  const req = await findSourceRequest(entry)
  if (!req) {
    vscode.window.showWarningMessage('Toolkit: could not find the original request to re-send.')
    return
  }
  await runAndShow(req.request, req.parsed, req.uri)
}

/** Locates the request that produced an entry, by name (falling back to method). */
async function findSourceRequest(
  entry: ResponseHistoryEntry
): Promise<{ request: HttpRequest; parsed: ParsedHttpFile; uri: vscode.Uri } | undefined> {
  if (!entry.source?.uri) {
    return undefined
  }
  try {
    const uri = vscode.Uri.parse(entry.source.uri)
    const document = await vscode.workspace.openTextDocument(uri)
    const parsed = parseHttpFile(document.getText())
    const request =
      parsed.requests.find(r => r.name === entry.source?.name) ??
      parsed.requests.find(r => r.method === entry.method)
    return request ? { request, parsed, uri } : undefined
  } catch {
    return undefined
  }
}

/* ---- Quick actions -------------------------------------------------------- */

async function copyHistoryCurl(entry: ResponseHistoryEntry): Promise<void> {
  const curl = buildCurl({
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders ?? [],
    body: entry.requestBody ?? ''
  })
  await vscode.env.clipboard.writeText(curl)
  vscode.window.showInformationMessage('Toolkit: curl command copied to the clipboard.')
}

async function copyHistoryBody(entry: ResponseHistoryEntry): Promise<void> {
  await vscode.env.clipboard.writeText(entry.body)
  vscode.window.showInformationMessage('Toolkit: response body copied to the clipboard.')
}

async function copyHistoryUrl(entry: ResponseHistoryEntry): Promise<void> {
  await vscode.env.clipboard.writeText(entry.url)
  vscode.window.showInformationMessage('Toolkit: request URL copied to the clipboard.')
}

async function saveHistoryBody(entry: ResponseHistoryEntry): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    saveLabel: 'Save response body',
    defaultUri: vscode.Uri.file(`response-${entry.status || 'failed'}.${historyExtension(entry)}`)
  })
  if (!target) {
    return
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(entry.body, 'utf-8'))
  vscode.window.showInformationMessage('Toolkit: response body saved.')
}

async function goToHistorySource(entry: ResponseHistoryEntry): Promise<void> {
  const found = await findSourceRequest(entry)
  if (!found) {
    vscode.window.showInformationMessage('Toolkit: the original request could not be located.')
    return
  }
  const line = found.request.startLine
  await vscode.window.showTextDocument(found.uri, { selection: new vscode.Range(line, 0, line, 0) })
}

/* ---- Detail panel (webview) ----------------------------------------------- */

const DETAIL_VIEW_TYPE = 'toolkit.restResponseDetail'
let detailPanel: vscode.WebviewPanel | undefined
/** Entry currently shown in the panel, so its buttons act on the right response. */
let detailEntryId: string | undefined

/** Opens (or reuses) the response detail webview for an entry. */
function showDetailPanel(entry: ResponseHistoryEntry): void {
  detailEntryId = entry.id
  if (!detailPanel) {
    detailPanel = vscode.window.createWebviewPanel(
      DETAIL_VIEW_TYPE,
      'REST Response',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    )
    detailPanel.onDidDispose(() => {
      detailPanel = undefined
      detailEntryId = undefined
    })
    detailPanel.webview.onDidReceiveMessage(async (msg: { command?: string }) => {
      const current = detailEntryId ? entryById(detailEntryId) : undefined
      if (!current) {
        return
      }
      switch (msg.command) {
        case 'resend':
          await resendEntry(current)
          break
        case 'copyCurl':
          await copyHistoryCurl(current)
          break
        case 'copyBody':
          await copyHistoryBody(current)
          break
        case 'openText':
          await openHistoryAsText(current)
          break
      }
    })
  }
  detailPanel.title = `${entry.method} ${entry.error ? 'ERR' : entry.status}`
  detailPanel.webview.html = buildResponseDetailHtml(entry, {
    cspSource: detailPanel.webview.cspSource,
    nonce: randomUUID().replace(/-/g, '')
  })
  detailPanel.reveal(vscode.ViewColumn.Beside, true)
}

/** Closes the detail panel if the entry it shows was deleted or the history cleared. */
function syncDetailPanel(): void {
  if (detailPanel && detailEntryId && !entryById(detailEntryId)) {
    detailPanel.dispose()
  }
}

/** Deletes one entry from the history (invoked from the tree's inline trash icon). */
async function deleteHistoryEntry(node: HistoryNode | undefined): Promise<void> {
  const entry = nodeEntry(node)
  if (!entry) {
    return
  }
  const remaining = getHistory().filter(e => e.id !== entry.id)
  await extensionContext?.workspaceState.update(HISTORY_STATE_KEY, remaining)
  historyProvider?.refresh()
  syncDetailPanel()
}

/**
 * The previous call to the same endpoint, if any. History is newest-first, so
 * the previous response is the next older entry sharing the same method + URL.
 */
function previousResponse(entry: ResponseHistoryEntry): ResponseHistoryEntry | undefined {
  const sameEndpoint = getHistory().filter(e => e.method === entry.method && e.url === entry.url)
  const index = sameEndpoint.findIndex(e => e.id === entry.id)
  return index >= 0 ? sameEndpoint[index + 1] : undefined
}

function hasPreviousResponse(entry: ResponseHistoryEntry): boolean {
  return previousResponse(entry) !== undefined
}

/** Diffs a response against the previous call to the *same* endpoint, if any. */
async function diffHistoryWithPrevious(node: HistoryNode | undefined): Promise<void> {
  if (!node || node.kind !== 'entry') {
    return
  }
  const current = node.entry
  const previous = previousResponse(current)
  if (!previous) {
    vscode.window.showInformationMessage('Toolkit: no earlier response for this request to diff against.')
    return
  }
  await vscode.commands.executeCommand(
    'vscode.diff',
    historyUri(previous),
    historyUri(current),
    `REST history: ${previous.method} ${previous.status} ↔ ${current.status}`
  )
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

interface FetchResult {
  status: number
  statusText: string
  headers: Array<{ name: string; value: string }>
  body: string
  durationMs: number
  url: string
}

/** Interpolates a parsed request into a concrete one ready to send (or store). */
async function resolveRequest(
  req: HttpRequest,
  variables: Record<string, string>,
  opts: InterpolateOptions,
  baseDir: string
): Promise<ResolvedRequest> {
  const url = interpolate(req.url, variables, opts)
  const headers = req.headers.map(h => ({ name: h.name, value: interpolate(h.value, variables, opts) }))
  const { body } = await resolveBody(req, variables, opts, baseDir)
  return { method: req.method, url, headers, body }
}

/** Sends an already-resolved request, honoring the timeout / cancellation contract. */
async function performFetch(
  request: ResolvedRequest,
  config: RestClientConfig,
  token?: vscode.CancellationToken
): Promise<FetchResult> {
  const headers: Record<string, string> = {}
  for (const h of request.headers) {
    headers[h.name] = h.value
  }

  const controller = new AbortController()
  inflight.add(controller)
  // A timeout and a user cancellation both abort the same controller; the flag
  // lets the catch below tell them apart (timeouts are surfaced and recorded;
  // cancellations are silent).
  let timedOut = false
  const timer =
    config.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, config.timeoutMs)
      : null
  const cancelSub = token?.onCancellationRequested(() => controller.abort())
  const start = Date.now()
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body,
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
      url: request.url
    }
  } catch (error) {
    // Turn a timeout abort into a clear, non-abort error so callers report it
    // as a real failure (and record it) instead of a silent cancellation.
    if (timedOut) {
      throw new Error(`Request timed out after ${config.timeoutMs} ms`)
    }
    throw error
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    cancelSub?.dispose()
    inflight.delete(controller)
  }
}

interface ShowResponseOptions {
  previewResponseAs: 'auto' | 'raw' | 'json'
  /**
   * Stable identity for the preview URI. Reopening with the same key reuses the
   * same virtual document (and tab) instead of spawning a new one. Defaults to a
   * fresh sequence number, so every call opens its own tab.
   */
  stableKey?: string
  /** Open as a preview tab (italic, replaced by the next preview) rather than a pinned one. */
  preview?: boolean
  /**
   * Keep focus where it is (e.g. the history tree) instead of moving it to the
   * opened response. This matters with `Beside`: if focus jumped to the response,
   * its column would become active and the next `Beside` open would land one
   * column further right — a new tab every click. Preserving focus keeps the
   * active column stable so the side column (and its preview tab) is reused.
   */
  preserveFocus?: boolean
}

async function showResponse(
  response: FetchResult,
  options: ShowResponseOptions
): Promise<void> {
  const formatted = formatResponse(response)
  let language: string
  if (options.previewResponseAs === 'raw') {
    language = 'http'
  } else if (options.previewResponseAs === 'json') {
    language = 'json'
  } else {
    language = inferLanguageFromContentType(findHeader(response.headers, 'content-type'))
  }
  // Read-only virtual document: never dirty, so closing it won't prompt to save.
  const uri = vscode.Uri.from({
    scheme: RESPONSE_SCHEME,
    path: `/${response.status} ${response.statusText}`.trimEnd() + `.${extensionForLanguage(language)}`,
    query: options.stableKey ?? String(responsePreviewSeq++)
  })
  responsePreviewProvider.set(uri, formatted)
  const doc = await vscode.workspace.openTextDocument(uri)
  if (doc.languageId !== language) {
    await vscode.languages.setTextDocumentLanguage(doc, language)
  }
  // Beside keeps the response next to the .http file; a single side column is
  // reused across calls (it isn't re-split per open).
  await vscode.window.showTextDocument(doc, {
    preview: options.preview ?? false,
    preserveFocus: options.preserveFocus ?? false,
    viewColumn: vscode.ViewColumn.Beside
  })
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
  const source: HistorySource = { uri: documentUri.toString(), name: req.name }
  let resolved: ResolvedRequest
  try {
    resolved = await resolveRequest(req, variables, opts, baseDir)
  } catch (error) {
    vscode.window.showWarningMessage(`Toolkit: could not build request — ${(error as Error).message}`)
    return
  }
  await sendResolved(resolved, source, config)
}

/**
 * How a freshly-sent response is shown:
 * - `live` opens the full response as text (used by Send Request — immediate,
 *   not body-capped, with native highlighting/find).
 * - `preferred` opens the recorded entry per the history click action (panel or
 *   editor), so re-sending from the history reuses the same surface.
 */
type SendDisplay = 'live' | 'preferred'

/**
 * Sends a resolved request with a progress notification, records it (success or
 * failure) in the history, and opens the response. Shared by the initial send
 * and by re-send from the history.
 */
async function sendResolved(
  resolved: ResolvedRequest,
  source: HistorySource,
  config: RestClientConfig,
  display: SendDisplay = 'live'
): Promise<void> {
  const start = Date.now()
  try {
    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${resolved.method} ${resolved.url}`,
        cancellable: true
      },
      (_progress, token) => performFetch(resolved, config, token)
    )
    const entry = await recordHistory(response, resolved, source, config)
    if (display === 'preferred') {
      await openEntryPreferred(entry)
    } else {
      await showResponse(response, { previewResponseAs: config.previewResponseAs })
    }
  } catch (error) {
    const message = (error as Error).message
    if ((error as Error).name === 'AbortError') {
      vscode.window.showWarningMessage('Toolkit: request aborted.')
      return
    }
    // A failed request (DNS, refused, timeout, …) is still worth keeping in the
    // history so it can be reviewed or diffed later.
    const entry = await recordFailure(resolved, source, Date.now() - start, message, config)
    vscode.window.showWarningMessage(`Toolkit: request failed — ${message}`)
    if (display === 'preferred') {
      await openEntryPreferred(entry)
    }
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
    vscode.workspace.registerTextDocumentContentProvider(HISTORY_SCHEME, new HistoryContentProvider()),
    vscode.workspace.registerTextDocumentContentProvider(RESPONSE_SCHEME, responsePreviewProvider)
  )

  environmentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  environmentStatusBar.command = 'toolkit.restClient.selectEnvironment'
  context.subscriptions.push(
    environmentStatusBar,
    vscode.window.onDidChangeActiveTextEditor(() => updateEnvironmentStatusBar())
  )
  updateEnvironmentStatusBar()

  historyProvider = new RestHistoryTreeProvider()
  historyView = vscode.window.createTreeView<HistoryNode>(HISTORY_VIEW_ID, {
    treeDataProvider: historyProvider
  })
  context.subscriptions.push(historyView)
  void vscode.commands.executeCommand('setContext', HISTORY_GROUP_BY_CONTEXT, historyGroupBy())
  // Restore the persisted filter (context key + banner) on activation.
  void setHistoryFilter(historyFilter())

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
    vscode.commands.registerCommand('toolkit.restClient.clearHistory', () => clearHistory()),
    vscode.commands.registerCommand('toolkit.restClient.history.open', (id: string) => openHistoryEntry(id)),
    vscode.commands.registerCommand('toolkit.restClient.history.refresh', () => historyProvider?.refresh()),
    vscode.commands.registerCommand('toolkit.restClient.history.groupByRequest', () => setHistoryGroupBy('request')),
    vscode.commands.registerCommand('toolkit.restClient.history.groupByFlat', () => setHistoryGroupBy('flat')),
    vscode.commands.registerCommand('toolkit.restClient.history.filter', () => promptHistoryFilter()),
    vscode.commands.registerCommand('toolkit.restClient.history.clearFilter', () => setHistoryFilter('')),
    vscode.commands.registerCommand('toolkit.restClient.history.deleteEntry', (node?: HistoryNode) =>
      deleteHistoryEntry(node)
    ),
    vscode.commands.registerCommand('toolkit.restClient.history.diffWithPrevious', (node?: HistoryNode) =>
      diffHistoryWithPrevious(node)
    ),
    vscode.commands.registerCommand('toolkit.restClient.history.resend', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? resendEntry(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.openPanel', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      if (entry) {
        showDetailPanel(entry)
      }
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.openText', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? openHistoryAsText(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.copyCurl', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? copyHistoryCurl(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.copyBody', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? copyHistoryBody(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.copyUrl', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? copyHistoryUrl(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.saveBody', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? saveHistoryBody(entry) : undefined
    }),
    vscode.commands.registerCommand('toolkit.restClient.history.goToSource', (node?: HistoryNode) => {
      const entry = nodeEntry(node)
      return entry ? goToHistorySource(entry) : undefined
    }),
    {
      dispose: () => {
        detailPanel?.dispose()
      }
    }
  )
}
