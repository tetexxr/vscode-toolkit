import * as vscode from 'vscode'
import * as path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  formatItemLabel,
  groupByFile,
  groupByTag,
  mergeExclusions,
  parseTodos,
  resolveGroupBy,
  type GroupBy,
  type TodoItem
} from './todo-tree-utils'
import { filterGitIgnored } from '../utils/git-ignore'
import { logError, logInfo } from '../utils/logger'

const VIEW_ID = 'toolkitTodoTree'

// Per-workspace, machine-local storage keys. These hold the user's *personal*
// preferences (folders excluded via the command, current grouping). They live in
// VS Code's own storage rather than `.vscode/settings.json`, so they never get
// committed and never collide with a teammate's choices.
const STATE_EXCLUDED_FOLDERS = 'todoTree.excludedFolders'
const STATE_GROUP_BY = 'todoTree.groupBy'

// Set during registration; lets the module-level helpers reach workspaceState
// without threading the context through every call site.
let stateStore: vscode.Memento | undefined

const DEFAULT_TAGS = ['TODO', 'FIXME', 'HACK', 'XXX', 'NOTE', 'BUG', 'REVIEW']
const DEFAULT_INCLUDE_GLOB =
  '**/*.{ts,js,tsx,jsx,cs,razor,cshtml,py,rb,go,rs,java,c,cpp,h,hpp,vue,svelte,html,md,sh,yml,yaml,sql}'
const DEFAULT_EXCLUDED_FOLDERS = ['node_modules', '.git', 'dist', 'build', 'bin', 'obj', '.vs', 'out']

interface Config {
  tags: string[]
  caseSensitive: boolean
  includeGlob: string
  excludedFolders: string[]
  groupBy: GroupBy
  maxFiles: number
  useGitIgnore: boolean
}

function personalExclusions(): string[] {
  return stateStore?.get<string[]>(STATE_EXCLUDED_FOLDERS, []) ?? []
}

// Mirror the active grouping into a context key so the view-title toggle buttons
// can react via their `when` clauses. The grouping lives in workspaceState now,
// which `when` expressions can't read directly (they only see config + context).
function syncGroupByContext(value: GroupBy): Thenable<unknown> {
  return vscode.commands.executeCommand('setContext', 'toolkitTodoTreeGroupBy', value)
}

function readConfig(): Config {
  const config = vscode.workspace.getConfiguration('toolkit.todoTree')
  // Base exclusions still come from the declared setting (team/user defaults,
  // possibly committed on purpose); personal ones come from workspaceState. The
  // effective list is the union, de-duplicated.
  const baseExclusions = config.get<string[]>('excludedFolders', DEFAULT_EXCLUDED_FOLDERS)
  const excludedFolders = mergeExclusions(baseExclusions, personalExclusions())
  // Grouping is a personal view preference: prefer the stored value, falling
  // back to the declared setting (honors any pre-existing config / migration).
  const groupBy = resolveGroupBy(stateStore?.get<string>(STATE_GROUP_BY), config.get<GroupBy>('groupBy', 'tag'))
  return {
    tags: config.get<string[]>('tags', DEFAULT_TAGS),
    caseSensitive: config.get<boolean>('caseSensitive', false),
    includeGlob: config.get<string>('includeGlob', DEFAULT_INCLUDE_GLOB),
    excludedFolders,
    groupBy,
    maxFiles: Math.max(1, config.get<number>('maxFiles', 5000)),
    useGitIgnore: config.get<boolean>('useGitIgnore', true)
  }
}

function toExcludePattern(entry: string): string | undefined {
  const trimmed = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!trimmed) {
    return undefined
  }
  // Explicit glob: pass through untouched.
  if (/[*?{[]/.test(trimmed)) {
    return trimmed
  }
  // Workspace-relative path (contains a slash): anchor it.
  if (trimmed.includes('/')) {
    return `${trimmed}/**`
  }
  // Bare folder name: match it anywhere.
  return `**/${trimmed}/**`
}

function buildExcludeGlob(folders: string[]): string | undefined {
  const patterns = folders.map(toExcludePattern).filter((p): p is string => !!p)
  if (patterns.length === 0) {
    return undefined
  }
  if (patterns.length === 1) {
    return patterns[0]
  }
  return `{${patterns.join(',')}}`
}

function relativeFor(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri)
  if (folder) {
    return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/')
  }
  return path.basename(uri.fsPath)
}

/* -------------------------------------------------------------------------- */
/*  Tree provider                                                             */
/* -------------------------------------------------------------------------- */

type Node = TagNode | FileNode | ItemNode

interface TagNode {
  kind: 'tag'
  tag: string
  count: number
  items: TodoItem[]
}

interface FileNode {
  kind: 'file'
  uri: string
  count: number
  items: TodoItem[]
}

