import * as vscode from 'vscode'
import type { CommitLogEntry, CommitFileInfo } from '../utils/git'
import {
  getRepoRoot,
  getCommitHash,
  getCommitLog,
  getCommitMessage,
  getCommitFiles,
  getCommitDiff,
  getCommitDateIso,
  editCommitMessage,
  resetToCommit,
  countCommitsBetween,
  hasUncommittedChanges
} from '../utils/git'
import { renderFileList, renderDiffContent, renderDiffPlaceholders, pickRepoRoot } from './git-edit-commit-utils'
import { escapeHtml, createNonce } from '../utils/html'
import { escapeMd } from '../utils/markdown'
import { logError } from '../utils/logger'

function buildEditWebviewHtml(
  commit: CommitLogEntry,
  message: string,
  files: CommitFileInfo[],
  isHead: boolean,
  nonce: string,
  commitDateIso: string
): string {
  const fileListHtml = renderFileList(files)
  const diffHtml = renderDiffPlaceholders(files)
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
    button.danger { color: var(--vscode-button-foreground); background: var(--vscode-errorForeground, #c74e39); }
    button.danger:hover { opacity: 0.85; }

    .shortcut-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-left: 4px;
    }

    .date-section {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
    }

    .date-section label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: normal;
      margin: 0;
      cursor: pointer;
    }

    .date-section input[type="datetime-local"] {
      padding: 4px 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
      border-radius: 4px;
      outline: none;
    }

    .date-section input[type="datetime-local"]:focus {
      border-color: var(--vscode-focusBorder);
    }

    .date-section input[type="datetime-local"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .reset-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .reset-label {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-right: 2px;
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
      margin: 24px 0;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
    }

    .diff-block + .diff-block {
      margin-top: 28px;
    }

    .diff-block:first-of-type {
      margin-top: 8px;
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

    .diff-placeholder {
      padding: 10px 12px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 0.9em;
    }

    .diff-placeholder.large {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-style: normal;
    }

    .diff-error {
      padding: 10px 12px;
      color: var(--vscode-errorForeground, #c74e39);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 0.9em;
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
    <div class="date-section">
      <label>
        <input type="checkbox" id="change-date">
        <span>Change date</span>
      </label>
      <input type="datetime-local" id="date-picker" value="${commitDateIso.slice(0, 16)}" disabled>
    </div>
    <div class="actions">
      <button class="primary" id="apply">Apply</button>
      <button class="secondary" id="discard">Discard</button>
      <span class="shortcut-hint">Ctrl+Enter to apply</span>
      ${
        isHead
          ? ''
          : `<div class="reset-actions">
        <span class="reset-label">Reset HEAD here:</span>
        <button class="secondary" id="reset-soft" title="Move HEAD to this commit, keep changes staged">Soft</button>
        <button class="danger" id="reset-hard" title="Move HEAD to this commit and discard all later changes">Hard</button>
      </div>`
      }
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
    const changeDateCheckbox = document.getElementById('change-date');
    const datePicker = document.getElementById('date-picker');
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    changeDateCheckbox.addEventListener('change', () => {
      datePicker.disabled = !changeDateCheckbox.checked;
    });

    document.getElementById('apply').addEventListener('click', () => {
      const rawDate = changeDateCheckbox.checked ? datePicker.value : undefined;
      const date = rawDate ? rawDate.replace('T', ' ') + ':00' : undefined;
      vscode.postMessage({ command: 'apply', message: textarea.value, date: date || null });
    });
    document.getElementById('discard').addEventListener('click', () => {
      vscode.postMessage({ command: 'discard' });
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const rawDate = changeDateCheckbox.checked ? datePicker.value : undefined;
        const date = rawDate ? rawDate.replace('T', ' ') + ':00' : undefined;
        vscode.postMessage({ command: 'apply', message: textarea.value, date: date || null });
      }
    });

    document.getElementById('reset-soft')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'reset', mode: 'soft' });
    });
    document.getElementById('reset-hard')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'reset', mode: 'hard' });
    });

    const diffBlocks = document.querySelectorAll('.diff-block');
    document.querySelectorAll('.file-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const filePath = entry.dataset.path;
        const target = [...diffBlocks].find(el => el.dataset.diffPath === filePath);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    function findBlock(path) {
      return [...diffBlocks].find(el => el.dataset.diffPath === path);
    }

    function requestDiff(el) {
      el.dataset.diffStatus = 'loading';
      el.innerHTML = '<div class="diff-placeholder">Cargando diff…</div>';
      vscode.postMessage({ command: 'loadDiff', path: el.dataset.diffPath });
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        if (el.dataset.diffStatus === 'idle') {
          requestDiff(el);
          observer.unobserve(el);
        }
      }
    }, { rootMargin: '200px' });

    diffBlocks.forEach(el => {
      if (el.dataset.diffStatus === 'idle') {
        observer.observe(el);
      } else if (el.dataset.diffStatus === 'large') {
        const btn = el.querySelector('.load-large');
        if (btn) btn.addEventListener('click', () => requestDiff(el));
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'diffLoaded') {
        const el = findBlock(msg.path);
        if (el) {
          el.dataset.diffStatus = 'loaded';
          el.innerHTML = msg.html || '<div class="diff-placeholder">(sin cambios)</div>';
        }
      } else if (msg.command === 'diffError') {
        const el = findBlock(msg.path);
        if (el) {
          el.dataset.diffStatus = 'error';
          // msg.error carries raw git stderr — escape it before it touches innerHTML.
          const escaped = String(msg.error || 'desconocido')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const retry = '<button class="secondary load-large" style="margin-left:8px">Reintentar</button>';
          el.innerHTML = '<div class="diff-error">Error cargando diff: ' + escaped + retry + '</div>';
          const btn = el.querySelector('.load-large');
          if (btn) btn.addEventListener('click', () => requestDiff(el));
        }
      }
    });
  </script>
