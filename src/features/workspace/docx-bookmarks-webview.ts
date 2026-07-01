/**
 * Generates the HTML/CSS/JS for the Word Bookmarks panel — a flat, filterable
 * table with one row per bookmark across every scanned .docx, and a [Fix]
 * action on the rows that can be consolidated. Reuses the shared button styling
 * and semantic palette so it matches the rest of the toolkit's panels.
 */

import { cssColor } from '../../utils/palette'
import { BUTTON_CSS, BADGE_CSS } from '../../utils/webview-ui'

export function generateBookmarksHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Word Bookmarks</title>
  <style nonce="${nonce}">${CSS}</style>
</head>
<body>
  <div id="app">
    <div id="toolbar"></div>
    <div id="summary"></div>
    <div id="content"></div>
  </div>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`
}

const CSS = /*css*/ `
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

#app { padding: 1rem; }

#toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.toolbar-title { font-size: 1.3rem; font-weight: 600; margin-right: 0.25rem; }

${BUTTON_CSS}

.search-box {
  flex: 1;
  min-width: 140px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: inherit;
}
.search-box:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }

/* Segmented filter (All / Issues / Fixable) */
.segmented {
  display: inline-flex;
  border: 1px solid ${cssColor.border};
  border-radius: 4px;
  overflow: hidden;
}
.segmented button {
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--vscode-foreground);
  padding: 4px 10px;
}
.segmented button:hover { background: ${cssColor.surface}; }
.segmented button.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

#summary { margin-bottom: 0.5rem; color: var(--vscode-descriptionForeground); font-size: 0.9rem; min-height: 1.2em; }

