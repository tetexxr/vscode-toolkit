import * as vscode from 'vscode'
import * as path from 'path'
import { getRepoRoot, getFileLogPatch, getFileCommitCount } from '../../utils/git'
import { escapeHtml, createNonce } from '../../utils/html'

function renderPatch(raw: string): string {
  const lines = raw.split('\n')
  const html: string[] = []
  let inDiff = false

  for (const line of lines) {
    if (line.startsWith('---COMMIT---')) {
      if (html.length > 0) {
        if (inDiff) {
          html.push('</div>')
          inDiff = false
        }
        html.push('</section>')
      }
      html.push('<section class="commit">')
      continue
    }

    if (line.startsWith('commit ')) {
      html.push(`<div class="commit-header">${escapeHtml(line)}</div>`)
      continue
    }

    if (line.startsWith('Author:') || line.startsWith('Date:')) {
      html.push(`<div class="commit-meta">${escapeHtml(line)}</div>`)
      continue
    }

    if (line.startsWith('diff --git')) {
      if (inDiff) {
        html.push('</div>')
      }
      html.push('<div class="diff-block">')
      html.push(`<div class="diff-header">${escapeHtml(line)}</div>`)
      inDiff = true
      continue
    }

    if (inDiff) {
      if (line.startsWith('@@')) {
        html.push(`<div class="hunk-header">${escapeHtml(line)}</div>`)
      } else if (line.startsWith('+')) {
        html.push(`<div class="line-add">${escapeHtml(line)}</div>`)
      } else if (line.startsWith('-')) {
        html.push(`<div class="line-del">${escapeHtml(line)}</div>`)
      } else if (
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('new file') ||
        line.startsWith('deleted file') ||
        line.startsWith('similarity') ||
        line.startsWith('rename')
      ) {
        html.push(`<div class="diff-meta">${escapeHtml(line)}</div>`)
      } else {
        html.push(`<div class="line-ctx">${escapeHtml(line)}</div>`)
      }
      continue
    }

    // Commit message (indented lines)
    if (line.startsWith('    ')) {
      html.push(`<div class="commit-message">${escapeHtml(line)}</div>`)
    }
  }

  if (inDiff) {
    html.push('</div>')
  }
  if (html.length > 0) {
    html.push('</section>')
  }

  return html.join('\n')
}

function buildWebviewHtml(fileName: string, patchHtml: string, nonce: string, shown: number, total: number): string {
  const hasMore = shown < total
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 0 16px 40px;
      line-height: 1.5;
    }

    h1 {
      font-size: 1.2em;
      font-weight: 600;
      padding: 12px 0;
      margin: 0;
      color: var(--vscode-foreground);
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      z-index: 1;
      border-bottom: 1px solid var(--vscode-panel-border, transparent);
    }

    .commit {
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      padding: 16px 0;
    }

    .commit-header {
      color: var(--vscode-textLink-foreground);
      font-weight: 600;
    }

    .commit-meta {
      color: var(--vscode-descriptionForeground);
    }

    .commit-message {
      color: var(--vscode-foreground);
      font-weight: 600;
      padding: 4px 0;
    }

    .diff-block {
      margin: 8px 0;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
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
      color: var(--vscode-foreground);
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .line-del {
      background: var(--vscode-diffEditor-removedLineBackground, rgba(255,0,0,0.15));
      color: var(--vscode-foreground);
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .line-ctx {
      padding: 0 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    #loadMore {
      display: block;
      margin: 16px auto;
      padding: 6px 16px;
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }

    #loadMore:hover { background: var(--vscode-button-hoverBackground); }
    #loadMore:disabled { opacity: 0.5; cursor: default; }

    /* display: block above beats the UA's [hidden] rule, so re-assert it. */
    [hidden] { display: none !important; }

    #status {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 8px 0;
    }

    #error {
      text-align: center;
      color: var(--vscode-errorForeground, #f48771);
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <h1>History: ${escapeHtml(fileName)}</h1>
  <div id="content">
  ${patchHtml}
  </div>
  <button id="loadMore"${hasMore ? '' : ' hidden'}>Load more</button>
  <div id="error" hidden>Could not load more history.</div>
  <div id="status"></div>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi()
      const btn = document.getElementById('loadMore')
      const errorEl = document.getElementById('error')
      const statusEl = document.getElementById('status')
      let shown = ${shown}
      const total = ${total}

      function updateStatus() {
        const commits = total === 1 ? '1 commit' : total + ' commits'
        statusEl.textContent = shown < total
          ? 'Showing ' + shown + ' of ' + commits
          : commits + ' — end of history'
      }
      updateStatus()

      btn.addEventListener('click', () => {
        btn.disabled = true
        btn.textContent = 'Loading…'
        errorEl.hidden = true
        vscode.postMessage({ type: 'loadMore' })
      })
      window.addEventListener('message', e => {
        const msg = e.data
        if (!msg) {
          return
        }
        if (msg.type === 'append') {
          document.getElementById('content').insertAdjacentHTML('beforeend', msg.html)
          shown = msg.shown
          btn.disabled = false
          btn.textContent = 'Load more'
          if (!msg.hasMore) {
            btn.hidden = true
          }
          updateStatus()
        } else if (msg.type === 'error') {
          btn.disabled = false
          btn.textContent = 'Load more'
          errorEl.hidden = false
        }
      })
    })()
  </script>
