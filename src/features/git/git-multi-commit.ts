import * as vscode from 'vscode'
import * as path from 'path'
import { commit, getChangedFiles, getCurrentBranch, getStagedFiles, getUpstream, push, stageAll, sync } from '../../utils/git'
import { logError } from '../../utils/logger'
import { computePrechecked } from './git-multi-commit-utils'

/** Minimal shape of a vscode.git repository we need here. */
interface GitRepository {
  readonly rootUri: vscode.Uri
  readonly ui: { readonly selected: boolean }
}

interface GitApi {
  readonly repositories: ReadonlyArray<GitRepository>
}

interface GitExtension {
  getAPI(version: 1): GitApi
}

async function getGitApi(): Promise<GitApi | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git')
  if (!ext) {
    return undefined
  }
  const exports = ext.isActive ? ext.exports : await ext.activate()
  return exports.getAPI(1)
}

interface RepoInfo {
  root: string
  name: string
  selectedInScm: boolean
  staged: string[]
  changed: string[]
  branch: string
  upstream?: string
}

interface RepoResult {
  name: string
  ok: boolean
  error?: string
}

/** Reads each open repository's staged files, branch and upstream in parallel. */
async function gatherRepos(api: GitApi): Promise<RepoInfo[]> {
  return Promise.all(
    api.repositories.map(async repo => {
      const root = repo.rootUri.fsPath
      const [staged, changed, branch, upstream] = await Promise.all([
        getStagedFiles(root).catch(err => {
          logError('git-multi-commit.getStagedFiles', err)
          return [] as string[]
        }),
        getChangedFiles(root)
          .then(files => files.map(f => f.path))
          .catch(err => {
            logError('git-multi-commit.getChangedFiles', err)
            return [] as string[]
          }),
        getCurrentBranch(root).catch(() => ''),
        getUpstream(root)
      ])
      return { root, name: path.basename(root), selectedInScm: repo.ui.selected, staged, changed, branch, upstream }
    })
  )
}

/**
 * Builds the confirmation list: one checkable row per candidate (pre-checked per
 * SCM selection) plus, after a separator, any non-committable info rows.
 */
function buildQuickPickItems(
  candidates: RepoInfo[],
  describe: (repo: RepoInfo) => Pick<vscode.QuickPickItem, 'description' | 'detail'>,
  infoRows: { label: string; description: string }[]
): (vscode.QuickPickItem & { root?: string })[] {
  const prechecked = computePrechecked(candidates)
  const items: (vscode.QuickPickItem & { root?: string })[] = candidates.map((c, i) => ({
    label: c.name,
    ...describe(c),
    picked: prechecked[i],
    root: c.root
  }))

  if (infoRows.length > 0) {
    items.push({ label: 'Selected, but nothing to do', kind: vscode.QuickPickItemKind.Separator })
    for (const row of infoRows) {
      items.push({ label: `$(circle-slash) ${row.label}`, description: row.description, picked: false })
    }
  }
  return items
}

/** Shows the confirmation quick pick and returns the chosen repositories. */
async function pickTargets(
  candidates: RepoInfo[],
  describe: (repo: RepoInfo) => Pick<vscode.QuickPickItem, 'description' | 'detail'>,
  infoRows: { label: string; description: string }[],
  title: string,
  placeHolder: string
): Promise<RepoInfo[] | undefined> {
  const items = buildQuickPickItems(candidates, describe, infoRows)
  const chosen = await vscode.window.showQuickPick(items, { canPickMany: true, title, placeHolder })
  if (!chosen) {
    return undefined // cancelled
  }
  const chosenRoots = new Set(chosen.map(i => i.root).filter(Boolean) as string[])
  return candidates.filter(c => chosenRoots.has(c.root))
}