interface ItemNode {
  kind: 'item'
  item: TodoItem
  showTag: boolean
}

class TodoTreeProvider implements vscode.TreeDataProvider<Node> {
  private items: TodoItem[] = []
  private emitter = new vscode.EventEmitter<Node | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  setItems(items: TodoItem[]): void {
    this.items = items
    this.emitter.fire()
  }

  getItems(): TodoItem[] {
    return this.items
  }

  refresh(): void {
    this.emitter.fire()
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'tag') {
      const item = new vscode.TreeItem(node.tag, vscode.TreeItemCollapsibleState.Expanded)
      item.description = String(node.count)
      item.iconPath = new vscode.ThemeIcon('symbol-keyword')
      item.contextValue = 'tag'
      return item
    }
    if (node.kind === 'file') {
      const uri = vscode.Uri.parse(node.uri)
      const item = new vscode.TreeItem(relativeFor(uri), vscode.TreeItemCollapsibleState.Expanded)
      item.description = String(node.count)
      item.resourceUri = uri
      item.iconPath = vscode.ThemeIcon.File
      item.contextValue = 'file'
      return item
    }
    const todo = node.item
    const label = formatItemLabel(todo)
    const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
    const uri = vscode.Uri.parse(todo.uri)
    const rel = relativeFor(uri)
    treeItem.description = node.showTag ? `${todo.tag} · ${rel}:${todo.line + 1}` : `${rel}:${todo.line + 1}`
    treeItem.tooltip = new vscode.MarkdownString(
      `**${todo.tag}** — ${todo.message || '(no description)'}\n\n\`${rel}:${todo.line + 1}\``
    )
    treeItem.iconPath = new vscode.ThemeIcon('checklist')
    treeItem.command = {
      title: 'Open',
      command: 'vscode.open',
      arguments: [
        uri,
        {
          selection: new vscode.Range(todo.line, 0, todo.line, 0)
        } as vscode.TextDocumentShowOptions
      ]
    }
    treeItem.contextValue = 'todo'
    return treeItem
  }

  getChildren(parent?: Node): Node[] {
    const config = readConfig()
    if (!parent) {
      if (this.items.length === 0) {
        return []
      }
      if (config.groupBy === 'file') {
        return groupByFile(this.items).map<Node>(g => ({
          kind: 'file',
          uri: g.uri,
          count: g.items.length,
          items: g.items
        }))
      }
      return groupByTag(this.items).map<Node>(g => ({
        kind: 'tag',
        tag: g.tag,
        count: g.items.length,
        items: g.items
      }))
    }
    if (parent.kind === 'tag') {
      return parent.items.map<Node>(item => ({ kind: 'item', item, showTag: false }))
    }
    if (parent.kind === 'file') {
      return parent.items.map<Node>(item => ({ kind: 'item', item, showTag: true }))
    }
    return []
  }
}

/* -------------------------------------------------------------------------- */
/*  Scanner                                                                   */
/* -------------------------------------------------------------------------- */

async function scanWorkspace(provider: TodoTreeProvider): Promise<void> {
  const cfg = readConfig()
  if (cfg.tags.length === 0) {
    provider.setItems([])
    return
  }
  const t0 = performance.now()
  const excludeGlob = buildExcludeGlob(cfg.excludedFolders)
  let found = await vscode.workspace.findFiles(cfg.includeGlob, excludeGlob, cfg.maxFiles)
  if (cfg.useGitIgnore && found.length > 0) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (cwd) {
      const kept = await filterGitIgnored(found.map(u => u.fsPath), cwd)
      const keptSet = new Set(kept)
      found = found.filter(u => keptSet.has(u.fsPath))
    }
  }
  const items: TodoItem[] = []
  // Read sequentially to keep memory predictable on large repos. Could be parallelized.
  for (const uri of found) {
    try {
      const text = await readFile(uri.fsPath, 'utf8')
      const parsed = parseTodos(text, uri.toString(), {
        tags: cfg.tags,
        caseSensitive: cfg.caseSensitive
      })
      items.push(...parsed)
    } catch (err) {
      // The scan touches every matching file — keep going on permission /
      // encoding / read errors but leave a trail so the user can identify them.
      logError(`todo-tree:${uri.fsPath}`, err)
    }
  }
  logInfo('todo-tree', `scanned ${found.length} file(s) and found ${items.length} todo(s) in ${Math.round(performance.now() - t0)}ms`)
  provider.setItems(items)
}

function rescanSingleFile(provider: TodoTreeProvider, document: vscode.TextDocument): void {
  const cfg = readConfig()
  if (cfg.tags.length === 0) {
    return
  }
  const uri = document.uri.toString()
  const others = provider.getItems().filter(i => i.uri !== uri)
  const parsed = parseTodos(document.getText(), uri, {
    tags: cfg.tags,
    caseSensitive: cfg.caseSensitive
  })
  provider.setItems([...others, ...parsed])
}

