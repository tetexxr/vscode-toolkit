/**
 * Find File or Folder — a QuickPick that searches both files and folders in the workspace.
 * Unlike Cmd+P, this also matches and reveals folders in the explorer.
 * Folders are derived from file paths (no filesystem walk), so it's as fast as Cmd+P.
 */

import * as vscode from 'vscode'
import * as path from 'path'

interface FileOrFolderItem extends vscode.QuickPickItem {
  uri?: vscode.Uri
  isDirectory?: boolean
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

  async function buildItems(): Promise<FileOrFolderItem[]> {
    if (cachedItems) {
      return cachedItems
    }

    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      return []
    }

    const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/__pycache__/**}', 10000)

    const folderSet = new Set<string>()
    const folderItems: FileOrFolderItem[] = []
    const fileItems: FileOrFolderItem[] = []

    for (const uri of files) {
      fileItems.push({
        label: path.basename(uri.fsPath),
        description: vscode.workspace.asRelativePath(uri, false),
        uri,
        isDirectory: false
      })

      // Extract all parent folders from this file's relative path
      const relPath = vscode.workspace.asRelativePath(uri, false)
      const parts = relPath.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folderRelPath = parts.slice(0, i).join('/')
        if (!folderSet.has(folderRelPath)) {
          folderSet.add(folderRelPath)
          const folderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, folderRelPath)
          folderItems.push({
            label: parts[i - 1],
            description: folderRelPath,
            uri: folderUri,
            isDirectory: true
          })
        }
      }
    }

    folderItems.sort((a, b) => a.label.localeCompare(b.label))
    fileItems.sort((a, b) => a.label.localeCompare(b.label))

    const items: FileOrFolderItem[] = [
      { label: 'Folders', kind: vscode.QuickPickItemKind.Separator },
      ...folderItems,
      { label: 'Files', kind: vscode.QuickPickItemKind.Separator },
      ...fileItems
    ]

    cachedItems = items
    return items
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder', async () => {
      const quickPick = vscode.window.createQuickPick<FileOrFolderItem>()
      quickPick.placeholder = 'Search files and folders...'
      quickPick.matchOnDescription = true

      quickPick.busy = true
      quickPick.show()

      const items = await buildItems()
      quickPick.items = items
      quickPick.busy = false

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0]
        if (!selected?.uri) {
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
