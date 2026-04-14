/**
 * Find File or Folder — a QuickPick that searches both files and folders in the workspace.
 * Unlike Cmd+P, this also matches and reveals folders in the explorer.
 */

import * as vscode from 'vscode'
import * as path from 'path'

const RECENT_KEY = 'toolkit.findFileOrFolder.recent'
const MAX_RECENT = 20

interface FileOrFolderItem extends vscode.QuickPickItem {
  uri: vscode.Uri
  isDirectory: boolean
}

/** Get the path segments for scoring (filename + each folder in the path). */
function getSegments(item: FileOrFolderItem): string[] {
  const desc = item.description ?? ''
  return desc.toLowerCase().split('/')
}

/** Score how well an item matches the search terms. Higher = better. */
function scoreItem(item: FileOrFolderItem, terms: string[]): number {
  const segments = getSegments(item)
  let score = 0

  for (const term of terms) {
    let bestTermScore = 0
    for (const seg of segments) {
      if (seg.startsWith(term)) {
        // Exact prefix match on a segment — best case
        bestTermScore = Math.max(bestTermScore, 2)
      } else if (seg.includes(term)) {
        // Substring match — ok
        bestTermScore = Math.max(bestTermScore, 1)
      }
    }
    score += bestTermScore
  }

  return score
}

function getSearchText(item: FileOrFolderItem): string {
  const label = item.label.replace(/\$\([^)]+\)\s*/, '')
  return (label + ' ' + (item.description ?? '')).toLowerCase()
}

export function registerFindFileOrFolderCommands(context: vscode.ExtensionContext): void {
  let cachedItems: FileOrFolderItem[] | undefined

  function invalidateCache() {
    cachedItems = undefined
  }

  function getRecentPaths(): string[] {
    return context.workspaceState.get<string[]>(RECENT_KEY, [])
  }

  function addRecentPath(fsPath: string): void {
    const recent = getRecentPaths().filter((p) => p !== fsPath)
    recent.unshift(fsPath)
    if (recent.length > MAX_RECENT) {
      recent.length = MAX_RECENT
    }
    context.workspaceState.update(RECENT_KEY, recent)
  }

  function removeRecentPath(fsPath: string): void {
    const recent = getRecentPaths().filter((p) => p !== fsPath)
    context.workspaceState.update(RECENT_KEY, recent)
  }

  const removeButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('close'),
    tooltip: 'Remove from recent'
  }

  function sortWithRecents(items: FileOrFolderItem[]): FileOrFolderItem[] {
    const recent = getRecentPaths()
    if (recent.length === 0) {
      return items
    }

    const recentSet = new Map<string, number>()
    for (let i = 0; i < recent.length; i++) {
      recentSet.set(recent[i], i)
    }

    const recentItems: FileOrFolderItem[] = []
    const rest: FileOrFolderItem[] = []

    for (const item of items) {
      const idx = recentSet.get(item.uri.fsPath)
      if (idx !== undefined) {
        recentItems.push({ ...item, buttons: [removeButton] })
      } else {
        rest.push(item)
      }
    }

    // Sort recent items by recency (most recent first)
    recentItems.sort((a, b) => recentSet.get(a.uri.fsPath)! - recentSet.get(b.uri.fsPath)!)

    if (recentItems.length === 0) {
      return items
    }

    return [
      { label: 'Recent', kind: vscode.QuickPickItemKind.Separator } as FileOrFolderItem,
      ...recentItems,
      { label: 'All', kind: vscode.QuickPickItemKind.Separator } as FileOrFolderItem,
      ...rest
    ]
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*')
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(invalidateCache),
    watcher.onDidDelete(invalidateCache)
  )

  async function loadItems(): Promise<FileOrFolderItem[]> {
    if (cachedItems) {
      return cachedItems
    }

    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      return []
    }

    // Essential exclusions for performance + user's files.exclude and search.exclude
    const excludes = new Set(['**/node_modules/**', '**/.git/**'])
    const filesExclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude', {})
    const searchExclude = vscode.workspace.getConfiguration('search').get<Record<string, boolean>>('exclude', {})
    for (const [pattern, enabled] of Object.entries({ ...filesExclude, ...searchExclude })) {
      if (enabled) {
        excludes.add(pattern)
      }
    }
    const found = await vscode.workspace.findFiles('**/*', `{${[...excludes].join(',')}}`)

    const folderSet = new Set<string>()
    const folders: FileOrFolderItem[] = []
    const files: FileOrFolderItem[] = []

    for (const uri of found) {
      files.push({
        label: `$(file) ${path.basename(uri.fsPath)}`,
        description: vscode.workspace.asRelativePath(uri, false),
        uri,
        isDirectory: false
      })

      const relPath = vscode.workspace.asRelativePath(uri, false)
      const parts = relPath.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folderRelPath = parts.slice(0, i).join('/')
        if (!folderSet.has(folderRelPath)) {
          folderSet.add(folderRelPath)
          folders.push({
            label: `$(folder) ${parts[i - 1]}`,
            description: folderRelPath,
            uri: vscode.Uri.joinPath(workspaceFolders[0].uri, folderRelPath),
            isDirectory: true
          })
        }
      }
    }

    folders.sort((a, b) => a.label.localeCompare(b.label))
    files.sort((a, b) => a.label.localeCompare(b.label))

    cachedItems = [...folders, ...files]
    return cachedItems
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder.clearRecent', () => {
      context.workspaceState.update(RECENT_KEY, [])
      vscode.window.showInformationMessage('Find File or Folder: recent items cleared.')
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder', async () => {
      const quickPick = vscode.window.createQuickPick<FileOrFolderItem>()
      quickPick.placeholder = 'Search files and folders... (spaces = multi-term AND search)'
      quickPick.matchOnDescription = true

      quickPick.busy = true
      quickPick.show()

      const allItems = await loadItems()
      let itemsWithRecents = sortWithRecents(allItems)
      quickPick.items = itemsWithRecents
      quickPick.busy = false

      quickPick.onDidTriggerItemButton((e) => {
        removeRecentPath(e.item.uri.fsPath)
        itemsWithRecents = sortWithRecents(allItems)
        quickPick.items = itemsWithRecents
      })

      quickPick.onDidChangeValue((value) => {
        const trimmed = value.trim()
        if (!trimmed) {
          quickPick.items = itemsWithRecents
          return
        }

        const terms = trimmed.toLowerCase().split(/\s+/)
        if (terms.length <= 1) {
          if (quickPick.items !== itemsWithRecents) {
            quickPick.items = itemsWithRecents
          }
          return
        }

        // Multi-term: filter, score by prefix matches, sort by score descending
        const filtered = allItems
          .filter((item) => {
            const text = getSearchText(item)
            return terms.every((t) => text.includes(t))
          })
          .map((item) => ({ ...item, alwaysShow: true, _score: scoreItem(item, terms) }))
          .sort((a, b) => b._score - a._score || a.label.localeCompare(b.label))

        quickPick.items = filtered
      })

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0]
        if (!selected) {
          return
        }
        quickPick.hide()

        addRecentPath(selected.uri.fsPath)

        if (selected.isDirectory) {
          await vscode.commands.executeCommand('revealInExplorer', selected.uri)
        } else {
          await vscode.commands.executeCommand('vscode.open', selected.uri)
        }
      })

      quickPick.onDidHide(() => quickPick.dispose())
    })
  )
}
