import * as vscode from 'vscode'
import {
  getRepoRoot, getCommitLog, getCommitMessage, getCommitFiles, getCommitDiff,
  editCommitMessage, CommitLogEntry, CommitFileInfo
} from '../utils/git'

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

function renderFileList(files: CommitFileInfo[]): string {
  const html: string[] = []
  for (const file of files) {
    const statusClass = file.status === 'A' ? 'added' : file.status === 'D' ? 'deleted' : 'modified'
    const lastSlash = file.path.lastIndexOf('/')
    const dir = lastSlash >= 0 ? file.path.substring(0, lastSlash + 1) : ''
    const name = lastSlash >= 0 ? file.path.substring(lastSlash + 1) : file.path
    const additions = file.additions > 0 ? `<span class="stat-add">+${file.additions}</span>` : ''
    const deletions = file.deletions > 0 ? `<span class="stat-del">-${file.deletions}</span>` : ''

    html.push(
      `<div class="file-entry" data-path="${escapeHtml(file.path)}">` +
      `<span class="file-status ${statusClass}">${escapeHtml(file.status)}</span>` +
      `<span class="file-path"><span class="file-dir">${escapeHtml(dir)}</span>${escapeHtml(name)}</span>` +
      `<span class="file-stats">${additions}${deletions}</span>` +
      `</div>`
    )
  }
  return html.join('\n')
}

function renderDiff(raw: string): string {
  const lines = raw.split('\n')
  const html: string[] = []
  let inDiff = false

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (inDiff) html.push('</div>')
      const match = line.match(/b\/(.+)$/)
      const filePath = match ? match[1] : ''
      html.push(`<div class="diff-block" data-diff-path="${escapeHtml(filePath)}">`)
      html.push(`<div class="diff-header">${escapeHtml(line)}</div>`)
      inDiff = true
      continue
    }

    if (!inDiff) continue

    if (line.startsWith('@@')) {
      html.push(`<div class="hunk-header">${escapeHtml(line)}</div>`)
    } else if (line.startsWith('+')) {
      html.push(`<div class="line-add">${escapeHtml(line)}</div>`)
    } else if (line.startsWith('-')) {
      html.push(`<div class="line-del">${escapeHtml(line)}</div>`)
    } else if (
      line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') ||
      line.startsWith('new file') || line.startsWith('deleted file') ||
      line.startsWith('similarity') || line.startsWith('rename') ||
      line.startsWith('Binary')
    ) {
      html.push(`<div class="diff-meta">${escapeHtml(line)}</div>`)
    } else {
      html.push(`<div class="line-ctx">${escapeHtml(line)}</div>`)
    }
  }

  if (inDiff) html.push('</div>')
  return html.join('\n')
}

function buildEditWebviewHtml(
  commit: CommitLogEntry,
  message: string,
  files: CommitFileInfo[],
  diffRaw: string,
  nonce: string
): string {
  const fileListHtml = renderFileList(files)
  const diffHtml = renderDiff(diffRaw)
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0)
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0)

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
      padding: 0 20px 40px;
      margin: 0;
      line-height: 1.5;
    }

    /* --- Edit section --- */

    .edit-section {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--vscode-editor-background);
      padding: 16px 0 12px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    }

    .commit-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      margin-bottom: 10px;
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
      margin-bottom: 4px;
      display: block;
    }

    textarea {
      width: 100%;
      min-height: 60px;
      max-height: 200px;
      padding: 6px 10px;
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

    textarea:focus { border-color: var(--vscode-focusBorder); }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      align-items: center;
    }

    button {
      padding: 4px 12px;
      border: none;
      border-radius: 2px;
      font-size: var(--vscode-font-size, 13px);
      cursor: pointer;
      outline: none;
    }

    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    .shortcut-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-left: 4px;
    }

    /* --- Files section --- */

    .section-header {
      font-weight: 600;
      font-size: 1em;
      padding: 12px 0 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-header .badge {
      font-size: 0.8em;
      font-weight: normal;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .section-stats {
      font-size: 0.85em;
      font-weight: normal;
      color: var(--vscode-descriptionForeground);
      margin-left: auto;
    }

    .file-list {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      border-radius: 4px;
      overflow: hidden;
    }

    .file-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 10px;
      cursor: pointer;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }

    .file-entry:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-entry + .file-entry {
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
    }

    .file-status {
      font-weight: 600;
      font-size: 0.85em;
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    .file-status.added { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
    .file-status.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
    .file-status.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }

    .file-path {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-dir { color: var(--vscode-descriptionForeground); }

    .file-stats {
      flex-shrink: 0;
      display: flex;
      gap: 6px;
      font-size: 0.85em;
    }

    .stat-add { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
    .stat-del { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }

    /* --- Diff section --- */

    .diff-block {
      margin: 8px 0;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
    }

    .diff-header, .diff-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      padding: 0 8px;
      background: var(--vscode-diffEditor-unchangedRegionBackground, rgba(128,128,128,0.05));
    }

    .hunk-header {
      color: var(--vscode-textLink-foreground);
      background: var(--vscode-diffEditor-unchangedRegionBackground, rgba(128,128,128,0.05));
      padding: 2px 8px;
      font-size: 0.9em;
    }

    .line-add {
      background: var(--vscode-diffEditor-insertedLineBackground, rgba(0,180,0,0.15));
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .line-del {
      background: var(--vscode-diffEditor-removedLineBackground, rgba(255,0,0,0.15));
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .line-ctx {
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="edit-section">
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
  </div>

  <div class="files-section">
    <div class="section-header">
      Changed Files <span class="badge">${files.length}</span>
      <span class="section-stats"><span class="stat-add">+${totalAdditions}</span> <span class="stat-del">-${totalDeletions}</span></span>
    </div>
    <div class="file-list">
      ${fileListHtml}
    </div>
  </div>

  <div class="diff-section">
    <div class="section-header">Changes</div>
    ${diffHtml}
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

    document.querySelectorAll('.file-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const path = entry.dataset.path;
        const target = document.querySelector('[data-diff-path="' + CSS.escape(path) + '"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
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
      let files: CommitFileInfo[]
      let diffRaw: string
      try {
        ;[fullMessage, files, diffRaw] = await Promise.all([
          getCommitMessage(repoRoot, item.commit.hash),
          getCommitFiles(repoRoot, item.commit.hash),
          getCommitDiff(repoRoot, item.commit.hash)
        ])
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load commit details: ${err.message}`)
        return
      }

      const panel = vscode.window.createWebviewPanel(
        'toolkitEditCommitMessage',
        `Edit: ${item.commit.subject.substring(0, 50)}`,
        vscode.ViewColumn.One,
        { enableScripts: true, enableFindWidget: true }
      )

      editPanel = panel
      panel.onDidDispose(() => {
        if (editPanel === panel) editPanel = undefined
      })

      const nonce = getNonce()
      panel.webview.html = buildEditWebviewHtml(item.commit, fullMessage, files, diffRaw, nonce)

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