</body>
</html>`
}

type ResetMode = 'soft' | 'mixed' | 'hard'

async function performResetWithConfirm(
  repoRoot: string,
  commitHash: string,
  mode: ResetMode,
  onSuccess?: () => void
): Promise<void> {
  const shortHash = commitHash.substring(0, 8)

  let dirtyWarning = ''
  try {
    const hasDirty = await hasUncommittedChanges(repoRoot)
    if (hasDirty && mode === 'hard') {
      dirtyWarning = '\n\n⚠ WARNING: You have uncommitted changes that will be LOST.'
    }
  } catch {}

  let commitCount = 0
  try {
    const headHash = await getCommitHash(repoRoot)
    commitCount = await countCommitsBetween(repoRoot, commitHash, headHash)
  } catch {}

  const commitsInfo = commitCount > 0 ? `\n\n${commitCount} commit(s) will be discarded.` : ''

  const confirmText =
    mode === 'hard'
      ? `Reset --hard to ${shortHash}?${commitsInfo}\n\nThis will move HEAD to this commit and DISCARD all later commits and any uncommitted changes in the working tree. This cannot be easily undone.${dirtyWarning}`
      : mode === 'mixed'
        ? `Reset --mixed to ${shortHash}?${commitsInfo}\n\nHEAD will move to this commit. Changes from later commits will be kept in the working tree but unstaged.`
        : `Reset --soft to ${shortHash}?${commitsInfo}\n\nHEAD will move to this commit. Changes from later commits will remain in the index (staged).`
  const confirmLabel = mode === 'hard' ? 'Discard and reset' : 'Reset'

  const choice = await vscode.window.showWarningMessage(confirmText, { modal: true }, confirmLabel)
  if (choice !== confirmLabel) return

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Resetting --${mode} to ${shortHash}...`,
        cancellable: false
      },
      async () => {
        await resetToCommit(repoRoot, commitHash, mode)
      }
    )

    onSuccess?.()
    vscode.window.showInformationMessage(`Reset --${mode} to ${shortHash}.`)
  } catch (err) {
    vscode.window.showErrorMessage(`Reset failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

class CommitTreeItem extends vscode.TreeItem {
  constructor(
    public readonly commit: CommitLogEntry,
    isHead: boolean
  ) {
    super(commit.subject, vscode.TreeItemCollapsibleState.None)
    this.description = `${commit.author}, ${commit.date}`
    const md = new vscode.MarkdownString()
    md.appendMarkdown(`**${escapeMd(commit.subject)}**\n\n`)
    md.appendMarkdown(`$(git-commit) \`${commit.hash.substring(0, 8)}\` · ${escapeMd(commit.author)} · ${commit.date}`)
    this.tooltip = md
    this.contextValue = isHead ? 'commitHead' : 'commit'
    this.iconPath = new vscode.ThemeIcon('git-commit')
  }
}