table { width: 100%; border-collapse: collapse; }
thead th {
  position: sticky;
  top: 0;
  text-align: left;
  font-weight: 600;
  padding: 6px 10px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid ${cssColor.border};
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
thead th .arrow { opacity: 0.6; font-size: 0.8em; }
tbody td { padding: 6px 10px; border-bottom: 1px solid ${cssColor.surface}; vertical-align: middle; }
tbody tr:hover { background: ${cssColor.surface}; }

.cell-file { color: var(--vscode-textLink-foreground); cursor: pointer; }
.cell-file:hover { text-decoration: underline; }
.cell-name { font-family: var(--vscode-editor-font-family, monospace); }
.cell-part { color: var(--vscode-descriptionForeground); white-space: nowrap; }
.cell-runs { text-align: center; color: var(--vscode-descriptionForeground); }
.cell-detail { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
.truncate { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

${BADGE_CSS}

.btn-fix { font-size: 0.8rem; padding: 2px 10px; }

.empty-message {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--vscode-descriptionForeground);
  font-size: 1.05rem;
}

.spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid var(--vscode-button-foreground);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: -2px;
}
@keyframes spin { to { transform: rotate(360deg); } }
`

const JS = /*js*/ `
(function () {
  const vscode = acquireVsCodeApi();

  const state = {
    rows: [],
    scope: '',
    scanning: true,
    filter: 'issues',   // 'issues' | 'fixable' | 'all'
    search: '',
    sortKey: 'file',
    sortDir: 1
  };

  const $toolbar = document.getElementById('toolbar');
  const $summary = document.getElementById('summary');
  const $content = document.getElementById('content');

  function post(msg) { vscode.postMessage(msg); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function basename(p) { const parts = String(p).split(/[\\\\/]/); return parts[parts.length - 1]; }
  function shortPart(p) { return String(p).replace(/^word\\//, ''); }

  const STATUS = {
    'ok':            { label: 'ok',          cls: 'badge-success' },
    'split-runs':    { label: 'split',       cls: 'badge-error' },
    'duplicate-name':{ label: 'duplicate',   cls: 'badge-warning' },
    'orphan-start':  { label: 'orphan start',cls: 'badge-warning' },
    'orphan-end':    { label: 'orphan end',  cls: 'badge-warning' },
    'name-too-long': { label: 'name > 40',   cls: 'badge-warning' }
  };

  window.addEventListener('message', function (e) {
    const msg = e.data;
    if (msg.type === 'state') {
      state.rows = msg.rows;
      state.scope = msg.scope;
      state.scanning = msg.scanning;
      render();
    } else if (msg.type === 'scanning') {
      state.scanning = true;
      render();
    }
  });

  function statusOf(row) { return STATUS[row.kind] || STATUS['ok']; }
  function isIssue(row) { return row.kind !== 'ok'; }

  function visibleRows() {
    let rows = state.rows.slice();
    if (state.filter === 'issues') { rows = rows.filter(isIssue); }
    else if (state.filter === 'fixable') { rows = rows.filter(function (r) { return r.fixable; }); }
    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (r) {
        return (r.relPath + ' ' + r.name).toLowerCase().indexOf(q) !== -1;
      });
    }
    const k = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      let av, bv;
      if (k === 'file') { av = a.relPath; bv = b.relPath; }
      else if (k === 'name') { av = a.name; bv = b.name; }
      else if (k === 'status') { av = statusOf(a).label; bv = statusOf(b).label; }
      else if (k === 'runs') { return (a.runCount - b.runCount) * dir; }
      else { av = a.relPath; bv = b.relPath; }
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }

  function countFixable() {
    return state.rows.filter(function (r) { return r.fixable; }).length;
  }

  function renderToolbar() {
    const fixable = countFixable();
    function seg(id, label) {
      return '<button data-filter="' + id + '" class="' + (state.filter === id ? 'active' : '') + '">' + label + '</button>';
    }
    $toolbar.innerHTML =
      '<span class="toolbar-title">Word Bookmarks</span>' +
      '<button class="btn btn-secondary" id="scan-btn"' + (state.scanning ? ' disabled' : '') + '>' +
        (state.scanning ? '<span class="spinner"></span> Scanning…' : 'Scan workspace') +
      '</button>' +
      '<button class="btn" id="fixall-btn"' + (state.scanning || fixable === 0 ? ' disabled' : '') + '>Fix all (' + fixable + ')</button>' +
      '<input id="search" class="search-box" type="search" placeholder="Filter by file or bookmark…" value="' + esc(state.search) + '" />' +
      '<span class="segmented">' + seg('issues', 'Issues') + seg('fixable', 'Fixable') + seg('all', 'All') + '</span>';

    document.getElementById('scan-btn').addEventListener('click', function () {
      state.scanning = true; renderToolbar();
      post({ command: 'scanWorkspace' });
    });
    document.getElementById('fixall-btn').addEventListener('click', function () {
      post({ command: 'fixAll' });
    });
    const search = document.getElementById('search');
    search.addEventListener('input', function (e) { state.search = e.target.value; renderContent(); });
    const segs = $toolbar.querySelectorAll('.segmented button');
    for (let i = 0; i < segs.length; i++) {
      segs[i].addEventListener('click', function () {
        state.filter = this.getAttribute('data-filter'); render();
      });
    }
  }

  function renderSummary() {
    if (state.scanning) { $summary.textContent = ''; return; }
    const files = {};
    let issues = 0;
    for (let i = 0; i < state.rows.length; i++) {
      files[state.rows[i].file] = true;
      if (isIssue(state.rows[i])) { issues++; }
    }
    const fileCount = Object.keys(files).length;
    $summary.textContent =
      state.rows.length + ' bookmark(s) in ' + fileCount + ' file(s) · ' +
      issues + ' issue(s) · ' + countFixable() + ' fixable' +
      (state.scope ? ' · ' + state.scope : '');
  }

  function arrow(key) {
    if (state.sortKey !== key) { return ''; }
    return ' <span class="arrow">' + (state.sortDir === 1 ? '▲' : '▼') + '</span>';
  }

  function renderContent() {
    if (state.scanning) {
      $content.innerHTML = '<div class="empty-message"><span class="spinner"></span> Scanning documents…</div>';
      return;
    }
    if (state.rows.length === 0) {
      $content.innerHTML = '<div class="empty-message">No .docx files found in the scope.</div>';
      return;
    }
    const rows = visibleRows();
    if (rows.length === 0) {
      const msg = state.filter === 'issues' ? 'No bookmark issues — all clean 🎉' : 'Nothing matches the current filter.';
      $content.innerHTML = '<div class="empty-message">' + msg + '</div>';
      return;
    }

    let html = '<table><thead><tr>' +
      '<th data-sort="file">File' + arrow('file') + '</th>' +
      '<th data-sort="name">Bookmark' + arrow('name') + '</th>' +
      '<th>Location</th>' +
      '<th data-sort="status">Status' + arrow('status') + '</th>' +
      '<th data-sort="runs">Runs' + arrow('runs') + '</th>' +
      '<th>Action</th>' +
      '</tr></thead><tbody>';

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const s = statusOf(r);
      const label = r.kind === 'split-runs' ? 'split (' + r.runCount + ')' : s.label;
      html += '<tr>' +
        '<td><span class="cell-file truncate" data-file="' + esc(r.file) + '" title="' + esc(r.relPath) + '">' + esc(basename(r.relPath)) + '</span></td>' +
        '<td class="cell-name truncate" title="' + esc(r.name) + '">' + esc(r.name) + '</td>' +
        '<td class="cell-part">' + esc(shortPart(r.part)) + '</td>' +
        '<td><span class="badge ' + s.cls + '" title="' + esc(r.detail) + '">' + esc(label) + '</span></td>' +
        '<td class="cell-runs">' + (r.runCount || '') + '</td>' +
        '<td>' + (r.fixable
          ? '<button class="btn btn-fix" data-fix="1" data-file="' + esc(r.file) + '" data-part="' + esc(r.part) + '" data-name="' + esc(r.name) + '">Fix</button>'
          : '<span class="cell-detail">—</span>') +
        '</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    $content.innerHTML = html;

    const fileCells = $content.querySelectorAll('.cell-file');
    for (let i = 0; i < fileCells.length; i++) {
      fileCells[i].addEventListener('click', function () {
        post({ command: 'revealFile', file: this.getAttribute('data-file') });
      });
    }
    const fixBtns = $content.querySelectorAll('button[data-fix]');
    for (let i = 0; i < fixBtns.length; i++) {
      fixBtns[i].addEventListener('click', function () {
        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span>';
        post({ command: 'fix', file: this.getAttribute('data-file'), part: this.getAttribute('data-part'), name: this.getAttribute('data-name') });
      });
    }
    const headers = $content.querySelectorAll('th[data-sort]');
    for (let i = 0; i < headers.length; i++) {
      headers[i].addEventListener('click', function () {
        const key = this.getAttribute('data-sort');
        if (state.sortKey === key) { state.sortDir = -state.sortDir; } else { state.sortKey = key; state.sortDir = 1; }
        render();
      });
    }
  }

  function render() { renderToolbar(); renderSummary(); renderContent(); }

  render();
  post({ command: 'ready' });
})();
`