</body>
</html>`
}

const panels = new Map<string, vscode.WebviewPanel>()

/** Commits fetched per page; full `git log -p` output can blow past maxBuffer. */
const PAGE_SIZE = 50

function countCommits(raw: string): number {
  return raw.split('---COMMIT---').length - 1
}

export function registerGitHistoryCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.gitHistory', async (uri?: vscode.Uri) => {
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath
      if (!filePath) {
        vscode.window.showErrorMessage('No file selected.')
        return
      }

      const existing = panels.get(filePath)
      if (existing) {
        existing.reveal()
        return
      }

      const cwd = path.dirname(filePath)
      const fileName = path.basename(filePath)

      let repoRoot: string
      try {
        repoRoot = await getRepoRoot(cwd)
      } catch {
        vscode.window.showErrorMessage('Not a git repository.')
        return
      }

      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/')

      let raw: string
      let total: number
      try {
        raw = await getFileLogPatch(repoRoot, relativePath, PAGE_SIZE)
        total = await getFileCommitCount(repoRoot, relativePath)
      } catch {
        vscode.window.showErrorMessage('Could not retrieve git history for this file.')
        return
      }

      if (!raw) {
        vscode.window.showInformationMessage('No git history found for this file.')
        return
      }

      const panel = vscode.window.createWebviewPanel(
        'toolkitGitHistory',
        `History: ${fileName}`,
        vscode.ViewColumn.One,
        // retainContextWhenHidden keeps loaded pages (and the script's state)
        // alive when the tab is hidden; otherwise the webview is rebuilt from
        // the first page while the extension-side cursor stays advanced.
        { enableFindWidget: true, enableScripts: true, retainContextWhenHidden: true }
      )

      panels.set(filePath, panel)
      panel.onDidDispose(() => panels.delete(filePath))

      let shown = countCommits(raw)
      panel.webview.onDidReceiveMessage(async (msg: unknown) => {
        if (!msg || (msg as { type?: unknown }).type !== 'loadMore') {
          return
        }
        try {
          const more = await getFileLogPatch(repoRoot, relativePath, PAGE_SIZE, shown)
          const count = countCommits(more)
          shown += count
          void panel.webview.postMessage({
            type: 'append',
            html: renderPatch(more),
            shown,
            // count > 0 guards against `total` going stale if history changes
            // (e.g. a rebase) while the panel is open.
            hasMore: count > 0 && shown < total
          })
        } catch {
          void panel.webview.postMessage({ type: 'error' })
        }
      })

      const nonce = createNonce()
      const patchHtml = renderPatch(raw)
      panel.webview.html = buildWebviewHtml(fileName, patchHtml, nonce, shown, total)
    })
  )
}
