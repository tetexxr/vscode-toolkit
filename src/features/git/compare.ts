import * as vscode from 'vscode'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import {
  buildDiffTitle,
  buildMultiDiffTitle,
  parseCommitLog,
  parseGitBranchList,
  parseNameStatusZ,
  relativizeToRepo,
  type CommitEntry,
  type FileChange
} from './compare-utils'
import { mapWithConcurrency } from '../../utils/async'

/** Above this many changed files, ask for confirmation before opening the multi-diff view. */
const MANY_FILES_THRESHOLD = 100

const BRANCH_SCHEME = 'toolkit-branch'

/** Above this many cached left-hand sides, the oldest entries are evicted. */
const CACHE_MAX_ENTRIES = 500

/** Serves file content read from a git ref as a virtual document, so the diff editor
 * doesn't materialize a standalone tab for the left-hand side. */
class BranchContentProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>()
  private emitter = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this.emitter.event

  set(uri: vscode.Uri, content: string): void {
    const key = uri.toString()
    this.cache.delete(key)
    this.cache.set(key, content)
    // Bounded FIFO eviction so a long session never accumulates the content
    // of every file ever compared.
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
    this.emitter.fire(uri)
  }

  delete(uri: vscode.Uri): void {
    this.cache.delete(uri.toString())
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? ''
  }
}

function buildBranchUri(branch: string, relPath: string): vscode.Uri {
  // Path → /<relPath>, so VS Code can derive the language from the extension.
  // The branch travels in the query: appending it to the path would make
  // (branch 'a', path 'b/c.ts') collide with (branch 'a/b', path 'c.ts').
  return vscode.Uri.from({
    scheme: BRANCH_SCHEME,
    path: '/' + relPath,
    query: branch
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

async function isTrackedInRef(repoRoot: string, ref: string, relPath: string): Promise<boolean> {
  const { code } = await runGit(['cat-file', '-e', `${ref}:${relPath}`], repoRoot)
  return code === 0
}

/** Lists the most recent commits reachable from HEAD, newest first. */
async function listCommits(repoRoot: string, count: number): Promise<CommitEntry[]> {
  const { stdout, code } = await runGit(
    ['log', `--max-count=${count}`, '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1e'],
    repoRoot
  )
  if (code !== 0) {
    return []
  }
  return parseCommitLog(stdout)
}

/** Resolves an arbitrary ref (hash, tag, HEAD~3, …) to a full commit hash, or null if it isn't one. */
async function resolveCommit(repoRoot: string, ref: string): Promise<string | null> {
  const { stdout, code } = await runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot)
  if (code !== 0) {
    return null
  }
  const trimmed = stdout.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Lets the user pick a commit to compare against: the recent log, plus an entry to type
 * an arbitrary hash or ref (a tag, `HEAD~3`, a SHA from another branch, …).
 * Returns the full hash and a short label for titles, or null if cancelled.
 */
async function pickCommit(
  repoRoot: string,
  placeHolder: string
): Promise<{ hash: string; short: string } | null> {
  const commits = await listCommits(repoRoot, 100)

  type Item = vscode.QuickPickItem & { commit?: CommitEntry; enter?: boolean }
  const enterItem: Item = {
    label: '$(edit) Enter a commit hash or ref…',
    alwaysShow: true,
    enter: true
  }
  const items: Item[] = [
    enterItem,
    ...commits.map(c => ({
      label: `$(git-commit) ${c.short} ${c.subject}`,
      description: `${c.author} · ${c.relativeDate}`,
      commit: c
    }))
  ]
  const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true })
  if (!picked) {
    return null
  }
  if (picked.commit) {
    return { hash: picked.commit.hash, short: picked.commit.short }
  }

  // Manual entry: validate that whatever the user typed resolves to a commit.
  const entered = await vscode.window.showInputBox({
    placeHolder: 'e.g. a1b2c3d, v1.2.0, HEAD~3, origin/main',
    prompt: 'Commit hash or ref to compare against'
  })
  if (entered === undefined) {
    return null
  }
  const trimmed = entered.trim()
  if (trimmed.length === 0) {
    return null
  }
  const hash = await resolveCommit(repoRoot, trimmed)
  if (!hash) {
    vscode.window.showWarningMessage(`Toolkit: "${trimmed}" is not a valid commit or ref.`)
    return null
  }
  return { hash, short: hash.slice(0, 8) }
}

/** Validates a file target and locates its repo. Reports the reason and returns null on failure. */
async function resolveFileTarget(
  uri?: vscode.Uri
): Promise<{ targetUri: vscode.Uri; repoRoot: string; relPath: string } | null> {
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri
  if (!targetUri || targetUri.scheme === 'untitled') {
    vscode.window.showInformationMessage('Toolkit: open or select a saved file first.')
    return null
  }
  if (targetUri.scheme !== 'file') {
    vscode.window.showInformationMessage('Toolkit: this command only works on local files.')
    return null
  }

  const fileFsPath = targetUri.fsPath
  const repoRoot = await getRepoRoot(path.dirname(fileFsPath))
  if (!repoRoot) {
    vscode.window.showWarningMessage('Toolkit: the active file is not inside a git repository.')
    return null
  }
  return { targetUri, repoRoot, relPath: relativizeToRepo(repoRoot, fileFsPath) }
}

/**
 * Opens a diff of the working-tree file against its content at `ref`. `refLabel` is what
 * the diff title shows (a branch name or a short hash); `ref` is what git reads from.
 */
async function diffFileAgainstRef(
  provider: BranchContentProvider,
  targetUri: vscode.Uri,
  repoRoot: string,
  relPath: string,
  ref: string,
  refLabel: string
): Promise<void> {
  const fileName = path.basename(targetUri.fsPath)
  const tracked = await isTrackedInRef(repoRoot, ref, relPath)
  if (!tracked) {
    vscode.window.showWarningMessage(`Toolkit: ${fileName} does not exist at "${refLabel}".`)
    return
  }

  const content = await showFromRef(repoRoot, ref, relPath)
  if (content === null) {
    vscode.window.showWarningMessage(`Toolkit: could not read ${fileName} from "${refLabel}".`)
    return
  }

  const leftUri = buildBranchUri(refLabel, relPath)
  provider.set(leftUri, content)
  const title = buildDiffTitle(fileName, refLabel)
  await vscode.commands.executeCommand('vscode.diff', leftUri, targetUri, title)
}

type CompareKind = 'branch' | 'commit'

/** First step of every comparison: choose whether to compare against a branch or a commit. */
async function pickCompareKind(): Promise<CompareKind | null> {
  // `kind` is taken by QuickPickItem (separators), so the choice travels as `value`.
  type Item = vscode.QuickPickItem & { value: CompareKind }
  const items: Item[] = [
    { label: '$(git-branch) Branch', description: 'Another local branch', value: 'branch' },
    { label: '$(git-commit) Commit', description: 'A specific commit', value: 'commit' }
  ]
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Compare against a branch or a commit?'
  })
  return picked ? picked.value : null
}

