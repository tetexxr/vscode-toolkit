/**
 * Find File or Folder — a QuickPick that searches both files and folders in the workspace.
 * Unlike Cmd+P, this also matches and reveals folders in the explorer.
 */

import * as vscode from 'vscode'
import * as path from 'path'

interface FileOrFolderItem extends vscode.QuickPickItem {
  uri: vscode.Uri
  isDirectory: boolean
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

    const found = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/__pycache__/**,**/bin/**,**/obj/**,**/dist/**,**/build/**,**/.next/**,**/out/**}')

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
    vscode.commands.registerCommand('toolkit.findFileOrFolder', async () => {
      const quickPick = vscode.window.createQuickPick<FileOrFolderItem>()
      quickPick.placeholder = 'Search files and folders... (spaces = multi-term AND search)'
      quickPick.matchOnDescription = true

      quickPick.busy = true
      quickPick.show()

      const allItems = await loadItems()
      quickPick.items = allItems
      quickPick.busy = false

      quickPick.onDidChangeValue((value) => {
        const trimmed = value.trim()
        if (!trimmed) {
          quickPick.items = allItems
          return
        }

        const terms = trimmed.toLowerCase().split(/\s+/)
        if (terms.length <= 1) {
          // Single term: let the native QuickPick filter handle it
          if (quickPick.items !== allItems) {
            quickPick.items = allItems
          }
          return
        }

        // Multi-term: manual AND filter
        const filtered = allItems
          .filter((item) => {
            const text = getSearchText(item)
            return terms.every((t) => text.includes(t))
          })
          .map((item) => ({ ...item, alwaysShow: true }))
        quickPick.items = filtered
      })

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0]
        if (!selected) {
          return
        }
        quickPick.hide()

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
