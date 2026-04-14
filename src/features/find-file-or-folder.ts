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

    const found = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/__pycache__/**}', 10000)

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
      quickPick.placeholder = 'Search files and folders...'
      quickPick.matchOnDescription = true

      quickPick.busy = true
      quickPick.show()

      quickPick.items = await loadItems()
      quickPick.busy = false

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
