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

async function collectFolders(root: vscode.Uri, relativeTo: string, results: vscode.Uri[]): Promise<void> {
  let entries: [string, vscode.FileType][]
  try {
    entries = await vscode.workspace.fs.readDirectory(root)
  } catch {
    return
  }

  for (const [name, type] of entries) {
    if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') {
      continue
    }
    if (type === vscode.FileType.Directory) {
      const childUri = vscode.Uri.joinPath(root, name)
      results.push(childUri)
      await collectFolders(childUri, relativeTo, results)
    }
  }
}

export function registerFindFileOrFolderCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.findFileOrFolder', async () => {
      const folders = vscode.workspace.workspaceFolders
      if (!folders) {
        vscode.window.showInformationMessage('No workspace open.')
        return
      }

      const quickPick = vscode.window.createQuickPick<FileOrFolderItem>()
      quickPick.placeholder = 'Search files and folders...'
      quickPick.matchOnDescription = true

      // Load all files and folders
      quickPick.busy = true
      const items: FileOrFolderItem[] = []

      const [files] = await Promise.all([
        vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/__pycache__/**}', 10000),
        (async () => {
          for (const folder of folders) {
            const folderUris: vscode.Uri[] = []
            await collectFolders(folder.uri, folder.uri.fsPath, folderUris)
            for (const uri of folderUris) {
              items.push({
                label: `$(folder) ${path.basename(uri.fsPath)}`,
                description: vscode.workspace.asRelativePath(uri, false),
                uri,
                isDirectory: true
              })
            }
          }
        })()
      ])

      for (const uri of files) {
        items.push({
          label: `$(file) ${path.basename(uri.fsPath)}`,
          description: vscode.workspace.asRelativePath(uri, false),
          uri,
          isDirectory: false
        })
      }

      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.label.localeCompare(b.label)
      })

      quickPick.items = items
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
      quickPick.show()
    })
  )
}
