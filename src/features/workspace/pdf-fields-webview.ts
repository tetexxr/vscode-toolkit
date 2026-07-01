/**
 * Generates the HTML/CSS/JS for the PDF Fields panel — inspects one PDF's
 * AcroForm fields in a table (name, type, current value) and lets the user
 * select fields that hold a value and clear them. Reuses the shared button and
 * badge styling so it matches the rest of the toolkit's panels.
 */

import { cssColor } from '../../utils/palette'
import { BUTTON_CSS, BADGE_CSS } from '../../utils/webview-ui'

export function generatePdfFieldsHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>PDF Fields</title>
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
  margin-bottom: 0.5rem;
}
.toolbar-title { font-size: 1.3rem; font-weight: 600; margin-right: 0.25rem; }

${BUTTON_CSS}
${BADGE_CSS}

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
  white-space: nowrap;
}
tbody td { padding: 6px 10px; border-bottom: 1px solid ${cssColor.surface}; vertical-align: middle; }
tbody tr:hover { background: ${cssColor.surface}; }

.col-check { width: 34px; text-align: center; }
.col-index { width: 40px; color: var(--vscode-descriptionForeground); text-align: right; }
.col-type { text-align: center; }
.cell-name { font-family: var(--vscode-editor-font-family, monospace); }
.cell-value { font-family: var(--vscode-editor-font-family, monospace); word-break: break-word; }
.cell-empty { color: var(--vscode-descriptionForeground); }
.truncate { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-message {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--vscode-descriptionForeground);
  font-size: 1.05rem;
}
.error-message { color: var(--vscode-errorForeground); }

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
    fileName: '',
    relPath: '',
    fields: [],
    hasForm: false,
    loading: true,
    error: '',
    search: '',
    selected: {}
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

  window.addEventListener('message', function (e) {
    const msg = e.data;
    if (msg.type === 'state') {
      state.fileName = msg.fileName;
      state.relPath = msg.relPath;
      state.fields = msg.fields || [];
      state.hasForm = msg.hasForm;
      state.loading = msg.loading;
      state.error = msg.error || '';
      state.selected = {};   // reset selection whenever the document is (re)read
      render();
    }
  });

  function valuedFields() { return state.fields.filter(function (f) { return f.hasValue; }); }
  function selectedNames() { return Object.keys(state.selected).filter(function (n) { return state.selected[n]; }); }

  function visibleFields() {
    const q = state.search.trim().toLowerCase();
    if (!q) { return state.fields; }
    return state.fields.filter(function (f) {
      return (f.name + ' ' + f.type + ' ' + f.value).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderToolbar() {
    const selCount = selectedNames().length;
    const canClear = valuedFields().length > 0;
    $toolbar.innerHTML =
      '<span class="toolbar-title">PDF Fields</span>' +
      '<input id="search" class="search-box" type="search" placeholder="Filter by name, type or value…" value="' + esc(state.search) + '" />' +
      (canClear
        ? '<button class="btn" id="clear-btn"' + (selCount === 0 ? ' disabled' : '') + '>' +
            'Clear ' + (selCount > 0 ? selCount + ' field' + (selCount > 1 ? 's' : '') : 'selected') +
          '</button>'
        : '');

    document.getElementById('search').addEventListener('input', function (e) { state.search = e.target.value; renderContent(); });
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        const names = selectedNames();
        if (names.length === 0) { return; }
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<span class="spinner"></span> Clearing…';
        post({ command: 'clear', names: names });
      });
    }
  }

  function renderSummary() {
    if (state.loading || state.error || !state.hasForm) { $summary.textContent = ''; return; }
    $summary.textContent =
      esc(state.relPath) + ' · ' + state.fields.length + ' field(s) · ' + valuedFields().length + ' with a value';
  }

  function renderContent() {
    if (state.loading) {
      $content.innerHTML = '<div class="empty-message"><span class="spinner"></span> Reading PDF…</div>';
      return;
    }
    if (state.error) {
      $content.innerHTML = '<div class="empty-message error-message">' + esc(state.error) + '</div>';
      return;
    }
    if (!state.hasForm) {
      $content.innerHTML = '<div class="empty-message">This PDF has no form fields.</div>';
      return;
    }

    const rows = visibleFields();
    if (rows.length === 0) {
      $content.innerHTML = '<div class="empty-message">Nothing matches the filter.</div>';
      return;
    }

    const anyValued = valuedFields().length > 0;
    let html = '<table><thead><tr>' +
      (anyValued ? '<th class="col-check"><input type="checkbox" id="select-all" title="Select all fields with a value" /></th>' : '') +
      '<th class="col-index">#</th>' +
      '<th>Field Name</th>' +
      '<th class="col-type">Type</th>' +
      '<th>Current Value</th>' +
      '</tr></thead><tbody>';

    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      html += '<tr>' +
        (anyValued
          ? '<td class="col-check">' + (f.hasValue
              ? '<input type="checkbox" class="field-check" data-name="' + esc(f.name) + '"' + (state.selected[f.name] ? ' checked' : '') + ' />'
              : '') + '</td>'
          : '') +
        '<td class="col-index">' + (i + 1) + '</td>' +
        '<td class="cell-name truncate" title="' + esc(f.name) + '">' + esc(f.name) + '</td>' +
        '<td class="col-type"><span class="badge badge-neutral">' + esc(f.type) + '</span></td>' +
        '<td class="cell-value">' + (f.hasValue ? esc(f.value) : '<span class="cell-empty">—</span>') + '</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    $content.innerHTML = html;

    const checks = $content.querySelectorAll('.field-check');
    for (let i = 0; i < checks.length; i++) {
      checks[i].addEventListener('change', function () {
        state.selected[this.getAttribute('data-name')] = this.checked;
        syncSelectAll();
        renderToolbar();
      });
    }
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
      syncSelectAll();
      selectAll.addEventListener('change', function () {
        const on = this.checked;
        valuedFields().forEach(function (f) { state.selected[f.name] = on; });
        renderContent();
        renderToolbar();
      });
    }
  }

  function syncSelectAll() {
    const selectAll = document.getElementById('select-all');
    if (!selectAll) { return; }
    const valued = valuedFields();
    selectAll.checked = valued.length > 0 && valued.every(function (f) { return state.selected[f.name]; });
  }

  function render() { renderToolbar(); renderSummary(); renderContent(); }

  render();
  post({ command: 'ready' });
})();
`