class CommitListProvider implements vscode.TreeDataProvider<CommitTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  private gitApi: GitApi | undefined

  setGitApi(api: GitApi): void {
    this.gitApi = api
  }

  /**
   * Resolves the repo root whose commits the view should show. Prefers the
   * repository currently selected in the Source Control "Repositories" list,
   * so when a folder contains several repos the view follows the user's
   * selection. Falls back to resolving the first workspace folder via
   * `git rev-parse` when the git extension API is unavailable.
   */
  async getRepoRoot(): Promise<string | undefined> {
    const selected = this.getSelectedRepoRoot()
    if (selected) return selected

    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) return undefined
    try {
      return await getRepoRoot(folder.uri.fsPath)
    } catch (err) {
      logError('git-edit-commit.getRepoRoot', err)
      return undefined
    }
  }

  private getSelectedRepoRoot(): string | undefined {
    const repos = this.gitApi?.repositories
    if (!repos) return undefined
    return pickRepoRoot(repos)
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
      const [commits, headHash] = await Promise.all([getCommitLog(root), getCommitHash(root).catch(() => '')])
      return commits.map(c => new CommitTreeItem(c, c.hash === headHash))
    } catch (err) {
      logError('git-edit-commit.getChildren', err)
      return []
    }
  }
}

let editPanel: vscode.WebviewPanel | undefined

interface GitRepositoryUIState {
  readonly selected: boolean
  readonly onDidChange: vscode.Event<void>
}

interface GitRepository {
  readonly rootUri: vscode.Uri
  readonly state: { readonly onDidChange: vscode.Event<void> }
  readonly ui: GitRepositoryUIState
}

interface GitApi {
  readonly repositories: ReadonlyArray<GitRepository>
  readonly onDidOpenRepository: vscode.Event<GitRepository>
  readonly onDidCloseRepository: vscode.Event<GitRepository>
}

interface GitExtension {
  getAPI(version: 1): GitApi
}

function watchGit(context: vscode.ExtensionContext, provider: CommitListProvider): void {
  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git')
  if (!gitExt) return

  let lastRoot: string | undefined
  let lastHeadHash: string | undefined

  const onRepoStateChange = async () => {
    const root = await provider.getRepoRoot()
    if (!root) return
    try {
      const headHash = await getCommitHash(root)
      if (root !== lastRoot || headHash !== lastHeadHash) {
        lastRoot = root
        lastHeadHash = headHash
        provider.refresh()
      }
    } catch {}
  }

  // Per-repo listeners, released when their repository closes — pushing them
  // onto context.subscriptions would accumulate them for the whole session.
  const repoSubscriptions = new Map<GitRepository, vscode.Disposable[]>()

  const subscribe = (repo: GitRepository) => {
    repoSubscriptions.set(repo, [
      repo.state.onDidChange(onRepoStateChange),
      // Refresh when the user selects a different repository in the SCM view.
      repo.ui.onDidChange(() => provider.refresh())
    ])
  }

  const unsubscribe = (repo: GitRepository) => {
    for (const disposable of repoSubscriptions.get(repo) ?? []) {
      disposable.dispose()
    }
    repoSubscriptions.delete(repo)
  }

  context.subscriptions.push({
    dispose: () => {
      for (const repo of [...repoSubscriptions.keys()]) {
        unsubscribe(repo)
      }
    }
  })

  const setup = (api: GitApi) => {
    provider.setGitApi(api)
    for (const repo of api.repositories) subscribe(repo)
    context.subscriptions.push(
      api.onDidOpenRepository(repo => {
        subscribe(repo)
        provider.refresh()
      }),
      api.onDidCloseRepository(repo => {
        unsubscribe(repo)
        provider.refresh()
      })
    )
    provider.refresh()
  }

  if (gitExt.isActive) {
    setup(gitExt.exports.getAPI(1))
  } else {
    gitExt.activate().then(
      ext => setup(ext.getAPI(1)),
      err => logError('git-edit-commit:activate', err)
    )
  }
}