async function runPerRepo(
  repos: RepoInfo[],
  title: string,
  op: (repo: RepoInfo) => Promise<void>
): Promise<RepoResult[]> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: false },
    async progress => {
      const results: RepoResult[] = []
      let done = 0
      for (const repo of repos) {
        progress.report({ message: `${repo.name} (${++done}/${repos.length})`, increment: 100 / repos.length })
        try {
          await op(repo)
          results.push({ name: repo.name, ok: true })
        } catch (err) {
          logError('git-multi-commit.runPerRepo', err)
          results.push({ name: repo.name, ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
      return results
    }
  )
}

function reportResults(results: RepoResult[], doneVerb: string): void {
  const ok = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  if (failed.length === 0) {
    vscode.window.showInformationMessage(
      `${doneVerb} in ${ok.length} repositor${ok.length === 1 ? 'y' : 'ies'}: ${ok.map(r => r.name).join(', ')}`
    )
    return
  }
  const detail = failed.map(r => `• ${r.name}: ${r.error}`).join('\n')
  vscode.window
    .showWarningMessage(
      `${doneVerb} in ${ok.length}/${results.length} repositories. ${failed.length} failed.`,
      { modal: false, detail },
      'Show Details'
    )
    .then(choice => {
      if (choice === 'Show Details') {
        vscode.window.showErrorMessage(failed.map(r => `${r.name}: ${r.error}`).join('  |  '))
      }
    })
}

/* -------------------------------------------------------------------------- */
/*  Commit / Commit & Push                                                    */
/* -------------------------------------------------------------------------- */

interface CommitAction {
  readonly title: string
  readonly doneVerb: string
  readonly push: boolean
  /** Stage every working-tree change before committing, instead of committing only what is already staged. */
  readonly stageAll: boolean
}

const COMMIT_ONLY: CommitAction = { title: 'Commit', doneVerb: 'Committed', push: false, stageAll: false }
const COMMIT_PUSH: CommitAction = { title: 'Commit & Push', doneVerb: 'Committed & pushed', push: true, stageAll: false }
const STAGE_COMMIT: CommitAction = { title: 'Stage All & Commit', doneVerb: 'Staged & committed', push: false, stageAll: true }
const STAGE_COMMIT_PUSH: CommitAction = {
  title: 'Stage All, Commit & Push',
  doneVerb: 'Staged, committed & pushed',
  push: true,
  stageAll: true
}

async function commitAcrossRepos(action: CommitAction): Promise<void> {
  const api = await getGitApi()
  if (!api || api.repositories.length === 0) {
    vscode.window.showInformationMessage('No git repositories are open.')
    return
  }

  // "Stage all" commits whatever is in the working tree, so candidacy is driven by
  // changed files; the other actions commit only what the user already staged.
  const noun = action.stageAll ? 'changed' : 'staged'
  const filesOf = (r: RepoInfo) => (action.stageAll ? r.changed : r.staged)

  const repos = await gatherRepos(api)
  const candidates = repos.filter(r => filesOf(r).length > 0)
  if (candidates.length === 0) {
    const hint = action.stageAll
      ? 'No changes in any repository.'
      : 'No staged changes in any repository. Stage what you want to commit first.'
    vscode.window.showInformationMessage(hint)
    return
  }

  // SCM-selected repos with nothing to do → shown as info rows only.
  const candidateRoots = new Set(candidates.map(c => c.root))
  const infoRows = repos
    .filter(r => r.selectedInScm && !candidateRoots.has(r.root))
    .map(r => ({ label: r.name, description: `nothing ${noun} — ignored` }))

  const targets = await pickTargets(
    candidates,
    c => {
      const files = filesOf(c)
      return {
        description: `${files.length} ${noun} file${files.length === 1 ? '' : 's'}`,
        detail: files.slice(0, 5).join(', ') + (files.length > 5 ? ', …' : '')
      }
    },
    infoRows,
    `${action.title} — select repositories`,
    `Each repository ${action.stageAll ? 'stages all its changes, commits' : 'commits its staged changes'}${action.push ? ', then pushes' : ''}`
  )
  if (!targets || targets.length === 0) {
    return
  }

  const message = await vscode.window.showInputBox({
    title: `Commit message for ${targets.length} repositor${targets.length === 1 ? 'y' : 'ies'}`,
    placeHolder: 'Same message used for every selected repository',
    validateInput: value => (value.trim().length === 0 ? 'A commit message is required.' : undefined)
  })
  if (message === undefined) {
    return // cancelled
  }

  const results = await runPerRepo(targets, action.title, async repo => {
    if (action.stageAll) {
      await stageAll(repo.root)
    }
    await commit(repo.root, message.trim())
    if (action.push) {
      await push(repo.root)
    }
  })
  reportResults(results, action.doneVerb)
}

/* -------------------------------------------------------------------------- */
/*  Synchronize (pull + push)                                                 */
/* -------------------------------------------------------------------------- */

async function syncAcrossRepos(): Promise<void> {
  const api = await getGitApi()
  if (!api || api.repositories.length === 0) {
    vscode.window.showInformationMessage('No git repositories are open.')
    return
  }

  // Sync doesn't depend on staged changes — every open repository is a candidate.
  const candidates = await gatherRepos(api)

  const targets = await pickTargets(
    candidates,
    c => ({ description: c.upstream ? `${c.branch} → ${c.upstream}` : `${c.branch} (no upstream)` }),
    [],
    'Synchronize — select repositories',
    'Each repository pulls, then pushes'
  )
  if (!targets || targets.length === 0) {
    return
  }

  const results = await runPerRepo(targets, 'Synchronize', repo => sync(repo.root))
  reportResults(results, 'Synchronized')
}

export function registerGitMultiCommitCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.git.syncAllRepos', () => syncAcrossRepos()),
    vscode.commands.registerCommand('toolkit.git.commitAllRepos', () => commitAcrossRepos(COMMIT_ONLY)),
    vscode.commands.registerCommand('toolkit.git.commitPushAllRepos', () => commitAcrossRepos(COMMIT_PUSH)),
    vscode.commands.registerCommand('toolkit.git.stageCommitAllRepos', () => commitAcrossRepos(STAGE_COMMIT)),
    vscode.commands.registerCommand('toolkit.git.stageCommitPushAllRepos', () => commitAcrossRepos(STAGE_COMMIT_PUSH))
  )
}
