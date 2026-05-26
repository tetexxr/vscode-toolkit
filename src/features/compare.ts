import * as vscode from 'vscode'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { buildDiffTitle, parseGitBranchList, relativizeToRepo } from './compare-utils'

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

async function showFromBranch(repoRoot: string, branch: string, relPath: string): Promise<string | null> {
  const { stdout, stderr, code } = await runGit(['show', `${branch}:${relPath}`], repoRoot)
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

async function compareWithBranch(provider: BranchContentProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.isUntitled) {
    vscode.window.showInformationMessage('Toolkit: open a saved file first.')
    return
  }
  if (editor.document.uri.scheme !== 'file') {
    vscode.window.showInformationMessage('Toolkit: this command only works on local files.')
    return
  }

  const fileFsPath = editor.document.uri.fsPath
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

  const content = await showFromBranch(repoRoot, picked.branch, relPath)
  if (content === null) {
    vscode.window.showWarningMessage(
      `Toolkit: could not read ${path.basename(fileFsPath)} from branch "${picked.branch}".`
    )
    return
  }

  const leftUri = buildBranchUri(picked.branch, relPath)
  provider.set(leftUri, content)
  const title = buildDiffTitle(path.basename(fileFsPath), picked.branch)
  await vscode.commands.executeCommand('vscode.diff', leftUri, editor.document.uri, title)
}

export function registerCompareCommands(context: vscode.ExtensionContext): void {
  const provider = new BranchContentProvider()
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BRANCH_SCHEME, provider),
    vscode.commands.registerCommand('toolkit.compareWithBranch', () => compareWithBranch(provider))
  )
}
