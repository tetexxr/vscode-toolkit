import * as vscode from 'vscode'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  contentHash,
  formatAge,
  formatSize,
  historyKey,
  isDuplicateOfLatest,
  makeRevisionId,
  pruneRevisions,
  type FileHistory,
  type RevisionMeta
} from './local-history-utils'
import { logError } from '../../utils/logger'

const VIEW_ID = 'toolkitLocalHistory'
const SCHEME = 'toolkit-localhistory'
const STORAGE_DIR = 'local-history'

interface Config {
  enabled: boolean
  maxRevisionsPerFile: number
  maxAgeDays: number
  maxFileSizeKB: number
  exclude: string[]
}

const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/bin/**',
  '**/obj/**',
  '**/out/**',
  '**/*.min.*'
]

function readConfig(): Config {
  const config = vscode.workspace.getConfiguration('toolkit.localHistory')
  return {
    enabled: config.get<boolean>('enabled', true),
    maxRevisionsPerFile: Math.max(0, config.get<number>('maxRevisionsPerFile', 50)),
    maxAgeDays: Math.max(0, config.get<number>('maxAgeDays', 30)),
    maxFileSizeKB: Math.max(1, config.get<number>('maxFileSizeKB', 1024)),
    exclude: config.get<string[]>('exclude', DEFAULT_EXCLUDE)
  }
}

/* -------------------------------------------------------------------------- */
/*  Store — disk-backed, one folder per file under globalStorage              */
/* -------------------------------------------------------------------------- */

/**
 * Persists revisions under `globalStorage/local-history/<key>/`: an `index.json`
 * with the metadata and one gzipped `<id>.gz` per revision. An in-memory cache
 * of the per-file index avoids re-reading it on every active-editor switch.
 */
class LocalHistoryStore {
  private readonly root: vscode.Uri
  private readonly cache = new Map<string, FileHistory>()
  private counter = 0

  constructor(globalStorage: vscode.Uri) {
    this.root = vscode.Uri.joinPath(globalStorage, STORAGE_DIR)
  }

