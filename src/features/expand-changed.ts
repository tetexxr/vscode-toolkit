import * as vscode from 'vscode'
import { getRepoRoot, getChangedFiles, getChangedFileDirectories } from '../utils/git'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function registerExpandChangedFilesCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'toolkit.expandChangedFiles',
      async (uri?: vscode.Uri) => {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showInformationMessage('No workspace folder open.')
          return
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Expanding changed files...',
            cancellable: true
          },
          async (_progress, token) => {
            const cwd = workspaceFolders[0].uri.fsPath
            let repoRoot: string
            try {
              repoRoot = await getRepoRoot(cwd)
            } catch {
              vscode.window.showWarningMessage('Not a git repository.')
              return
            }

            const changedFiles = await getChangedFiles(repoRoot)
            if (changedFiles.length === 0) {
              vscode.window.showInformationMessage('No changed files found.')
              return
            }

            // Filter to files within the target folder if specified
            let filePaths = changedFiles.map((f) => f.path)
            const repoRootUri = vscode.Uri.file(repoRoot)

            if (uri) {
              const targetRelative =
                uri.fsPath.substring(repoRoot.length).replace(/\\/g, '/').replace(/^\//, '') + '/'
              filePaths = filePaths.filter((p) => p.startsWith(targetRelative))
              if (filePaths.length === 0) {
                vscode.window.showInformationMessage('No changed files in this folder.')
                return
              }
            }

            const directories = getChangedFileDirectories(filePaths)

            // Focus explorer
            await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer')
            await delay(100)

            // Expand each directory from shallowest to deepest
            for (const dir of directories) {
              if (token.isCancellationRequested) break
              const dirUri = vscode.Uri.joinPath(repoRootUri, dir)
              try {
                await vscode.commands.executeCommand('revealInExplorer', dirUri)
                await delay(30)
                await vscode.commands.executeCommand('list.expand')
                await delay(15)
              } catch {
                // Folder may not exist or be excluded — skip
              }
            }
          }
        )
      }
    )
  )
}
