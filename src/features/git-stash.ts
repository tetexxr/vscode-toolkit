import * as vscode from 'vscode'
import {
  applyStash,
  createStash,
  dropStash,
  getRepoRoot,
  getStashDiff,
  listStashes,
  popStash,
  type StashEntry
} from '../utils/git'
import { logError } from '../utils/logger'

const VIEW_ID = 'toolkitGitStash'
const SCHEME = 'toolkit-stash'

async function resolveRepoRoot(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    return undefined
  }
  try {
    return await getRepoRoot(folder.uri.fsPath)
  } catch (err) {
    logError('git-stash.resolveRepoRoot', err)
    return undefined
  }
}

/* -------------------------------------------------------------------------- */
/*  Diff preview                                                              */
/* -------------------------------------------------------------------------- */

function buildStashUri(repoRoot: string, ref: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: `/${ref.replace(/[^a-z0-9]/gi, '_')}.diff`,
    query: `${encodeURIComponent(repoRoot)}|${encodeURIComponent(ref)}`
  })
}

class StashDiffProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [repo, ref] = uri.query.split('|')
    if (!repo || !ref) {
      return ''
    }
    try {
      return await getStashDiff(decodeURIComponent(repo), decodeURIComponent(ref))
    } catch (err) {
      logError('git-stash.diff', err)
      return ''
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Tree view                                                                 */
/* -------------------------------------------------------------------------- */

interface StashNode {
  repoRoot: string
  entry: StashEntry
}

class StashProvider implements vscode.TreeDataProvider<StashNode> {
  private emitter = new vscode.EventEmitter<StashNode | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  refresh(): void {
    this.emitter.fire()
  }

  getTreeItem(node: StashNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.entry.message, vscode.TreeItemCollapsibleState.None)
    item.description = node.entry.relativeDate
    item.tooltip = `${node.entry.ref} · ${node.entry.message}`
    item.iconPath = new vscode.ThemeIcon('archive')
    item.contextValue = 'stash'
    item.command = {
      title: 'Open Stash Diff',
      command: 'toolkit.gitStash.open',
      arguments: [node]
    }
    return item
  }

  async getChildren(parent?: StashNode): Promise<StashNode[]> {
    if (parent) {
      return []
    }
    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) {
      return []
    }
    try {
      const entries = await listStashes(repoRoot)
      return entries.map(entry => ({ repoRoot, entry }))
    } catch (err) {
      logError('git-stash.list', err)
      return []
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

function gitErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function openStashDiff(node: StashNode): Promise<void> {
  const uri = buildStashUri(node.repoRoot, node.entry.ref)
  const document = await vscode.workspace.openTextDocument(uri)
  await vscode.languages.setTextDocumentLanguage(document, 'diff')
  await vscode.window.showTextDocument(document, { preview: true })
}

async function createStashCommand(provider: StashProvider): Promise<void> {
  const repoRoot = await resolveRepoRoot()
  if (!repoRoot) {
    vscode.window.showInformationMessage('Toolkit: open a folder inside a git repository first.')
    return
  }
  const scope = await vscode.window.showQuickPick(
    [
      { label: '$(check) Tracked changes only', untracked: false },
      { label: '$(files) Include untracked files', untracked: true }
    ],
    { placeHolder: 'What should the stash include?' }
  )
  if (!scope) {
    return
  }
  const message = await vscode.window.showInputBox({
    prompt: 'Stash message (optional)',
    placeHolder: 'WIP'
  })
  if (message === undefined) {
    return
  }
  try {
    await createStash(repoRoot, message, scope.untracked)
    provider.refresh()
  } catch (err) {
    const text = gitErrorMessage(err)
    if (/no local changes/i.test(text)) {
      vscode.window.showInformationMessage('Toolkit: there are no local changes to stash.')
    } else {
      vscode.window.showWarningMessage(`Toolkit: could not create the stash. ${text}`)
    }
  }
}

async function applyStashCommand(provider: StashProvider, node: StashNode): Promise<void> {
  try {
    await applyStash(node.repoRoot, node.entry.ref)
    provider.refresh()
  } catch (err) {
    vscode.window.showWarningMessage(`Toolkit: could not apply the stash. ${gitErrorMessage(err)}`)
  }
}

async function popStashCommand(provider: StashProvider, node: StashNode): Promise<void> {
  try {
    await popStash(node.repoRoot, node.entry.ref)
    provider.refresh()
  } catch (err) {
    vscode.window.showWarningMessage(
      `Toolkit: could not pop the stash (it was kept). ${gitErrorMessage(err)}`
    )
    provider.refresh()
  }
}

async function dropStashCommand(provider: StashProvider, node: StashNode): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    `Drop ${node.entry.ref}? This permanently deletes the stash.`,
    { modal: true },
    'Drop'
  )
  if (choice !== 'Drop') {
    return
  }
  try {
    await dropStash(node.repoRoot, node.entry.ref)
    provider.refresh()
  } catch (err) {
    vscode.window.showWarningMessage(`Toolkit: could not drop the stash. ${gitErrorMessage(err)}`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerGitStashCommands(context: vscode.ExtensionContext): void {
  const provider = new StashProvider()
  const treeView = vscode.window.createTreeView<StashNode>(VIEW_ID, { treeDataProvider: provider })
  context.subscriptions.push(
    treeView,
    // Catch stashes created/dropped elsewhere (terminal, SCM) when the view reappears.
    treeView.onDidChangeVisibility(e => {
      if (e.visible) {
        provider.refresh()
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new StashDiffProvider()),
    vscode.commands.registerCommand('toolkit.gitStash.create', () => createStashCommand(provider)),
    vscode.commands.registerCommand('toolkit.gitStash.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('toolkit.gitStash.open', (node: StashNode) => openStashDiff(node)),
    vscode.commands.registerCommand('toolkit.gitStash.apply', (node: StashNode) => applyStashCommand(provider, node)),
    vscode.commands.registerCommand('toolkit.gitStash.pop', (node: StashNode) => popStashCommand(provider, node)),
    vscode.commands.registerCommand('toolkit.gitStash.drop', (node: StashNode) => dropStashCommand(provider, node))
  )
}
