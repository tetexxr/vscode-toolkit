import * as vscode from 'vscode'
import * as path from 'path'
import { getRepoRoot, stageFile } from '../../utils/git'

export function registerGitStageCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.git.stageChanges', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const targets = uris && uris.length > 0 ? uris : uri ? [uri] : []
      if (targets.length === 0) {
        return
      }

      try {
        // Group targets by repository: a multi-select can span repos in a
        // multi-root workspace, and paths from another repo would make the
        // whole `git add` fail.
        const byRepo = new Map<string, string[]>()
        for (const target of targets) {
          const repoRoot = await getRepoRoot(path.dirname(target.fsPath))
          const rel = path.relative(repoRoot, target.fsPath).split(path.sep).join('/')
          const list = byRepo.get(repoRoot)
          if (list) {
            list.push(rel)
          } else {
            byRepo.set(repoRoot, [rel])
          }
        }
        const allPaths: string[] = []
        for (const [repoRoot, relativePaths] of byRepo) {
          await stageFile(repoRoot, ...relativePaths)
          allPaths.push(...relativePaths)
        }
        const label = allPaths.length === 1 ? allPaths[0] : `${allPaths.length} items`
        vscode.window.showInformationMessage(`Staged: ${label}`)
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to stage: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  )
}