/* -------------------------------------------------------------------------- */
/*  Exclude folder command                                                    */
/* -------------------------------------------------------------------------- */

function uriFromNode(node: Node): vscode.Uri | undefined {
  if (node.kind === 'file') {
    return vscode.Uri.parse(node.uri)
  }
  if (node.kind === 'item') {
    return vscode.Uri.parse(node.item.uri)
  }
  return undefined
}

function ancestorPaths(relPath: string): string[] {
  const parts = relPath.split('/').filter(Boolean)
  // Drop the file itself; keep every folder ancestor down to the immediate parent.
  parts.pop()
  const out: string[] = []
  for (let i = 1; i <= parts.length; i++) {
    out.push(parts.slice(0, i).join('/'))
  }
  return out
}

async function addExclusion(relPath: string, provider: TodoTreeProvider): Promise<void> {
  // Already covered by either the base setting or a previous personal exclusion.
  if (readConfig().excludedFolders.includes(relPath)) {
    void vscode.window.showInformationMessage(`TODO Tree: "${relPath}" is already excluded.`)
    return
  }
  await stateStore?.update(STATE_EXCLUDED_FOLDERS, [...personalExclusions(), relPath])
  // Writes go to workspaceState, not configuration, so the config-change listener
  // won't fire — rescan explicitly to reflect the new exclusion.
  await scanWorkspace(provider)
}

function workspaceRelative(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri)
  if (!folder) {
    return undefined
  }
  return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/')
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    return (stat.type & vscode.FileType.Directory) !== 0
  } catch {
    return false
  }
}

async function excludeFolderFromUri(uri: vscode.Uri, provider: TodoTreeProvider): Promise<void> {
  const rel = workspaceRelative(uri)
  if (rel === undefined) {
    void vscode.window.showWarningMessage('TODO Tree: path is outside the workspace; cannot derive a relative path to exclude.')
    return
  }
  if (await isDirectory(uri)) {
    if (!rel) {
      void vscode.window.showInformationMessage('TODO Tree: the workspace root cannot be excluded.')
      return
    }
    await addExclusion(rel, provider)
    return
  }
  // It's a file: offer its ancestor folders.
  const ancestors = ancestorPaths(rel)
  if (ancestors.length === 0) {
    void vscode.window.showInformationMessage('TODO Tree: this file lives at the workspace root; nothing to exclude.')
    return
  }
  const picked = await vscode.window.showQuickPick(
    ancestors.slice().reverse().map(p => ({ label: p, description: 'workspace-relative' })),
    { title: 'Exclude folder from TODO Tree', placeHolder: 'Pick which ancestor folder to exclude' }
  )
  if (!picked) {
    return
  }
  await addExclusion(picked.label, provider)
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerTodoTreeCommands(context: vscode.ExtensionContext): void {
  stateStore = context.workspaceState
  void syncGroupByContext(readConfig().groupBy)
  const provider = new TodoTreeProvider()
  const treeView = vscode.window.createTreeView<Node>(VIEW_ID, { treeDataProvider: provider })
  context.subscriptions.push(treeView)

  const updateBadge = () => {
    const total = provider.getItems().length
    treeView.badge =
      total > 0
        ? { value: total, tooltip: `${total} TODO comment${total === 1 ? '' : 's'}` }
        : undefined
  }
  provider.onDidChangeTreeData(() => updateBadge())

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.todoTree.refresh', async () => {
      await scanWorkspace(provider)
    }),
    vscode.commands.registerCommand('toolkit.todoTree.groupByTag', async () => {
      await context.workspaceState.update(STATE_GROUP_BY, 'tag')
      await syncGroupByContext('tag')
      provider.refresh()
    }),
    vscode.commands.registerCommand('toolkit.todoTree.groupByFile', async () => {
      await context.workspaceState.update(STATE_GROUP_BY, 'file')
      await syncGroupByContext('file')
      provider.refresh()
    }),
    vscode.commands.registerCommand('toolkit.todoTree.excludeFolder', async (arg?: Node | vscode.Uri) => {
      if (!arg) {
        return
      }
      if (arg instanceof vscode.Uri) {
        await excludeFolderFromUri(arg, provider)
        return
      }
      const uri = uriFromNode(arg)
      if (uri) {
        await excludeFolderFromUri(uri, provider)
      }
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      rescanSingleFile(provider, doc)
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('toolkit.todoTree')) {
        void scanWorkspace(provider)
      }
    })
  )

  // Kick off the initial scan in the background.
  void scanWorkspace(provider)
}
