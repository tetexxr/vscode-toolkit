/**
 * Generates the complete HTML/CSS/JS for the npm manager webview.
 * Pure vanilla — no frameworks, no external files, no build step.
 * Uses VS Code CSS custom properties for native theme integration.
 */

import * as vscode from 'vscode'

export function generateWebviewHtml(webview: vscode.Webview, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>npm Package Manager</title>
  <style nonce="${nonce}">${CSS}</style>
</head>
<body>
  <div id="app">
    <header id="header">
      <nav id="nav-bar"></nav>
      <div id="tool-bar"></div>
    </header>
    <main id="main">
      <div id="package-list"></div>
      <div id="resize-handle"></div>
      <div id="package-details"></div>
    </main>
  </div>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`
}

// ── CSS ──────────────────────────────────────────────────

const CSS = /*css*/ `
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  overflow: hidden;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

#app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Header ─────────────────────────────────────── */

#header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--vscode-panel-border);
}

#nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.75rem;
}

.nav-tabs { display: flex; gap: 0.25rem; }

.nav-tab {
  font-size: 1.2rem;
  background: transparent;
  color: var(--vscode-foreground);
  border: none;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-family: inherit;
}
.nav-tab:hover { color: var(--vscode-button-background); }
.nav-tab.active {
  color: var(--vscode-button-background);
  border-bottom-color: var(--vscode-button-background);
}

.project-name {
  font-size: 1rem;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

#tool-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.75rem 0.6rem;
  gap: 0.5rem;
}

.toolbar-start {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0.35rem;
}

.toolbar-end {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.search-box {
  flex: 1;
  max-width: 500px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 4px 8px;
  font-family: inherit;
  font-size: inherit;
}
.search-box::placeholder { color: var(--vscode-input-placeholderForeground); }
.search-box:focus { outline: 1px solid var(--vscode-focusBorder); }

.prerelease-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 1rem;
  white-space: nowrap;
  cursor: pointer;
}

.source-label { font-size: 1rem; white-space: nowrap; }

/* ── Buttons & Inputs ───────────────────────────── */

.btn {
  font-size: 0.95rem;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 10px;
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

.btn-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 1rem;
}

select {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 4px;
  font-family: inherit;
  font-size: inherit;
}
select:focus { outline: 1px solid var(--vscode-focusBorder); }

/* ── Main layout ────────────────────────────────── */

#main {
  display: flex;
  flex: 1;
  min-height: 0;
}

#package-list {
  flex: 6;
  min-width: 200px;
  overflow-y: auto;
  overflow-x: hidden;
}

#resize-handle {
  width: 5px;
  cursor: col-resize;
  background: var(--vscode-panel-border);
  flex-shrink: 0;
}
#resize-handle:hover { background: var(--vscode-focusBorder); }

#package-details {
  flex: 4;
  min-width: 200px;
  overflow-y: auto;
  padding: 0.75rem;
}

/* ── Package list ───────────────────────────────── */

.select-all-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.select-all-bar label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1rem;
  cursor: pointer;
}

.pkg-row {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.75rem;
  min-height: 52px;
  cursor: pointer;
  gap: 0.9rem;
}
.pkg-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.pkg-row:hover .pkg-action-btn { visibility: visible; }
.pkg-row.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.pkg-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
}
.pkg-icon-placeholder {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vscode-badge-background, #333);
  color: var(--vscode-badge-foreground, #ccc);
  font-size: 0.7rem;
  font-weight: bold;
  letter-spacing: -0.5px;
}
.pkg-status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  line-height: 1;
  color: white;
}
.pkg-status-installed { background: forestgreen; }
.pkg-status-outdated { background: cornflowerblue; }

.pkg-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.pkg-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pkg-name { font-weight: bold; font-size: 1.2rem; }
.pkg-dep-type {
  font-size: 0.85rem;
  margin-left: 0.4rem;
  opacity: 0.6;
  padding: 1px 4px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
}
.pkg-author, .pkg-downloads { font-size: 0.95rem; margin-left: 0.4rem; opacity: 0.8; }
.pkg-desc {
  font-size: 1.05rem;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.pkg-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.pkg-right-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  font-size: 0.95rem;
}
.pkg-ver-installed { opacity: 0.6; text-decoration: line-through; }
.pkg-action-btn {
  visibility: hidden;
}
.pkg-row:hover .pkg-action-btn { visibility: visible; }

.pkg-checkbox { align-self: center; margin-right: 0.25rem; }

