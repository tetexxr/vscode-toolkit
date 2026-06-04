import * as vscode from 'vscode'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import {
  buildDiffTitle,
  buildMultiDiffTitle,
  parseGitBranchList,
  parseNameStatusZ,
  relativizeToRepo,
  type FileChange
} from './compare-utils'

/** Above this many changed files, ask for confirmation before opening the multi-diff view. */
const MANY_FILES_THRESHOLD = 100

const BRANCH_SCHEME = 'toolkit-branch'

/** Serves file content read from a git ref as a virtual document, so the diff editor
 * doesn't materialize a standalone tab for the left-hand side. */
class BranchContentProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>()
  private emitter = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this.emitter.event

  set(uri: vscode.Uri, content: string): void {
    this.cache.set(uri.toString(), content)
    this.emitter.fire(uri)
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? ''
  }
}

function buildBranchUri(branch: string, relPath: string): vscode.Uri {
  // Path → /<branch>/<relPath>, so VS Code can derive the language from the file extension.
  return vscode.Uri.from({
    scheme: BRANCH_SCHEME,
    path: '/' + branch + '/' + relPath
  })
}

interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

function runGit(args: string[], cwd: string): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? ((error as NodeJS.ErrnoException).code === 'ENOENT' ? -1 : 1) : 0
      resolve({ stdout: String(stdout), stderr: String(stderr), code })
    })
  })
}

async function getRepoRoot(fileDir: string): Promise<string | null> {
  const { stdout, code } = await runGit(['rev-parse', '--show-toplevel'], fileDir)
  if (code !== 0) {
    return null
  }
  const trimmed = stdout.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function getCurrentBranch(repoRoot: string): Promise<string | null> {
  const { stdout, code } = await runGit(['branch', '--show-current'], repoRoot)
  if (code !== 0) {
    return null
  }
  const trimmed = stdout.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function listBranches(repoRoot: string): Promise<string[]> {
  const { stdout, code } = await runGit(
    ['for-each-ref', '--sort=-committerdate', 'refs/heads', '--format=%(refname:short)'],
    repoRoot
  )
  if (code !== 0) {
    return []
  }
  return parseGitBranchList(stdout)
}

async function showFromRef(repoRoot: string, ref: string, relPath: string): Promise<string | null> {
  const { stdout, stderr, code } = await runGit(['show', `${ref}:${relPath}`], repoRoot)
  if (code !== 0) {
    return null
  }
  void stderr
  return stdout
}

async function isTrackedInBranch(repoRoot: string, branch: string, relPath: string): Promise<boolean> {
  const { code } = await runGit(['cat-file', '-e', `${branch}:${relPath}`], repoRoot)
  return code === 0
}

async function compareWithBranch(provider: BranchContentProvider, uri?: vscode.Uri): Promise<void> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri
  if (!targetUri || targetUri.scheme === 'untitled') {
    vscode.window.showInformationMessage('Toolkit: open or select a saved file first.')
    return
  }
  if (targetUri.scheme !== 'file') {
    vscode.window.showInformationMessage('Toolkit: this command only works on local files.')
    return
  }

  const fileFsPath = targetUri.fsPath
  const fileDir = path.dirname(fileFsPath)

  const repoRoot = await getRepoRoot(fileDir)
  if (!repoRoot) {
    vscode.window.showWarningMessage('Toolkit: the active file is not inside a git repository.')
    return
  }

  const relPath = relativizeToRepo(repoRoot, fileFsPath)

  const [currentBranch, branches] = await Promise.all([
    getCurrentBranch(repoRoot),
    listBranches(repoRoot)
  ])

  const candidates = branches.filter(b => b !== currentBranch)
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no other local branches to compare with.')
    return
  }

  type Item = vscode.QuickPickItem & { branch: string }
  const items: Item[] = candidates.map(b => ({
    label: `$(git-branch) ${b}`,
    branch: b
  }))
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Compare ${path.basename(fileFsPath)} against which branch?`,
    matchOnDescription: true
  })
  if (!picked) {
    return
  }

  const tracked = await isTrackedInBranch(repoRoot, picked.branch, relPath)
  if (!tracked) {
    vscode.window.showWarningMessage(
      `Toolkit: ${path.basename(fileFsPath)} does not exist on branch "${picked.branch}".`
    )
    return
  }

  const content = await showFromRef(repoRoot, picked.branch, relPath)
  if (content === null) {
    vscode.window.showWarningMessage(
      `Toolkit: could not read ${path.basename(fileFsPath)} from branch "${picked.branch}".`
    )
    return
  }

  const leftUri = buildBranchUri(picked.branch, relPath)
  provider.set(leftUri, content)
  const title = buildDiffTitle(path.basename(fileFsPath), picked.branch)
  await vscode.commands.executeCommand('vscode.diff', leftUri, targetUri, title)
}

async function getMergeBase(repoRoot: string, branch: string): Promise<string | null> {
  const { stdout, code } = await runGit(['merge-base', branch, 'HEAD'], repoRoot)
  if (code !== 0) {
    return null
  }
  const trimmed = stdout.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Lists files that differ between `base` and the working tree, optionally scoped to `relFolder`. */
async function listChangedFiles(repoRoot: string, base: string, relFolder?: string): Promise<FileChange[]> {
  const args = ['diff', '--name-status', '-z', base]
  if (relFolder && relFolder.length > 0) {
    args.push('--', relFolder)
  }
  const { stdout, code } = await runGit(args, repoRoot)
  if (code !== 0) {
    return []
  }
  return parseNameStatusZ(stdout)
}

/** Lets the user pick a branch to compare against (excludes the current branch). */
async function pickBranch(repoRoot: string, placeHolder: string): Promise<string | null> {
  const [currentBranch, branches] = await Promise.all([getCurrentBranch(repoRoot), listBranches(repoRoot)])
  const candidates = branches.filter(b => b !== currentBranch)
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no other local branches to compare with.')
    return null
  }
  type Item = vscode.QuickPickItem & { branch: string }
  const items: Item[] = candidates.map(b => ({ label: `$(git-branch) ${b}`, branch: b }))
  const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true })
  return picked ? picked.branch : null
}

/**
 * Compares everything under `relFolder` (or the whole repo when omitted) against `branch`,
 * opening a single multi-file diff view. The left side is each file's content at the
 * merge-base of `branch` and HEAD; the right side is the file in the working tree — so the
 * view previews exactly what merging would bring in from the current branch's side.
 */
async function compareScopeWithBranch(
  provider: BranchContentProvider,
  repoRoot: string,
  branch: string,
  relFolder: string | undefined,
  scopeLabel: string
): Promise<void> {
  const mergeBase = await getMergeBase(repoRoot, branch)
  if (!mergeBase) {
    vscode.window.showWarningMessage(`Toolkit: could not find a common ancestor with branch "${branch}".`)
    return
  }

  const changes = await listChangedFiles(repoRoot, mergeBase, relFolder)
  if (changes.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: no changes between ${scopeLabel} and "${branch}".`)
    return
  }

  if (changes.length > MANY_FILES_THRESHOLD) {
    const proceed = await vscode.window.showWarningMessage(
      `Toolkit: ${changes.length} files changed between ${scopeLabel} and "${branch}". Open them all?`,
      { modal: true },
      'Open'
    )
    if (proceed !== 'Open') {
      return
    }
  }

  // Resolve every left-hand side (merge-base content) in parallel, then build the resource tuples.
  const resources = await Promise.all(
    changes.map(async change => {
      let left: vscode.Uri | undefined
      if (change.oldPath !== null) {
        const content = await showFromRef(repoRoot, mergeBase, change.oldPath)
        if (content !== null) {
          left = buildBranchUri(branch, change.oldPath)
          provider.set(left, content)
        }
      }
      const right =
        change.newPath !== null ? vscode.Uri.file(path.join(repoRoot, change.newPath)) : undefined
      // The label identifies the row in the multi-diff tree; prefer the working-tree path.
      const labelPath = change.newPath ?? change.oldPath ?? ''
      const label = vscode.Uri.file(path.join(repoRoot, labelPath))
      return [label, left, right] as [vscode.Uri, vscode.Uri?, vscode.Uri?]
    })
  )

  const title = buildMultiDiffTitle(scopeLabel, branch, resources.length)
  await vscode.commands.executeCommand('vscode.changes', title, resources)
}

