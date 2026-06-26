import * as vscode from 'vscode'
import * as path from 'path'
import { commit, getStagedFiles, push } from '../../utils/git'
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

interface RepoCandidate {
  root: string
  name: string
  staged: string[]
  selectedInScm: boolean
}

interface RepoResult {
  name: string
  ok: boolean
  error?: string
}

/** A checkable repo row plus the empty-but-selected info rows, ready for the QuickPick. */
function buildQuickPickItems(
  candidates: RepoCandidate[],
  emptySelected: RepoCandidate[]
): (vscode.QuickPickItem & { root?: string })[] {
  // Pre-check the SCM-selected repos; if the user hasn't selected any, all.
  const prechecked = computePrechecked(candidates)
  const items: (vscode.QuickPickItem & { root?: string })[] = candidates.map((c, i) => ({
    label: c.name,
    description: `${c.staged.length} staged file${c.staged.length === 1 ? '' : 's'}`,
    detail: c.staged.slice(0, 5).join(', ') + (c.staged.length > 5 ? ', …' : ''),
    picked: prechecked[i],
    root: c.root
  }))

  // Surface repos the user selected in SCM that have nothing staged, so it's
  // clear they were not silently dropped — shown but not committable.
  if (emptySelected.length > 0) {
    items.push({ label: 'Selected, but nothing staged', kind: vscode.QuickPickItemKind.Separator })
    for (const c of emptySelected) {
      items.push({ label: `$(circle-slash) ${c.name}`, description: 'nothing staged — ignored', picked: false })
    }
  }
  return items
}

async function runCommitPush(repos: RepoCandidate[], message: string): Promise<RepoResult[]> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Commit & Push', cancellable: false },
    async progress => {
      const results: RepoResult[] = []
      let done = 0
      for (const repo of repos) {
        progress.report({
          message: `${repo.name} (${++done}/${repos.length})`,
          increment: 100 / repos.length
        })
        try {
          await commit(repo.root, message)
          await push(repo.root)
          results.push({ name: repo.name, ok: true })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          logError('git-multi-commit.runCommitPush', err)
          results.push({ name: repo.name, ok: false, error })
        }
      }
      return results
    }
  )
}

function reportResults(results: RepoResult[]): void {
  const ok = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  if (failed.length === 0) {
    vscode.window.showInformationMessage(
      `Committed & pushed in ${ok.length} repo${ok.length === 1 ? '' : 's'}: ${ok.map(r => r.name).join(', ')}`
    )
    return
  }
  const detail = failed.map(r => `• ${r.name}: ${r.error}`).join('\n')
  vscode.window
    .showWarningMessage(
      `Committed & pushed in ${ok.length}/${results.length} repos. ${failed.length} failed.`,
      { modal: false, detail },
      'Show Details'
    )
    .then(choice => {
      if (choice === 'Show Details') {
        vscode.window.showErrorMessage(failed.map(r => `${r.name}: ${r.error}`).join('  |  '))
      }
    })
}

async function commitPushAllRepos(): Promise<void> {
  const api = await getGitApi()
  if (!api || api.repositories.length === 0) {
    vscode.window.showInformationMessage('No git repositories are open.')
    return
  }

  // Gather staged files per repo in parallel.
  const repos: RepoCandidate[] = await Promise.all(
    api.repositories.map(async repo => {
      const root = repo.rootUri.fsPath
      let staged: string[] = []
      try {
        staged = await getStagedFiles(root)
      } catch (err) {
        logError('git-multi-commit.getStagedFiles', err)
      }
      return { root, name: path.basename(root), staged, selectedInScm: repo.ui.selected }
    })
  )

  const candidates = repos.filter(r => r.staged.length > 0)
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('No staged changes in any repository. Stage what you want to commit first.')
    return
  }

  // SCM-selected repos with nothing staged → shown as info rows only.
  const candidateRoots = new Set(candidates.map(c => c.root))
  const emptySelected = repos.filter(r => r.selectedInScm && !candidateRoots.has(r.root))

  const items = buildQuickPickItems(candidates, emptySelected)
  const chosen = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: 'Commit & Push — select repositories',
    placeHolder: 'Each repo commits its staged changes, then pushes'
  })
  if (!chosen) {
    return // cancelled
  }

  const chosenRoots = new Set(chosen.map(i => i.root).filter(Boolean) as string[])
  const targets = candidates.filter(c => chosenRoots.has(c.root))
  if (targets.length === 0) {
    return
  }

  const message = await vscode.window.showInputBox({
    title: `Commit message for ${targets.length} repo${targets.length === 1 ? '' : 's'}`,
    placeHolder: 'Same message used for every selected repo',
    validateInput: value => (value.trim().length === 0 ? 'A commit message is required.' : undefined)
  })
  if (message === undefined) {
    return // cancelled
  }

  const results = await runCommitPush(targets, message.trim())
  reportResults(results)
}

export function registerGitMultiCommitCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('toolkit.git.commitPushAllRepos', commitPushAllRepos))
}