.empty-message, .loading-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  opacity: 0.6;
  font-size: 1.1rem;
}

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

.load-more-bar {
  display: flex;
  justify-content: center;
  padding: 0.75rem 0;
}

/* ── Loading spinner ────────────────────────────── */

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

/* ── Package details ────────────────────────────── */

.detail-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.detail-icon { width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 4px; }
.detail-icon-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vscode-badge-background, #333);
  color: var(--vscode-badge-foreground, #ccc);
  font-size: 0.95rem;
  font-weight: bold;
}
.detail-name { font-size: 1.45rem; font-weight: bold; }

.detail-version-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.6rem;
}
.detail-version-row .label { font-size: 0.95rem; font-weight: bold; width: 60px; flex-shrink: 0; }
.detail-version-row select { flex: 1; }
.detail-version-row .installed-badge {
  flex: 1;
  font-size: 1.05rem;
  padding: 3px 6px;
  border: 1px solid var(--vscode-dropdown-border);
  background: var(--vscode-dropdown-background);
}
.detail-version-row .btn { height: 26px; width: 72px; }

.deprecated-banner {
  background: var(--vscode-inputValidation-warningBackground, #4d3800);
  border: 1px solid var(--vscode-inputValidation-warningBorder, #ff8c00);
  padding: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.dev-dep-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.95rem;
  margin-bottom: 0.6rem;
  cursor: pointer;
}

.detail-desc-label { font-size: 0.95rem; font-weight: bold; margin-top: 0.75rem; margin-bottom: 0.3rem; }
.detail-desc {
  font-size: 1.1rem;
  white-space: pre-wrap;
  font-family: var(--vscode-font-family);
  line-height: 1.4;
  margin-bottom: 0.75rem;
}

.detail-meta { margin-top: 0.5rem; }
.detail-row { margin-bottom: 0.4rem; font-size: 1rem; }
.detail-row .label { font-weight: bold; margin-right: 0.25rem; }
.detail-row a { color: var(--vscode-textLink-foreground); word-break: break-all; }

.detail-deps { margin-top: 0.75rem; }
.detail-deps summary { font-size: 0.95rem; font-weight: bold; cursor: pointer; margin-bottom: 0.3rem; }
.dep-item { font-size: 1rem; margin-left: 0.75rem; opacity: 0.7; }

.detail-keywords { margin-top: 0.5rem; }
.keyword-tag {
  display: inline-block;
  background: var(--vscode-badge-background, #333);
  color: var(--vscode-badge-foreground, #ccc);
  padding: 2px 6px;
  margin: 2px;
  border-radius: 3px;
  font-size: 0.9rem;
}

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.5;
  font-size: 1.05rem;
}
`

// ── JavaScript ───────────────────────────────────────────

const JS = /*js*/ `
(function() {
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────
  const state = {
    category: 'browse',
    packages: null,
    selectedId: null,
    selectedPkg: null,
    sources: [],
    project: null,
    config: { defaultPrerelease: false, requestTimeout: 10000 },
    loading: false,
    totalHits: 0,
    skip: 0,
  };

  // ── DOM refs ─────────────────────────────────────
  const $nav = document.getElementById('nav-bar');
  const $toolbar = document.getElementById('tool-bar');
  const $list = document.getElementById('package-list');
  const $details = document.getElementById('package-details');
  const $resize = document.getElementById('resize-handle');

  // ── IPC ──────────────────────────────────────────
  function post(msg) { vscode.postMessage(msg); }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
      case 'init':
        state.project = msg.project;
        state.sources = msg.sources;
        state.config = msg.config;
        renderNav();
        renderToolbar();
        triggerSearch();
        break;
      case 'packages':
        if (msg.append && state.packages) {
          state.packages = state.packages.concat(msg.packages);
        } else {
          state.packages = msg.packages;
        }
        state.category = msg.category;
        state.totalHits = msg.totalHits;
        state.skip = state.packages ? state.packages.length : 0;
        renderList();
        break;
      case 'package-details':
        state.selectedPkg = msg.pkg;
        renderDetails();
        break;
      case 'loading':
        state.loading = msg.loading;
        if (msg.loading && !state.packages) renderList();
        if (msg.loading && state.selectedId && !state.selectedPkg) {
          $details.innerHTML = '<div class="loading-message"><span class="spinner"></span> Loading package details...</div>';
        }
        break;
      case 'task-started':
        break;
      case 'task-finished':
        break;
      case 'project-updated':
        state.project = msg.project;
        triggerSearch();
        break;
      case 'error':
        renderError(msg.message);
        break;
    }
  });

  // ── Search trigger ───────────────────────────────
  let searchTimer = null;
  function triggerSearch() {
    const query = (document.getElementById('search-input') || {}).value || '';
    const prerelease = (document.getElementById('prerelease-cb') || {}).checked || false;
    const sourceSelect = document.getElementById('source-select');
    const sourceIndex = sourceSelect ? sourceSelect.selectedIndex : 0;
    state.packages = null;
    state.selectedId = null;
    state.selectedPkg = null;
    state.totalHits = 0;
    state.skip = 0;
    renderList();
    renderDetails();
    post({ command: 'search', query, prerelease, sourceIndex, category: state.category, skip: 0 });
  }

  function loadMore() {
    const query = (document.getElementById('search-input') || {}).value || '';
    const prerelease = (document.getElementById('prerelease-cb') || {}).checked || false;
    const sourceSelect = document.getElementById('source-select');
    const sourceIndex = sourceSelect ? sourceSelect.selectedIndex : 0;
    post({ command: 'search', query, prerelease, sourceIndex, category: state.category, skip: state.skip });
  }

  function debouncedSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(triggerSearch, 500);
  }

  // ── Render: Nav ──────────────────────────────────
  function renderNav() {
    const name = state.project ? state.project.name : '';
    $nav.innerHTML =
      '<div class="nav-tabs">' +
        navTab('Browse', 'browse') +
        navTab('Installed', 'installed') +
        navTab('Updates', 'updates') +
      '</div>' +
      '<span class="project-name" title="' + esc(state.project ? state.project.fsPath : '') + '">' + esc(name) + '</span>';

    $nav.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.category = btn.dataset.cat;
        renderNav();
        triggerSearch();
      });
    });
  }

  function navTab(label, cat) {
    return '<button class="nav-tab' + (state.category === cat ? ' active' : '') + '" data-cat="' + cat + '">' + label + '</button>';
  }

  // ── Render: Toolbar ──────────────────────────────
  function renderToolbar() {
    const sourceOptions = state.sources.map((s, i) =>
      '<option value="' + i + '">' + esc(s.name) + '</option>'
    ).join('');

    $toolbar.innerHTML =
      '<div class="toolbar-start">' +
        '<input id="search-input" class="search-box" type="search" placeholder="Search packages..." />' +
        '<button class="btn btn-secondary btn-icon" id="refresh-btn" title="Refresh">&#x21bb;</button>' +
        '<label class="prerelease-label"><input id="prerelease-cb" type="checkbox"' +
          (state.config.defaultPrerelease ? ' checked' : '') + ' /> Prerelease</label>' +
      '</div>' +
      '<div class="toolbar-end">' +
        '<span class="source-label">Source:</span>' +
        '<select id="source-select">' + sourceOptions + '</select>' +
        '<button class="btn btn-secondary btn-icon" id="settings-btn" title="Settings">&#x2699;</button>' +
      '</div>';

    document.getElementById('search-input').addEventListener('input', debouncedSearch);
    document.getElementById('refresh-btn').addEventListener('click', triggerSearch);
    document.getElementById('prerelease-cb').addEventListener('change', triggerSearch);
    document.getElementById('source-select').addEventListener('change', triggerSearch);
    document.getElementById('settings-btn').addEventListener('click', () => post({ command: 'open-settings' }));
  }

  // ── Render: Package list ─────────────────────────
  function renderList() {
    if (!state.packages) {
      $list.innerHTML = '<div class="loading-message"><span class="spinner"></span> Loading packages...</div>';
      return;
    }
    if (state.packages.length === 0) {
      $list.innerHTML = '<div class="empty-message">No packages found.</div>';
      return;
    }

    let html = '';

    // Select all bar for updates
    if (state.category === 'updates' && state.packages.length > 0) {
      html += '<div class="select-all-bar">' +
        '<label><input type="checkbox" id="select-all-cb" /> Select all</label>' +
        '<button class="btn" id="update-selected-btn" disabled>Update selected</button>' +
      '</div>';
    }

    for (const pkg of state.packages) {
      const isActive = pkg.name === state.selectedId;
      const desc = pkg.description.length > 160 ? pkg.description.slice(0, 157) + '...' : pkg.description;

      html += '<div class="pkg-row' + (isActive ? ' active' : '') + '" data-id="' + esc(pkg.name) + '">';

      // Checkbox (updates mode)
      if (state.category === 'updates') {
        html += '<input type="checkbox" class="pkg-checkbox" data-check="' + esc(pkg.name) + '" />';
      }

      // Icon (initials only for npm — no package icons)
      html += '<div class="pkg-icon">';
      const initials = pkg.name.startsWith('@')
        ? pkg.name.split('/').pop().slice(0, 2).toUpperCase()
        : pkg.name.slice(0, 2).toUpperCase();
      html += '<div class="pkg-icon-placeholder">' + esc(initials) + '</div>';
      if (pkg.isInstalled) {
        html += '<span class="pkg-status ' + (pkg.isOutdated ? 'pkg-status-outdated' : 'pkg-status-installed') + '">' +
          (pkg.isOutdated ? '&#x25B2;' : '&#x2713;') + '</span>';
      }
      html += '</div>';

      // Info
      html += '<div class="pkg-info">';
      html += '<div class="pkg-title"><span class="pkg-name">' + esc(pkg.name) + '</span>';
      if (pkg.dependencyType) {
        html += '<span class="pkg-dep-type">' + (pkg.dependencyType === 'devDependencies' ? 'dev' : 'dep') + '</span>';
      }
      if (pkg.author) html += '<span class="pkg-author">by ' + esc(pkg.author) + '</span>';
      if (pkg.weeklyDownloads) html += '<span class="pkg-downloads">' + formatDl(pkg.weeklyDownloads) + '/wk</span>';
      html += '</div>';
      html += '<div class="pkg-desc">' + esc(desc) + '</div>';
      html += '</div>';

      // Right side: version + action per row
      html += '<div class="pkg-right">';
      if (pkg.isOutdated) {
        html += '<div class="pkg-right-row">';
        html += '<span class="pkg-ver-installed">' + esc(pkg.installedVersionRange) + '</span>';
        html += '<button class="btn btn-secondary btn-icon pkg-action-btn" data-action="uninstall" data-pkg="' + esc(pkg.name) + '" title="Uninstall">&#x2716;</button>';
        html += '</div>';
        html += '<div class="pkg-right-row">';
        html += '<span>' + esc(pkg.version) + '</span>';
        html += '<button class="btn btn-secondary btn-icon pkg-action-btn" data-action="update" data-pkg="' + esc(pkg.name) + '" data-ver="' + esc(pkg.version) + '" data-dev="' + (pkg.dependencyType === 'devDependencies' ? '1' : '0') + '" title="Update">&#x2191;</button>';
        html += '</div>';
      } else if (pkg.isInstalled) {
        html += '<div class="pkg-right-row">';
        html += '<span>' + esc(pkg.installedVersionRange) + '</span>';
        html += '<button class="btn btn-secondary btn-icon pkg-action-btn" data-action="uninstall" data-pkg="' + esc(pkg.name) + '" title="Uninstall">&#x2716;</button>';
        html += '</div>';
      } else {
        html += '<div class="pkg-right-row">';
        html += '<span>' + esc(pkg.version) + '</span>';
        html += '<button class="btn btn-secondary btn-icon pkg-action-btn" data-action="install" data-pkg="' + esc(pkg.name) + '" data-ver="' + esc(pkg.version) + '" title="Install">&#x2193;</button>';
        html += '</div>';
      }
      html += '</div>';

      html += '</div>';
    }

    // Load More button (browse only, when there are more results)
    if (state.category === 'browse' && state.packages.length < state.totalHits) {
      html += '<div class="load-more-bar">' +
        '<button class="btn" id="load-more-btn">Load more (' + state.packages.length + ' of ' + state.totalHits + ')</button>' +
      '</div>';
    }

    $list.innerHTML = html;

    // Load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }

    // Event delegation: row clicks
    $list.querySelectorAll('.pkg-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]') || e.target.closest('.pkg-checkbox')) return;
        state.selectedId = row.dataset.id;
        state.selectedPkg = null;
        renderList();
        $details.innerHTML = '<div class="loading-message"><span class="spinner"></span> Loading package details...</div>';
        post({ command: 'select-package', packageName: row.dataset.id });
      });
    });

    // Action buttons
    $list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const name = btn.dataset.pkg;
        if (action === 'install') {
          post({ command: 'install', packageName: name, version: btn.dataset.ver, devDependency: false });
        } else if (action === 'update') {
          post({ command: 'update', packageName: name, version: btn.dataset.ver, devDependency: btn.dataset.dev === '1' });
        } else if (action === 'uninstall') {
          post({ command: 'uninstall', packageName: name });
        }
      });
    });

    // Select all (updates)
    const selectAllCb = document.getElementById('select-all-cb');
    const updateBtn = document.getElementById('update-selected-btn');
    if (selectAllCb) {
      const checkboxes = $list.querySelectorAll('.pkg-checkbox');
      selectAllCb.addEventListener('change', () => {
        checkboxes.forEach(cb => cb.checked = selectAllCb.checked);
        updateSelectedState();
      });
      checkboxes.forEach(cb => cb.addEventListener('change', updateSelectedState));

      function updateSelectedState() {
        const checked = $list.querySelectorAll('.pkg-checkbox:checked');
        updateBtn.disabled = checked.length === 0;
      }

      updateBtn.addEventListener('click', () => {
        const checked = $list.querySelectorAll('.pkg-checkbox:checked');
        const pkgs = [];
        checked.forEach(cb => {
          const pkg = state.packages.find(p => p.name === cb.dataset.check);
          if (pkg) pkgs.push({ name: pkg.name, version: pkg.version, devDependency: pkg.dependencyType === 'devDependencies' });
        });
        if (pkgs.length) post({ command: 'update-all', packages: pkgs });
      });
    }
  }

  // ── Render: Package details ──────────────────────
  function renderDetails() {
    const pkg = state.selectedPkg;
    if (!pkg) {
      $details.innerHTML = '<div class="detail-empty">Select a package to view details</div>';
      return;
    }

    let html = '';

    // Header
    html += '<div class="detail-header">';
    html += '<div class="detail-icon">';
    const detailInitials = pkg.name.startsWith('@')
      ? pkg.name.split('/').pop().slice(0, 2).toUpperCase()
      : pkg.name.slice(0, 2).toUpperCase();
    html += '<div class="detail-icon-placeholder">' + esc(detailInitials) + '</div>';
    html += '</div>';
    html += '<div class="detail-name">' + esc(pkg.name) + '</div>';
    html += '</div>';

    // Installed version row
    if (pkg.isInstalled) {
      html += '<div class="detail-version-row">';
      html += '<span class="label">Installed:</span>';
      html += '<span class="installed-badge">' + esc(pkg.installedVersionRange) + '</span>';
      html += '<button class="btn" data-detail-action="uninstall">Uninstall</button>';
      html += '</div>';
    }

    // Version selector row
    html += '<div class="detail-version-row">';
    html += '<span class="label">Version:</span>';
    html += '<select id="version-select">';
    if (pkg.versions && pkg.versions.length) {
      for (const v of pkg.versions) {
        const sel = v.version === pkg.version ? ' selected' : '';
        html += '<option value="' + esc(v.version) + '"' + sel + '>' + esc(v.version) + '</option>';
      }
    } else {
      html += '<option value="' + esc(pkg.version) + '">' + esc(pkg.version) + '</option>';
    }
    html += '</select>';
    html += '<button class="btn" data-detail-action="install">' + (pkg.isInstalled ? 'Update' : 'Install') + '</button>';
    html += '</div>';

    // Dev dependency checkbox (only for install, not update)
    if (!pkg.isInstalled) {
      html += '<label class="dev-dep-label"><input id="dev-dep-cb" type="checkbox" /> Install as devDependency</label>';
    }

    // Get the selected version's details
    const selectedVersion = (pkg.versions && pkg.versions.length)
      ? (pkg.versions.find(v => v.version === pkg.version) || pkg.versions[0])
      : null;

    // Deprecated banner
    const deprecatedMsg = selectedVersion ? selectedVersion.deprecated : pkg.deprecated;
    if (deprecatedMsg) {
      html += '<div class="deprecated-banner">';
      html += '<strong>&#x26A0; Deprecated:</strong> ' + esc(deprecatedMsg);
      html += '</div>';
    }

    // Description
    if (pkg.description) {
      html += '<div class="detail-desc-label">Description</div>';
      html += '<div class="detail-desc">' + esc(pkg.description) + '</div>';
    }

    // Metadata
    html += '<div class="detail-meta">';
    html += metaRow('Version:', pkg.version);
    if (pkg.author) html += metaRow('Author:', pkg.author);
    if (pkg.license) html += metaRow('License:', pkg.license);
    if (pkg.homepage) html += metaRowLink('Homepage:', pkg.homepage);
    html += '</div>';

    // Keywords
    if (pkg.keywords && pkg.keywords.length) {
      html += '<div class="detail-keywords">';
      for (const kw of pkg.keywords) {
        html += '<span class="keyword-tag">' + esc(kw) + '</span>';
      }
      html += '</div>';
    }

    // Dependencies
    if (selectedVersion && selectedVersion.dependencies && Object.keys(selectedVersion.dependencies).length) {
      html += '<details class="detail-deps" open>';
      html += '<summary>Dependencies</summary>';
      for (const [depName, depRange] of Object.entries(selectedVersion.dependencies)) {
        html += '<div class="dep-item">' + esc(depName) + ' ' + esc(depRange) + '</div>';
      }
      html += '</details>';
    }

    // Peer Dependencies
    if (selectedVersion && selectedVersion.peerDependencies && Object.keys(selectedVersion.peerDependencies).length) {
      html += '<details class="detail-deps">';
      html += '<summary>Peer Dependencies</summary>';
      for (const [depName, depRange] of Object.entries(selectedVersion.peerDependencies)) {
        html += '<div class="dep-item">' + esc(depName) + ' ' + esc(depRange) + '</div>';
      }
      html += '</details>';
    }

    $details.innerHTML = html;

    // Version select change
    const versionSelect = document.getElementById('version-select');
    if (versionSelect && pkg.versions) {
      versionSelect.addEventListener('change', () => {
        const ver = pkg.versions.find(v => v.version === versionSelect.value);
        if (ver) {
          const tempPkg = Object.assign({}, pkg);
          const idx = tempPkg.versions.indexOf(ver);
          if (idx > 0) {
            const reordered = [ver, ...tempPkg.versions.filter((_, i) => i !== idx)];
            tempPkg.versions = reordered;
          }
          state.selectedPkg = tempPkg;
          renderDetails();
          const sel = document.getElementById('version-select');
          if (sel) sel.value = ver.version;
        }
      });
    }

    // Detail action buttons
    $details.querySelectorAll('[data-detail-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.detailAction;
        const ver = (document.getElementById('version-select') || {}).value || pkg.version;
        const devCb = document.getElementById('dev-dep-cb');
        const isDev = devCb ? devCb.checked : pkg.dependencyType === 'devDependencies';
        if (action === 'install') {
          post({ command: pkg.isInstalled ? 'update' : 'install', packageName: pkg.name, version: ver, devDependency: isDev });
        } else if (action === 'uninstall') {
          post({ command: 'uninstall', packageName: pkg.name });
        }
      });
    });

    // Links
    $details.querySelectorAll('[data-url]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        post({ command: 'open-url', url: link.dataset.url });
      });
    });
  }

  // ── Render: Error ────────────────────────────────
  function renderError(message) {
    $list.innerHTML =
      '<div class="error-container">' +
        '<div class="error-message">Error: ' + esc(message) + '</div>' +
        '<button class="btn" id="retry-btn">Retry</button>' +
      '</div>';
    document.getElementById('retry-btn').addEventListener('click', triggerSearch);
  }

  // ── Helpers ──────────────────────────────────────
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDl(n) {
    if (n < 1000) return String(n);
    if (n < 1000000) return (n/1000).toFixed(1).replace(/\\.0$/, '') + 'K';
    if (n < 1000000000) return (n/1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
    return (n/1000000000).toFixed(1).replace(/\\.0$/, '') + 'B';
  }

  function metaRow(label, value) {
    return '<div class="detail-row"><span class="label">' + esc(label) + '</span><span>' + esc(value) + '</span></div>';
  }

  function metaRowLink(label, url) {
    return '<div class="detail-row"><span class="label">' + esc(label) + '</span><a href="#" data-url="' + esc(url) + '">' + esc(url) + '</a></div>';
  }

  // ── Resize handle ────────────────────────────────
  let resizing = false;
  $resize.addEventListener('mousedown', (e) => {
    resizing = true;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const mainRect = document.getElementById('main').getBoundingClientRect();
    const pct = ((e.clientX - mainRect.left) / mainRect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    $list.style.flex = 'none';
    $list.style.width = clamped + '%';
    $details.style.flex = 'none';
    $details.style.width = (100 - clamped) + '%';
  });
  window.addEventListener('mouseup', () => { resizing = false; });

  // ── Init ─────────────────────────────────────────
  post({ command: 'ready' });
})();
`
