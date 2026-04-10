import * as vscode from 'vscode'
import { getRepoRoot, getCommitLog, getCommitMessage, editCommitMessage, CommitLogEntry } from '../utils/git'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return nonce
}

function buildEditWebviewHtml(commit: CommitLogEntry, message: string, nonce: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px;
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }

    .commit-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: 12px;
      background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.1));
      border-radius: 4px;
      border-left: 3px solid var(--vscode-textLink-foreground);
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }

    .commit-hash {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-textLink-foreground);
      font-weight: 600;
    }

    label {
      font-weight: 600;
      margin-bottom: 6px;
      display: block;
    }

    textarea {
      flex: 1;
      width: 100%;
      min-height: 120px;
      padding: 8px 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
      border-radius: 4px;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      align-items: center;
    }

    button {
      padding: 6px 14px;
      border: none;
      border-radius: 2px;
      font-size: var(--vscode-font-size, 13px);
      font-family: var(--vscode-font-family, sans-serif);
      cursor: pointer;
      outline: none;
    }

    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .shortcut-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="commit-info">
    <span class="commit-hash">${escapeHtml(commit.hash.substring(0, 8))}</span>
    <span>${escapeHtml(commit.author)} · ${escapeHtml(commit.date)}</span>
  </div>
  <label for="message">Commit message</label>
  <textarea id="message">${escapeHtml(message)}</textarea>
  <div class="actions">
    <button class="primary" id="apply">Apply</button>
    <button class="secondary" id="discard">Discard</button>
    <span class="shortcut-hint">Ctrl+Enter to apply</span>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const textarea = document.getElementById('message');
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    document.getElementById('apply').addEventListener('click', () => {
      vscode.postMessage({ command: 'apply', message: textarea.value });
    });
    document.getElementById('discard').addEventListener('click', () => {
      vscode.postMessage({ command: 'discard' });
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        vscode.postMessage({ command: 'apply', message: textarea.value });
      }
    });
  </script>
</body>
</html>`
}

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

let editPanel: vscode.WebviewPanel | undefined

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

      if (editPanel) {
        editPanel.dispose()
      }

      const repoRoot = await provider.getRepoRoot()
      if (!repoRoot) return

      let fullMessage: string
      try {
        fullMessage = await getCommitMessage(repoRoot, item.commit.hash)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to read commit message: ${err.message}`)
        return
      }

      const panel = vscode.window.createWebviewPanel(
        'toolkitEditCommitMessage',
        `Edit: ${item.commit.subject.substring(0, 50)}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      )

      editPanel = panel
      panel.onDidDispose(() => {
        if (editPanel === panel) editPanel = undefined
      })

      const nonce = getNonce()
      panel.webview.html = buildEditWebviewHtml(item.commit, fullMessage, nonce)

      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'discard') {
          panel.dispose()
          return
        }

        if (msg.command === 'apply') {
          const newMessage = (msg.message as string).trim()

          if (!newMessage) {
            vscode.window.showErrorMessage('Commit message cannot be empty.')
            return
          }

          if (newMessage === fullMessage.trim()) {
            panel.dispose()
            return
          }

          try {
            await vscode.window.withProgress({
              location: vscode.ProgressLocation.Notification,
              title: 'Updating commit message...',
              cancellable: false
            }, async () => {
              await editCommitMessage(repoRoot, item.commit.hash, newMessage)
            })

            panel.dispose()
            provider.refresh()
            vscode.window.showInformationMessage('Commit message updated.')
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to update commit message: ${err.message}`)
          }
        }
      })
    })
  )
}