/** Resolves the repo root for a project-wide comparison, prompting when several folders qualify. */
async function resolveProjectRepoRoot(): Promise<{ repoRoot: string; label: string } | null> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('Toolkit: open a folder or workspace first.')
    return null
  }

  let chosen: vscode.WorkspaceFolder
  if (folders.length === 1) {
    chosen = folders[0]
  } else {
    const picked = await vscode.window.showQuickPick(
      folders.map(f => ({ label: f.name, folder: f })),
      { placeHolder: 'Which workspace folder do you want to compare?' }
    )
    if (!picked) {
      return null
    }
    chosen = picked.folder
  }

  const repoRoot = await getRepoRoot(chosen.uri.fsPath)
  if (!repoRoot) {
    vscode.window.showWarningMessage('Toolkit: this folder is not inside a git repository.')
    return null
  }
  return { repoRoot, label: path.basename(repoRoot) }
}

async function compareProjectWithBranch(provider: BranchContentProvider): Promise<void> {
  const resolved = await resolveProjectRepoRoot()
  if (!resolved) {
    return
  }
  const branch = await pickBranch(resolved.repoRoot, `Compare the whole project against which branch?`)
  if (!branch) {
    return
  }
  await compareScopeWithBranch(provider, resolved.repoRoot, branch, undefined, resolved.label)
}

async function compareFolderWithBranch(provider: BranchContentProvider, folderUri?: vscode.Uri): Promise<void> {
  if (!folderUri || folderUri.scheme !== 'file') {
    vscode.window.showInformationMessage('Toolkit: right-click a folder in the Explorer to use this command.')
    return
  }
  const repoRoot = await getRepoRoot(folderUri.fsPath)
  if (!repoRoot) {
    vscode.window.showWarningMessage('Toolkit: this folder is not inside a git repository.')
    return
  }
  const relFolder = relativizeToRepo(repoRoot, folderUri.fsPath)
  const scopeLabel = relFolder.length > 0 ? relFolder : path.basename(repoRoot)
  const branch = await pickBranch(repoRoot, `Compare "${scopeLabel}" against which branch?`)
  if (!branch) {
    return
  }
  await compareScopeWithBranch(provider, repoRoot, branch, relFolder, scopeLabel)
}

export function registerCompareCommands(context: vscode.ExtensionContext): void {
  const provider = new BranchContentProvider()
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BRANCH_SCHEME, provider),
    vscode.commands.registerCommand('toolkit.compareWithBranch', (uri?: vscode.Uri) =>
      compareWithBranch(provider, uri)
    ),
    vscode.commands.registerCommand('toolkit.compareProjectWithBranch', () => compareProjectWithBranch(provider)),
    vscode.commands.registerCommand('toolkit.compareFolderWithBranch', (uri?: vscode.Uri) =>
      compareFolderWithBranch(provider, uri)
    )
  )
}