export function registerGitEditCommitCommands(context: vscode.ExtensionContext): void {
  const provider = new CommitListProvider()

  const treeView = vscode.window.createTreeView('toolkitCommitList', {
    treeDataProvider: provider,
    showCollapseAll: false
  })

  treeView.onDidChangeVisibility(({ visible }) => {
    if (visible) {
      provider.refresh()
    }
  })

  watchGit(context, provider)

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
      let headHash: string
      let commitDateIso: string
      try {
        ;[fullMessage, files, headHash, commitDateIso] = await Promise.all([
          getCommitMessage(repoRoot, item.commit.hash),
          getCommitFiles(repoRoot, item.commit.hash),
          getCommitHash(repoRoot),
          getCommitDateIso(repoRoot, item.commit.hash)
        ])
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to load commit details: ${err instanceof Error ? err.message : String(err)}`
        )
        return
      }

      const isHead = item.commit.hash === headHash

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

      const nonce = createNonce()
      panel.webview.html = buildEditWebviewHtml(item.commit, fullMessage, files, isHead, nonce, commitDateIso)

      panel.webview.onDidReceiveMessage((msg: unknown) => {
        const parsed = parseEditCommitMessage(msg)
        if (!parsed) return

        if (parsed.command === 'discard') {
          panel.dispose()
          return
        }

        if (parsed.command === 'loadDiff') {
          void handleLoadDiff(panel, repoRoot, item.commit.hash, parsed.path)
          return
        }

        if (parsed.command === 'reset') {
          void performResetWithConfirm(repoRoot, item.commit.hash, parsed.mode, () => {
            provider.refresh()
            panel.dispose()
          })
          return
        }

        if (parsed.command === 'apply') {
          void handleApply(panel, provider, repoRoot, item.commit.hash, fullMessage, parsed.message, parsed.date)
        }
      })
    }),

    vscode.commands.registerCommand('toolkit.gitCommitList.resetTo', async (item?: CommitTreeItem) => {
      if (!item) return

      const repoRoot = await provider.getRepoRoot()
      if (!repoRoot) return

      const items: (vscode.QuickPickItem & { mode: ResetMode })[] = [
        {
          label: '$(diff-added) Soft',
          description: 'Move HEAD only — keep later changes staged',
          detail: 'Safest. Later commits become staged changes in the index.',
          mode: 'soft'
        },
        {
          label: '$(edit) Mixed',
          description: 'Move HEAD and unstage — keep changes in working tree',
          detail: 'Default git reset behavior. Later commits become unstaged working-tree changes.',
          mode: 'mixed'
        },
        {
          label: '$(warning) Hard',
          description: 'Discard everything — destructive',
          detail: 'Drops later commits AND any uncommitted working-tree changes. Cannot be undone.',
          mode: 'hard'
        }
      ]

      const shortHash = item.commit.hash.substring(0, 8)
      const picked = await vscode.window.showQuickPick(items, {
        title: `Reset HEAD to ${shortHash} — ${item.commit.subject.substring(0, 60)}`,
        placeHolder: 'Choose reset mode',
        matchOnDescription: true,
        matchOnDetail: true
      })

      if (!picked) return

      await performResetWithConfirm(repoRoot, item.commit.hash, picked.mode, () => {
        provider.refresh()
        if (editPanel) editPanel.dispose()
      })
    })
  )
}

type EditCommitMessage =
  | { command: 'discard' }
  | { command: 'loadDiff'; path: string }
  | { command: 'reset'; mode: 'soft' | 'hard' }
  | { command: 'apply'; message: string; date: string | null }

function parseEditCommitMessage(value: unknown): EditCommitMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const msg = value as Record<string, unknown>
  switch (msg.command) {
    case 'discard':
      return { command: 'discard' }
    case 'loadDiff':
      return typeof msg.path === 'string' ? { command: 'loadDiff', path: msg.path } : undefined
    case 'reset':
      return msg.mode === 'soft' || msg.mode === 'hard' ? { command: 'reset', mode: msg.mode } : undefined
    case 'apply':
      if (typeof msg.message !== 'string') return undefined
      if (msg.date !== null && typeof msg.date !== 'string') return undefined
      return { command: 'apply', message: msg.message, date: msg.date }
    default:
      return undefined
  }
}

async function handleLoadDiff(
  panel: vscode.WebviewPanel,
  repoRoot: string,
  commitHash: string,
  filePath: string
): Promise<void> {
  try {
    const raw = await getCommitDiff(repoRoot, commitHash, filePath)
    const html = renderDiffContent(raw)
    void panel.webview.postMessage({ command: 'diffLoaded', path: filePath, html })
  } catch (err) {
    void panel.webview.postMessage({
      command: 'diffError',
      path: filePath,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

async function handleApply(
  panel: vscode.WebviewPanel,
  provider: CommitListProvider,
  repoRoot: string,
  commitHash: string,
  originalMessage: string,
  newMessageRaw: string,
  newDate: string | null
): Promise<void> {
  const newMessage = newMessageRaw.trim()

  if (!newMessage) {
    vscode.window.showErrorMessage('Commit message cannot be empty.')
    return
  }

  const messageUnchanged = newMessage === originalMessage.trim()
  const dateSet = newDate !== null

  if (messageUnchanged && !dateSet) {
    provider.refresh()
    panel.dispose()
    return
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating commit...',
        cancellable: false
      },
      async () => {
        await editCommitMessage(repoRoot, commitHash, newMessage, newDate || undefined)
      }
    )

    provider.refresh()
    panel.dispose()
    vscode.window.showInformationMessage('Commit message updated.')
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to update commit message: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