async function compareFile(provider: BranchContentProvider, uri?: vscode.Uri): Promise<void> {
  const target = await resolveFileTarget(uri)
  if (!target) {
    return
  }
  const kind = await pickCompareKind()
  if (!kind) {
    return
  }
  const fileName = path.basename(target.targetUri.fsPath)
  if (kind === 'branch') {
    const branch = await pickBranch(target.repoRoot, `Compare ${fileName} against which branch?`)
    if (!branch) {
      return
    }
    await diffFileAgainstRef(provider, target.targetUri, target.repoRoot, target.relPath, branch, branch)
    return
  }
  const commit = await pickCommit(target.repoRoot, `Compare ${fileName} against which commit?`)
  if (!commit) {
    return
  }
  await diffFileAgainstRef(
    provider,
    target.targetUri,
    target.repoRoot,
    target.relPath,
    commit.hash,
    commit.short
  )
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
 * Compares everything under `relFolder` (or the whole repo when omitted) against `base`,
 * opening a single multi-file diff view. The left side is each file's content at `base`;
 * the right side is the file in the working tree. `refLabel` is what the title and the
 * virtual left-hand URIs are tagged with (a branch name or a short hash).
 */
async function compareScopeAgainstBase(
  provider: BranchContentProvider,
  repoRoot: string,
  base: string,
  refLabel: string,
  relFolder: string | undefined,
  scopeLabel: string
): Promise<void> {
  const changes = await listChangedFiles(repoRoot, base, relFolder)
  if (changes.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: no changes between ${scopeLabel} and "${refLabel}".`)
    return
  }

  if (changes.length > MANY_FILES_THRESHOLD) {
    const proceed = await vscode.window.showWarningMessage(
      `Toolkit: ${changes.length} files changed between ${scopeLabel} and "${refLabel}". Open them all?`,
      { modal: true },
      'Open'
    )
    if (proceed !== 'Open') {
      return
    }
  }

  // Resolve every left-hand side (base content) with bounded concurrency:
  // unbounded Promise.all would spawn one git process per changed file at once.
  const resources = await mapWithConcurrency(changes, 8, async change => {
      let left: vscode.Uri | undefined
      if (change.oldPath !== null) {
        const content = await showFromRef(repoRoot, base, change.oldPath)
        if (content !== null) {
          left = buildBranchUri(refLabel, change.oldPath)
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

  const title = buildMultiDiffTitle(scopeLabel, refLabel, resources.length)
  await vscode.commands.executeCommand('vscode.changes', title, resources)
}

/**
 * Compares a scope against `branch`. Unlike the commit variant, the left side is each file's
 * content at the merge-base of `branch` and HEAD — so the view previews exactly what merging
 * would bring in from the current branch's side, not every difference between the two tips.
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
  await compareScopeAgainstBase(provider, repoRoot, mergeBase, branch, relFolder, scopeLabel)
}

/**
 * Compares a scope against a specific `commit`. The diff is direct (commit ↔ working tree) —
 * "what changed since that commit" — because a commit is a fixed point in history rather than
 * a divergent line, so merge-base semantics wouldn't match the user's intent.
 */
async function compareScopeWithCommit(
  provider: BranchContentProvider,
  repoRoot: string,
  commit: { hash: string; short: string },
  relFolder: string | undefined,
  scopeLabel: string
): Promise<void> {
  await compareScopeAgainstBase(provider, repoRoot, commit.hash, commit.short, relFolder, scopeLabel)
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

/** The directory a resource lives in: itself when it's a folder, else its parent. */
async function resourceDirectory(uri: vscode.Uri): Promise<string> {
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    if (stat.type & vscode.FileType.Directory) {
      return uri.fsPath
    }
  } catch {
    // Can't stat — assume a file and use its parent.
  }
  return path.dirname(uri.fsPath)
}

/** The repo and label for a project-wide comparison from an optional clicked resource. */
async function resolveProjectScope(
  uri?: vscode.Uri
): Promise<{ repoRoot: string; relFolder: undefined; scopeLabel: string } | null> {
  // From a clicked resource, target the repo that contains it; otherwise fall
  // back to the active workspace folder (and prompt when there are several).
  if (uri && uri.scheme === 'file') {
    const repoRoot = await getRepoRoot(await resourceDirectory(uri))
    if (!repoRoot) {
      vscode.window.showWarningMessage('Toolkit: this file is not inside a git repository.')
      return null
    }
    return { repoRoot, relFolder: undefined, scopeLabel: path.basename(repoRoot) }
  }
  const resolved = await resolveProjectRepoRoot()
  if (!resolved) {
    return null
  }
  return { repoRoot: resolved.repoRoot, relFolder: undefined, scopeLabel: resolved.label }
}

/** The repo, relative folder, and label for a folder-scoped comparison. */
async function resolveFolderScope(
  resourceUri?: vscode.Uri
): Promise<{ repoRoot: string; relFolder: string; scopeLabel: string } | null> {
  if (!resourceUri || resourceUri.scheme !== 'file') {
    vscode.window.showInformationMessage('Toolkit: right-click a file or folder in the Explorer to use this command.')
    return null
  }
  // On a file, compare the folder it sits in.
  const folderPath = await resourceDirectory(resourceUri)
  const repoRoot = await getRepoRoot(folderPath)
  if (!repoRoot) {
    vscode.window.showWarningMessage('Toolkit: this folder is not inside a git repository.')
    return null
  }
  const relFolder = relativizeToRepo(repoRoot, folderPath)
  const scopeLabel = relFolder.length > 0 ? relFolder : path.basename(repoRoot)
  return { repoRoot, relFolder, scopeLabel }
}

/**
 * Shared tail of the folder/project commands: ask branch-or-commit, pick the ref, and open
 * the multi-file diff. `scopeName` is woven into the picker prompt (e.g. `the whole project`
 * or `"src/foo"`).
 */
async function compareScopeWithChosenRef(
  provider: BranchContentProvider,
  scope: { repoRoot: string; relFolder: string | undefined; scopeLabel: string },
  scopeName: string
): Promise<void> {
  const kind = await pickCompareKind()
  if (!kind) {
    return
  }
  if (kind === 'branch') {
    const branch = await pickBranch(scope.repoRoot, `Compare ${scopeName} against which branch?`)
    if (!branch) {
      return
    }
    await compareScopeWithBranch(provider, scope.repoRoot, branch, scope.relFolder, scope.scopeLabel)
    return
  }
  const commit = await pickCommit(scope.repoRoot, `Compare ${scopeName} against which commit?`)
  if (!commit) {
    return
  }
  await compareScopeWithCommit(provider, scope.repoRoot, commit, scope.relFolder, scope.scopeLabel)
}

async function compareProject(provider: BranchContentProvider, uri?: vscode.Uri): Promise<void> {
  const scope = await resolveProjectScope(uri)
  if (!scope) {
    return
  }
  await compareScopeWithChosenRef(provider, scope, 'the whole project')
}

async function compareFolder(provider: BranchContentProvider, resourceUri?: vscode.Uri): Promise<void> {
  const scope = await resolveFolderScope(resourceUri)
  if (!scope) {
    return
  }
  await compareScopeWithChosenRef(provider, scope, `"${scope.scopeLabel}"`)
}

export function registerCompareCommands(context: vscode.ExtensionContext): void {
  const provider = new BranchContentProvider()
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BRANCH_SCHEME, provider),
    // Free the cached left-hand side once its diff document is closed.
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.scheme === BRANCH_SCHEME) {
        provider.delete(doc.uri)
      }
    }),
    vscode.commands.registerCommand('toolkit.compareWithBranch', (uri?: vscode.Uri) =>
      compareFile(provider, uri)
    ),
    vscode.commands.registerCommand('toolkit.compareProjectWithBranch', (uri?: vscode.Uri) =>
      compareProject(provider, uri)
    ),
    vscode.commands.registerCommand('toolkit.compareFolderWithBranch', (uri?: vscode.Uri) =>
      compareFolder(provider, uri)
    )
  )
}
