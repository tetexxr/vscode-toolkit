import * as vscode from 'vscode'
import * as path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  formatItemLabel,
  groupByFile,
  groupByTag,
  parseTodos,
  type TodoItem
} from './todo-tree-utils'
import { filterGitIgnored } from '../utils/git-ignore'

const VIEW_ID = 'toolkitTodoTree'

const DEFAULT_TAGS = ['TODO', 'FIXME', 'HACK', 'XXX', 'NOTE', 'BUG', 'REVIEW']
const DEFAULT_INCLUDE_GLOB =
  '**/*.{ts,js,tsx,jsx,cs,razor,cshtml,py,rb,go,rs,java,c,cpp,h,hpp,vue,svelte,html,md,sh,yml,yaml,sql}'
const DEFAULT_EXCLUDED_FOLDERS = ['node_modules', '.git', 'dist', 'build', 'bin', 'obj', '.vs', 'out']

type GroupBy = 'tag' | 'file'

interface Config {
  tags: string[]
  caseSensitive: boolean
  includeGlob: string
  excludedFolders: string[]
  groupBy: GroupBy
  maxFiles: number
  useGitIgnore: boolean
}

function readConfig(): Config {
  const config = vscode.workspace.getConfiguration('toolkit.todoTree')
  return {
    tags: config.get<string[]>('tags', DEFAULT_TAGS),
    caseSensitive: config.get<boolean>('caseSensitive', false),
    includeGlob: config.get<string>('includeGlob', DEFAULT_INCLUDE_GLOB),
    excludedFolders: config.get<string[]>('excludedFolders', DEFAULT_EXCLUDED_FOLDERS),
    groupBy: config.get<GroupBy>('groupBy', 'tag'),
    maxFiles: Math.max(1, config.get<number>('maxFiles', 5000)),
    useGitIgnore: config.get<boolean>('useGitIgnore', true)
  }
}

function buildExcludeGlob(folders: string[]): string | undefined {
  if (folders.length === 0) {
    return undefined
  }
  if (folders.length === 1) {
    return `**/${folders[0]}/**`
  }
  return `**/{${folders.join(',')}}/**`
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
    } catch {
      // ignore unreadable files
    }
  }
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
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerTodoTreeCommands(context: vscode.ExtensionContext): void {
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
      await vscode.workspace
        .getConfiguration('toolkit.todoTree')
        .update('groupBy', 'tag', vscode.ConfigurationTarget.Workspace)
      provider.refresh()
    }),
    vscode.commands.registerCommand('toolkit.todoTree.groupByFile', async () => {
      await vscode.workspace
        .getConfiguration('toolkit.todoTree')
        .update('groupBy', 'file', vscode.ConfigurationTarget.Workspace)
      provider.refresh()
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
