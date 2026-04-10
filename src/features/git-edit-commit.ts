import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { getRepoRoot, getCommitLog, getCommitMessage, editCommitMessage, CommitLogEntry } from '../utils/git'

class CommitTreeItem extends vscode.TreeItem {
  constructor(public readonly commit: CommitLogEntry) {
    super(commit.subject, vscode.TreeItemCollapsibleState.None)
    this.description = `${commit.author}, ${commit.date}`
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    md.appendMarkdown(`**${commit.subject}**\n\n`)
    md.appendMarkdown(`$(git-commit) \`${commit.hash.substring(0, 8)}\` · ${commit.author} · ${commit.date}`)
    this.tooltip = md
    this.contextValue = 'commit'
    this.iconPath = new vscode.ThemeIcon('git-commit')
  }
}

class CommitListProvider implements vscode.TreeDataProvider<CommitTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  private cachedRepoRoot: string | undefined

  async getRepoRoot(): Promise<string | undefined> {
    if (this.cachedRepoRoot) return this.cachedRepoRoot
    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) return undefined
    try {
      this.cachedRepoRoot = await getRepoRoot(folder.uri.fsPath)
      return this.cachedRepoRoot
    } catch {
      return undefined
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: CommitTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<CommitTreeItem[]> {
    const root = await this.getRepoRoot()
    if (!root) return []
    try {
      const commits = await getCommitLog(root)
      return commits.map(c => new CommitTreeItem(c))
    } catch {
      return []
    }
  }
}

interface EditSession {
  hash: string
  repoRoot: string
  tmpFile: string
  originalMessage: string
}

let activeEditSession: EditSession | undefined

function updateEditingContext(editor: vscode.TextEditor | undefined): void {
  const isEditing = !!(activeEditSession && editor?.document.uri.fsPath === activeEditSession.tmpFile)
  vscode.commands.executeCommand('setContext', 'toolkit.editingCommitMessage', isEditing)
}

async function cleanupEditSession(): Promise<void> {
  if (!activeEditSession) return
  const session = activeEditSession
  activeEditSession = undefined

  await vscode.commands.executeCommand('setContext', 'toolkit.editingCommitMessage', false)

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === session.tmpFile) {
        await vscode.window.tabGroups.close(tab)
      }
    }
  }

  try { fs.unlinkSync(session.tmpFile) } catch {}
}

export function registerGitEditCommitCommands(context: vscode.ExtensionContext): void {
  const provider = new CommitListProvider()

  const treeView = vscode.window.createTreeView('toolkitCommitList', {
    treeDataProvider: provider,
    showCollapseAll: false
  })

  context.subscriptions.push(
    treeView,

    vscode.commands.registerCommand('toolkit.gitCommitList.refresh', () => {
      provider.refresh()
    }),

    vscode.commands.registerCommand('toolkit.gitCommitList.editMessage', async (item?: CommitTreeItem) => {
      if (!item) return

      if (activeEditSession) {
        vscode.window.showWarningMessage('Already editing a commit message. Apply or discard first.')
        return
      }

      const repoRoot = await provider.getRepoRoot()
      if (!repoRoot) return

      try {
        const fullMessage = await getCommitMessage(repoRoot, item.commit.hash)
        const tmpFile = path.join(os.tmpdir(), `TOOLKIT_COMMIT_MSG`)
        fs.writeFileSync(tmpFile, fullMessage)

        activeEditSession = {
          hash: item.commit.hash,
          repoRoot,
          tmpFile,
          originalMessage: fullMessage
        }

        const doc = await vscode.workspace.openTextDocument(tmpFile)
        await vscode.window.showTextDocument(doc)
        updateEditingContext(vscode.window.activeTextEditor)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to read commit message: ${err.message}`)
      }
    }),

    vscode.commands.registerCommand('toolkit.gitCommitList.applyMessageEdit', async () => {
      if (!activeEditSession) return

      const session = activeEditSession
      const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === session.tmpFile)
      const newMessage = (doc ? doc.getText() : fs.readFileSync(session.tmpFile, 'utf-8')).trim()

      if (!newMessage) {
        vscode.window.showErrorMessage('Commit message cannot be empty.')
        return
      }

      if (newMessage === session.originalMessage.trim()) {
        await cleanupEditSession()
        return
      }

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Updating commit message...',
          cancellable: false
        }, async () => {
          await editCommitMessage(session.repoRoot, session.hash, newMessage)
        })

        await cleanupEditSession()
        provider.refresh()
        vscode.window.showInformationMessage('Commit message updated.')
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to update commit message: ${err.message}`)
      }
    }),

    vscode.commands.registerCommand('toolkit.gitCommitList.discardMessageEdit', async () => {
      await cleanupEditSession()
    }),

    vscode.window.onDidChangeActiveTextEditor(editor => {
      updateEditingContext(editor)
    }),

    vscode.workspace.onDidCloseTextDocument(doc => {
      if (activeEditSession && doc.uri.fsPath === activeEditSession.tmpFile) {
        activeEditSession = undefined
        vscode.commands.executeCommand('setContext', 'toolkit.editingCommitMessage', false)
      }
    })
  )
}
