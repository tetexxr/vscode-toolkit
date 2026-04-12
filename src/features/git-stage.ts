import * as vscode from 'vscode'
import * as path from 'path'
import { getRepoRoot, stageFile } from '../utils/git'

export function registerGitStageCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.git.stageChanges', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const targets = uris && uris.length > 0 ? uris : uri ? [uri] : []
      if (targets.length === 0) {
        return
      }

      try {
        const repoRoot = await getRepoRoot(path.dirname(targets[0].fsPath))
        const relativePaths = targets.map(t => path.relative(repoRoot, t.fsPath))
        await stageFile(repoRoot, ...relativePaths)
        const label = relativePaths.length === 1
          ? relativePaths[0]
          : `${relativePaths.length} items`
        vscode.window.showInformationMessage(`Staged: ${label}`)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to stage: ${err.message}`)
      }
    })
  )
}
