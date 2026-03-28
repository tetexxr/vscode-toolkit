/**
 * Generates the HTML/CSS/JS for the NuGet Solution Overview webview.
 * Shows a table per project with installed packages, versions and update status.
 */

import * as vscode from 'vscode';

export function generateOverviewHtml(webview: vscode.Webview, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>NuGet Solution Overview</title>
  <style nonce="${nonce}">${CSS}</style>
</head>
<body>
  <div id="app">
    <div id="toolbar"></div>
    <div id="content"></div>
  </div>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`;
}

// ── CSS ──────────────────────────────────────────────────

const CSS = /*css*/`
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  overflow: auto;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

#app {
  padding: 1rem;
}

/* ── Toolbar ─────────────────────────────────── */

#toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.toolbar-title {
  font-size: 1.3rem;
  font-weight: 600;
  flex: 1;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 5px 12px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn:disabled { opacity: 0.5; cursor: default; }

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

.search-box {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  padding: 4px 8px;
  font-family: inherit;
  font-size: inherit;
  min-width: 200px;
}
.search-box::placeholder { color: var(--vscode-input-placeholderForeground); }
.search-box:focus { outline: 1px solid var(--vscode-focusBorder); }

/* ── Project section ─────────────────────────── */

.project-section {
  margin-bottom: 1.5rem;
}

.project-header {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border: 1px solid rgba(255,255,255,0.15);
  border-bottom: none;
}

.project-header-row {
  display: flex;
  padding: 0.3rem 0.75rem;
  gap: 0.5rem;
}
.project-header-row .label {
  font-weight: 600;
  min-width: 100px;
  color: var(--vscode-descriptionForeground);
}

/* ── Table ────────────────────────────────────── */

.pkg-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid rgba(255,255,255,0.15);
}

.pkg-table col.col-name    { width: 40%; }
.pkg-table col.col-version { width: 18%; }
.pkg-table col.col-status  { width: 12%; }
.pkg-table col.col-latest  { width: 18%; }
.pkg-table col.col-actions { width: 12%; }

.pkg-table th {
  background: var(--vscode-editorGroupHeader-tabsBackground);
  font-weight: 600;
  text-align: center;
  padding: 0.4rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.15);
  white-space: nowrap;
}
.pkg-table th:first-child { text-align: left; }

.pkg-table td {
  padding: 0.35rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.15);
  white-space: nowrap;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pkg-table td:first-child { text-align: left; }

.pkg-table tbody tr:hover {
  background: var(--vscode-list-hoverBackground);
}

.pkg-table tbody tr:nth-child(even) {
  background: var(--vscode-editorGroupHeader-tabsBackground);
}
.pkg-table tbody tr:nth-child(even):hover {
  background: var(--vscode-list-hoverBackground);
}

/* ── Status badges ────────────────────────────── */

.badge {
  display: inline-block;
  padding: 1px 8px;
  font-size: 0.85em;
  font-weight: 600;
}

.badge-yes {
  background: #2e7d32;
  color: #fff;
}
.badge-no {
  background: #c62828;
  color: #fff;
}
.badge-unknown {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  opacity: 0.6;
}

/* ── Loading / Empty ──────────────────────────── */

.loading-message, .empty-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  opacity: 0.6;
  font-size: 1.1rem;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--vscode-foreground);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
  margin-right: 0.5rem;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 120px;
}
.error-message {
  color: var(--vscode-errorForeground);
  font-size: 1.1rem;
  text-align: center;
  padding: 0 1rem;
}

