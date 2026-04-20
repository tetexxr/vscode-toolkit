/**
 * Find File or Folder — a QuickPick that searches both files and folders in the workspace.
 * Unlike Cmd+P, this also matches and reveals folders in the explorer.
 */

import * as vscode from 'vscode'
import { scoreItem, matchesFilter, parseTerms } from '../utils/search'

const RECENT_KEY = 'toolkit.findFileOrFolder.recent'
const MAX_RECENT = 20

interface FileOrFolderItem extends vscode.QuickPickItem {
  uri: vscode.Uri
  isDirectory: boolean
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
    const recent = getRecentPaths().filter(p => p !== fsPath)
    recent.unshift(fsPath)
    if (recent.length > MAX_RECENT) {
      recent.length = MAX_RECENT
    }
    context.workspaceState.update(RECENT_KEY, recent)
  }

  function removeRecentPath(fsPath: string): void {
    const recent = getRecentPaths().filter(p => p !== fsPath)
    context.workspaceState.update(RECENT_KEY, recent)
  }

  const openToSideButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('split-horizontal'),
    tooltip: 'Open to the Side'
  }

  const removeButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('close'),
    tooltip: 'Remove from recent'
  }

  function applyRecentsAndButtons(items: FileOrFolderItem[]): FileOrFolderItem[] {
    const recent = getRecentPaths()
    if (recent.length === 0) {
      return items.map(item => (item.isDirectory ? item : { ...item, buttons: [openToSideButton] }))
    }

    const recentIndex = new Map<string, number>()
    for (let i = 0; i < recent.length; i++) {
      recentIndex.set(recent[i], i)
    }

    const recentItems: FileOrFolderItem[] = []
    const rest: FileOrFolderItem[] = []

    for (const item of items) {
      const sideBtn = item.isDirectory ? [] : [openToSideButton]
      if (recentIndex.has(item.uri.fsPath)) {
        recentItems.push({ ...item, buttons: [...sideBtn, removeButton] })
      } else {
        rest.push(item.isDirectory ? item : { ...item, buttons: sideBtn })
      }
    }

    recentItems.sort((a, b) => recentIndex.get(a.uri.fsPath)! - recentIndex.get(b.uri.fsPath)!)

    if (recentItems.length === 0) {
      return rest
    }

    return [
      { label: 'Recent', kind: vscode.QuickPickItemKind.Separator } as FileOrFolderItem,
      ...recentItems,
      { label: 'All', kind: vscode.QuickPickItemKind.Separator } as FileOrFolderItem,
      ...rest
    ]
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*')
  context.subscriptions.push(watcher, watcher.onDidCreate(invalidateCache), watcher.onDidDelete(invalidateCache))

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
      const relPath = vscode.workspace.asRelativePath(uri, false)
      const parts = relPath.split('/')

      files.push({
        label: `$(file) ${parts[parts.length - 1]}`,
        description: relPath,
        uri,
        isDirectory: false
      })

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

  let currentQuickPick: vscode.QuickPick<FileOrFolderItem> | undefined
  let currentAllItems: FileOrFolderItem[] = []

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder.removeActiveFromRecent', () => {
      const qp = currentQuickPick
      if (!qp) {
        return
      }
      const active = qp.activeItems[0]
      if (!active?.uri) {
        return
      }
      if (!getRecentPaths().includes(active.uri.fsPath)) {
        return
      }
      removeRecentPath(active.uri.fsPath)
      qp.items = applyRecentsAndButtons(currentAllItems)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder', async () => {
      const quickPick = vscode.window.createQuickPick<FileOrFolderItem>()
      quickPick.placeholder = 'Search files and folders... (spaces = multi-term AND search)'
      quickPick.matchOnDescription = true

      quickPick.busy = true
      quickPick.show()
      currentQuickPick = quickPick
      vscode.commands.executeCommand('setContext', 'toolkit.findFileOrFolder.focused', true)
      vscode.commands.executeCommand('setContext', 'toolkit.findFileOrFolder.emptyInput', true)

      const allItems = await loadItems()
      currentAllItems = allItems
      let displayItems = applyRecentsAndButtons(allItems)
      quickPick.items = displayItems
      quickPick.busy = false

      quickPick.onDidTriggerItemButton(async e => {
        if (e.button === openToSideButton) {
          quickPick.hide()
          addRecentPath(e.item.uri.fsPath)
          await vscode.commands.executeCommand('vscode.open', e.item.uri, vscode.ViewColumn.Beside)
        } else if (e.button === removeButton) {
          removeRecentPath(e.item.uri.fsPath)
          displayItems = applyRecentsAndButtons(allItems)
          quickPick.items = displayItems
        }
      })

      quickPick.onDidChangeValue(value => {
        const trimmed = value.trim()
        vscode.commands.executeCommand('setContext', 'toolkit.findFileOrFolder.emptyInput', trimmed === '')
        if (!trimmed) {
          quickPick.items = displayItems
          return
        }

        const { include, exclude } = parseTerms(trimmed)

        if (include.length <= 1 && exclude.length === 0) {
          if (quickPick.items !== displayItems) {
            quickPick.items = displayItems
          }
          return
        }

        // Multi-term: filter, score by prefix matches, sort by score descending
        const filtered = allItems
          .filter(item => matchesFilter(item.description ?? '', include, exclude))
          .map(item => {
            const segments = (item.description ?? '').toLowerCase().split('/')
            return { item, score: scoreItem(segments, include) }
          })
          .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
          .map(({ item }) => ({ ...item, alwaysShow: true }))

        quickPick.items = applyRecentsAndButtons(filtered)
      })

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0]
        if (!selected?.uri) {
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

      quickPick.onDidHide(() => {
        if (currentQuickPick === quickPick) {
          currentQuickPick = undefined
          currentAllItems = []
        }
        vscode.commands.executeCommand('setContext', 'toolkit.findFileOrFolder.focused', false)
        vscode.commands.executeCommand('setContext', 'toolkit.findFileOrFolder.emptyInput', false)
        quickPick.dispose()
      })
    })
  )
}