  private dir(key: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root, key)
  }

  private indexUri(key: string): vscode.Uri {
    return vscode.Uri.joinPath(this.dir(key), 'index.json')
  }

  private contentUri(key: string, id: string): vscode.Uri {
    return vscode.Uri.joinPath(this.dir(key), `${id}.gz`)
  }

  private async load(uriString: string): Promise<FileHistory> {
    const key = historyKey(uriString)
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }
    let history: FileHistory = { uri: uriString, revisions: [] }
    try {
      const bytes = await vscode.workspace.fs.readFile(this.indexUri(key))
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as FileHistory
      if (parsed && Array.isArray(parsed.revisions)) {
        history = { uri: uriString, revisions: parsed.revisions }
      }
    } catch {
      // No index yet (or unreadable) — start fresh.
    }
    this.cache.set(key, history)
    return history
  }

  private async persist(key: string, history: FileHistory): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.dir(key))
    await vscode.workspace.fs.writeFile(
      this.indexUri(key),
      Buffer.from(JSON.stringify(history), 'utf8')
    )
  }

  /** Returns the revisions for a file, newest first. */
  async list(uriString: string): Promise<RevisionMeta[]> {
    return (await this.load(uriString)).revisions
  }

  /** Reads back the content of a single revision. */
  async read(uriString: string, id: string): Promise<string> {
    const key = historyKey(uriString)
    const bytes = await vscode.workspace.fs.readFile(this.contentUri(key, id))
    return zlib.gunzipSync(Buffer.from(bytes)).toString('utf8')
  }

  /**
   * Stores a new revision for `uriString` unless the content matches the latest
   * one. Applies the count/age limits afterwards, deleting any evicted content
   * files. Returns true when a revision was actually written.
   */
  async snapshot(uriString: string, content: string, options: Config, now: number): Promise<boolean> {
    const key = historyKey(uriString)
    const history = await this.load(uriString)
    const hash = contentHash(content)
    if (isDuplicateOfLatest(history.revisions, hash)) {
      return false
    }
    const id = makeRevisionId(now, this.counter++)
    const size = Buffer.byteLength(content, 'utf8')
    await vscode.workspace.fs.createDirectory(this.dir(key))
    await vscode.workspace.fs.writeFile(this.contentUri(key, id), zlib.gzipSync(Buffer.from(content, 'utf8')))

    const revisions = [{ id, timestamp: now, size, hash }, ...history.revisions]
    const { kept, removed } = pruneRevisions(
      revisions,
      { maxRevisions: options.maxRevisionsPerFile, maxAgeMs: options.maxAgeDays * 24 * 60 * 60 * 1000 },
      now
    )
    history.revisions = kept
    this.cache.set(key, history)
    await this.persist(key, history)
    await this.deleteContents(key, removed)
    return true
  }

  /** Removes a single revision and its content file. */
  async deleteRevision(uriString: string, id: string): Promise<void> {
    const key = historyKey(uriString)
    const history = await this.load(uriString)
    const removed = history.revisions.filter(r => r.id === id)
    history.revisions = history.revisions.filter(r => r.id !== id)
    this.cache.set(key, history)
    await this.persist(key, history)
    await this.deleteContents(key, removed)
  }

  /** Removes every revision for a file. */
  async clear(uriString: string): Promise<void> {
    const key = historyKey(uriString)
    this.cache.set(key, { uri: uriString, revisions: [] })
    try {
      await vscode.workspace.fs.delete(this.dir(key), { recursive: true, useTrash: false })
    } catch {
      // Nothing stored yet — fine.
    }
  }

  private async deleteContents(key: string, revisions: RevisionMeta[]): Promise<void> {
    for (const rev of revisions) {
      try {
        await vscode.workspace.fs.delete(this.contentUri(key, rev.id), { useTrash: false })
      } catch (err) {
        logError('local-history:delete', err)
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Diff content provider                                                     */
/* -------------------------------------------------------------------------- */

function buildDiffUri(fileUri: vscode.Uri, rev: RevisionMeta): vscode.Uri {
  // Path → /<basename> so VS Code derives the language; the file URI and id
  // travel in the query so the provider can read the right revision back.
  return vscode.Uri.from({
    scheme: SCHEME,
    path: '/' + path.basename(fileUri.path),
    query: `${encodeURIComponent(fileUri.toString())}|${rev.id}`
  })
}

class RevisionContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly store: LocalHistoryStore) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [encodedUri, id] = uri.query.split('|')
    if (!encodedUri || !id) {
      return ''
    }
    try {
      return await this.store.read(decodeURIComponent(encodedUri), id)
    } catch (err) {
      logError('local-history:read', err)
      return ''
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Tree view — revisions of the active file                                  */
/* -------------------------------------------------------------------------- */

interface RevisionNode {
  fileUri: vscode.Uri
  rev: RevisionMeta
}

class LocalHistoryProvider implements vscode.TreeDataProvider<RevisionNode> {
  private currentUri: vscode.Uri | undefined
  private revisions: RevisionMeta[] = []
  private emitter = new vscode.EventEmitter<RevisionNode | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(private readonly store: LocalHistoryStore) {}

  getCurrentUri(): vscode.Uri | undefined {
    return this.currentUri
  }

  hasRevisions(): boolean {
    return this.revisions.length > 0
  }

  /** Points the view at a file and reloads its revisions. */
  async setActive(uri: vscode.Uri | undefined): Promise<void> {
    // Ignore editors that aren't real files (the virtual revision side of a diff,
    // output panes, etc.) and no-op when the file hasn't actually changed. This
    // keeps the last file's history on screen and, crucially, stops opening a diff
    // for the active file from rebuilding the whole tree — which looked like a flicker.
    if (!uri || uri.scheme !== 'file' || uri.toString() === this.currentUri?.toString()) {
      return
    }
    this.currentUri = uri
    await this.reload()
  }

  /** Re-reads the current file's revisions from the store. */
  async reload(): Promise<void> {
    this.revisions = this.currentUri ? await this.store.list(this.currentUri.toString()) : []
    this.emitter.fire()
  }

  getTreeItem(node: RevisionNode): vscode.TreeItem {
    const now = Date.now()
    const item = new vscode.TreeItem(formatAge(node.rev.timestamp, now), vscode.TreeItemCollapsibleState.None)
    item.description = `${new Date(node.rev.timestamp).toLocaleString()} · ${formatSize(node.rev.size)}`
    item.tooltip = new vscode.MarkdownString(
      `**${path.basename(node.fileUri.path)}**\n\n${new Date(node.rev.timestamp).toLocaleString()} · ${formatSize(node.rev.size)}`
    )
    item.iconPath = new vscode.ThemeIcon('history')
    item.contextValue = 'revision'
    item.command = {
      title: 'Open Diff',
      command: 'toolkit.localHistory.openDiff',
      arguments: [node]
    }
    return item
  }

  getChildren(parent?: RevisionNode): RevisionNode[] {
    if (parent || !this.currentUri) {
      return []
    }
    const fileUri = this.currentUri
    return this.revisions.map(rev => ({ fileUri, rev }))
  }
}

/* -------------------------------------------------------------------------- */
/*  Snapshot eligibility                                                      */
/* -------------------------------------------------------------------------- */

function isExcluded(document: vscode.TextDocument, cfg: Config): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (!folder) {
    return true
  }
  return cfg.exclude.some(
    glob => vscode.languages.match({ pattern: new vscode.RelativePattern(folder, glob) }, document) > 0
  )
}

function shouldSnapshot(document: vscode.TextDocument, cfg: Config): boolean {
  if (!cfg.enabled || document.uri.scheme !== 'file') {
    return false
  }
  if (Buffer.byteLength(document.getText(), 'utf8') > cfg.maxFileSizeKB * 1024) {
    return false
  }
  return !isExcluded(document, cfg)
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

async function openDiff(node: RevisionNode): Promise<void> {
  const leftUri = buildDiffUri(node.fileUri, node.rev)
  const title = `${path.basename(node.fileUri.path)} (${formatAge(node.rev.timestamp, Date.now())}) ↔ Current`
  await vscode.commands.executeCommand('vscode.diff', leftUri, node.fileUri, title)
}

async function restore(store: LocalHistoryStore, cfg: Config, node: RevisionNode): Promise<void> {
  const fileName = path.basename(node.fileUri.path)
  const choice = await vscode.window.showWarningMessage(
    `Restore "${fileName}" to the revision from ${formatAge(node.rev.timestamp, Date.now())}? This overwrites the current file contents.`,
    { modal: true },
    'Restore'
  )
  if (choice !== 'Restore') {
    return
  }
  const content = await store.read(node.fileUri.toString(), node.rev.id)
  const document = await vscode.workspace.openTextDocument(node.fileUri)
  // Snapshot the current state first so the restore is itself reversible.
  if (shouldSnapshot(document, cfg)) {
    await store.snapshot(node.fileUri.toString(), document.getText(), cfg, Date.now())
  }
  const edit = new vscode.WorkspaceEdit()
  const fullRange = new vscode.Range(0, 0, document.lineCount, 0)
  edit.replace(node.fileUri, fullRange, content)
  await vscode.workspace.applyEdit(edit)
  await vscode.window.showTextDocument(document)
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerLocalHistoryCommands(context: vscode.ExtensionContext): void {
  const store = new LocalHistoryStore(context.globalStorageUri)
  const provider = new LocalHistoryProvider(store)
  const treeView = vscode.window.createTreeView<RevisionNode>(VIEW_ID, { treeDataProvider: provider })
  context.subscriptions.push(treeView)

  void provider.setActive(vscode.window.activeTextEditor?.document.uri)

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new RevisionContentProvider(store)),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      void provider.setActive(editor?.document.uri)
    }),
    vscode.workspace.onDidSaveTextDocument(async document => {
      const cfg = readConfig()
      if (!shouldSnapshot(document, cfg)) {
        return
      }
      try {
        const stored = await store.snapshot(document.uri.toString(), document.getText(), cfg, Date.now())
        if (stored && provider.getCurrentUri()?.toString() === document.uri.toString()) {
          await provider.reload()
        }
      } catch (err) {
        logError('local-history:snapshot', err)
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.localHistory.show', () =>
      vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    ),
    vscode.commands.registerCommand('toolkit.localHistory.refresh', () => provider.reload()),
    vscode.commands.registerCommand('toolkit.localHistory.openDiff', (node: RevisionNode) => openDiff(node)),
    vscode.commands.registerCommand('toolkit.localHistory.restore', (node: RevisionNode) =>
      restore(store, readConfig(), node)
    ),
    vscode.commands.registerCommand('toolkit.localHistory.deleteRevision', async (node: RevisionNode) => {
      await store.deleteRevision(node.fileUri.toString(), node.rev.id)
      await provider.reload()
    }),
    vscode.commands.registerCommand('toolkit.localHistory.clearFile', async () => {
      const uri = provider.getCurrentUri()
      if (!uri) {
        vscode.window.showInformationMessage('Toolkit: open a file to clear its local history.')
        return
      }
      if (!provider.hasRevisions()) {
        vscode.window.showInformationMessage(`Toolkit: no local history for "${path.basename(uri.path)}".`)
        return
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear all local history for "${path.basename(uri.path)}"? This cannot be undone.`,
        { modal: true },
        'Clear'
      )
      if (choice === 'Clear') {
        await store.clear(uri.toString())
        await provider.reload()
      }
    })
  )
}