.btn-update-sm {
  font-size: 0.8rem;
  padding: 2px 8px;
}
`;

// ── JS ──────────────────────────────────────────────────

const JS = /*js*/`
(function() {
  const vscode = acquireVsCodeApi();

  const state = {
    projects: [],
    loading: false,
    filter: '',
  };

  const $toolbar = document.getElementById('toolbar');
  const $content = document.getElementById('content');

  function post(msg) { vscode.postMessage(msg); }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
      case 'overview-data':
        state.projects = msg.projects;
        state.loading = msg.loading;
        renderToolbar();
        renderContent();
        break;
      case 'overview-error':
        renderError(msg.message);
        break;
      case 'task-started':
        break;
      case 'task-finished':
        break;
    }
  });

  function renderToolbar() {
    $toolbar.innerHTML =
      '<span class="toolbar-title">Solution Overview</span>' +
      '<input id="filter-input" class="search-box" type="search" placeholder="Filter packages..." value="' + esc(state.filter) + '" />' +
      '<button class="btn" id="load-versions-btn"' + (state.loading ? ' disabled' : '') + '>' +
        (state.loading ? '<span class="spinner"></span> Loading...' : 'Load Package Versions') +
      '</button>' +
      '<button class="btn btn-secondary" id="settings-btn" title="Settings">&#x2699;</button>';

    document.getElementById('filter-input').addEventListener('input', (e) => {
      state.filter = e.target.value;
      renderContent();
    });
    document.getElementById('load-versions-btn').addEventListener('click', () => {
      state.loading = true;
      renderToolbar();
      post({ command: 'load-versions' });
    });
    document.getElementById('settings-btn').addEventListener('click', () => post({ command: 'open-settings' }));
  }

  function renderContent() {
    if (!state.projects || state.projects.length === 0) {
      $content.innerHTML = '<div class="empty-message">No .NET projects found in workspace.</div>';
      return;
    }

    const filter = state.filter.trim().toLowerCase();
    let html = '';

    for (const proj of state.projects) {
      const filtered = filter
        ? proj.packages.filter(p => p.id.toLowerCase().includes(filter))
        : proj.packages;

      if (filter && filtered.length === 0) continue;

      html += '<div class="project-section">';
      html += '<div class="project-header">';
      html += '<div class="project-header-row"><span class="label">Project Name</span><span>' + esc(proj.name) + '</span></div>';
      html += '<div class="project-header-row"><span class="label">Project Path</span><span>' + esc(proj.fsPath) + '</span></div>';
      html += '</div>';

      html += '<table class="pkg-table">';
      html += '<colgroup>' +
        '<col class="col-name">' +
        '<col class="col-version">' +
        '<col class="col-latest">' +
        '<col class="col-status">' +
        '<col class="col-actions">' +
      '</colgroup>';
      html += '<thead><tr>' +
        '<th class="col-name">Package Name</th>' +
        '<th class="col-version">Installed Version</th>' +
        '<th class="col-latest">Latest Version</th>' +
        '<th class="col-status">Is Updated</th>' +
        '<th class="col-actions">Actions</th>' +
        '</tr></thead>';
      html += '<tbody>';

      for (const pkg of filtered) {
        const hasLatest = pkg.latestVersion !== '';
        let statusBadge;
        if (!hasLatest) {
          statusBadge = '<span class="badge badge-unknown">-</span>';
        } else if (pkg.isOutdated) {
          statusBadge = '<span class="badge badge-no">No</span>';
        } else {
          statusBadge = '<span class="badge badge-yes">Yes</span>';
        }

        html += '<tr>';
        html += '<td class="col-name">' + esc(pkg.id) + '</td>';
        html += '<td class="col-version">' + esc(pkg.installedVersion) + '</td>';
        html += '<td class="col-latest">' + (hasLatest ? esc(pkg.latestVersion) : '-') + '</td>';
        html += '<td class="col-status">' + statusBadge + '</td>';
        html += '<td class="col-actions">';
        if (pkg.isOutdated) {
          html += '<button class="btn btn-update-sm" data-project="' + esc(proj.fsPath) + '" data-pkg="' + esc(pkg.id) + '" data-ver="' + esc(pkg.latestVersion) + '">Update</button>';
        }
        html += '</td>';
        html += '</tr>';
      }

      html += '</tbody></table>';
      html += '</div>';
    }

    if (!html) {
      $content.innerHTML = '<div class="empty-message">No packages match filter.</div>';
      return;
    }

    $content.innerHTML = html;

    // Update button handlers
    $content.querySelectorAll('[data-pkg]').forEach(btn => {
      btn.addEventListener('click', () => {
        post({
          command: 'update',
          projectFsPath: btn.dataset.project,
          packageId: btn.dataset.pkg,
          version: btn.dataset.ver,
          sourceUrl: '',
        });
      });
    });
  }

  function renderError(message) {
    $content.innerHTML =
      '<div class="error-container">' +
        '<div class="error-message">Error: ' + esc(message) + '</div>' +
        '<button class="btn" id="retry-btn">Retry</button>' +
      '</div>';
    document.getElementById('retry-btn').addEventListener('click', () => {
      post({ command: 'load-versions' });
    });
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  post({ command: 'ready' });
})();
`;
