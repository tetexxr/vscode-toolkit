/**
 * Generates the HTML/CSS/JS for the PDF Fields panel — inspects one PDF's
 * AcroForm fields in a table and lets the user edit their values inline (text,
 * checkbox, radio, dropdown, option list). Edits are tracked and applied in one
 * "Save changes" that overwrites the PDF; "Clear all" stages empties for every
 * editable field. Reuses the shared button and badge styling.
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

.col-index { width: 40px; color: var(--vscode-descriptionForeground); text-align: right; }
.col-type { text-align: center; white-space: nowrap; }
.col-value { width: 45%; }
.cell-name { font-family: var(--vscode-editor-font-family, monospace); }
.truncate { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.field-input, .field-select {
  width: 100%;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  padding: 3px 6px;
  font-family: inherit;
  font-size: inherit;
}
.field-input:focus-visible, .field-select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
select[multiple].field-select { min-height: 3.6em; }
.field-check { width: 16px; height: 16px; vertical-align: middle; }
.field-dirty { border-color: ${cssColor.warning}; }

.readonly-value { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); }
.dirty-dot { color: ${cssColor.warning}; margin-left: 6px; }

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
    edits: {}   // name -> canonical edited value (string | boolean | string[])
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
      state.edits = {};   // fresh baseline whenever the document is (re)read
      render();
    }
  });

  // ── value model ────────────────────────────────────────
  function originalValue(f) {
    if (f.type === 'CheckBox') { return !!f.checked; }
    if (f.type === 'OptionList') { return (f.selected || []).slice(); }
    if (f.type === 'RadioGroup' || f.type === 'Dropdown') { return (f.selected && f.selected[0]) || ''; }
    return f.value || '';
  }
  function currentValue(f) {
    return Object.prototype.hasOwnProperty.call(state.edits, f.name) ? state.edits[f.name] : originalValue(f);
  }
  function eq(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const aa = a || [], bb = b || [];
      return aa.length === bb.length && aa.every(function (v, i) { return v === bb[i]; });
    }
    return a === b;
  }
  function isDirty(f) { return !eq(currentValue(f), originalValue(f)); }
  function dirtyFields() { return state.fields.filter(isDirty); }

  function setEdit(name, value) { state.edits[name] = value; }

  // ── toolbar ────────────────────────────────────────────
  function renderToolbar() {
    const dirty = dirtyFields().length;
    const editable = state.fields.filter(function (f) { return f.editable; }).length;
    const canAct = state.hasForm && !state.loading && !state.error;
    $toolbar.innerHTML =
      '<span class="toolbar-title">PDF Fields</span>' +
      '<input id="search" class="search-box" type="search" placeholder="Filter by name, type or value…" value="' + esc(state.search) + '" />' +
      (canAct && editable > 0 ? '<button class="btn btn-secondary" id="clear-all-btn">Clear all</button>' : '') +
      (canAct ? '<button class="btn btn-secondary" id="reset-btn"' + (dirty === 0 ? ' disabled' : '') + '>Reset</button>' : '') +
      (canAct ? '<button class="btn" id="save-btn"' + (dirty === 0 ? ' disabled' : '') + '>Save changes' + (dirty > 0 ? ' (' + dirty + ')' : '') + '</button>' : '');

    const search = document.getElementById('search');
    if (search) { search.addEventListener('input', function (e) { state.search = e.target.value; renderContent(); }); }

    const clearAll = document.getElementById('clear-all-btn');
    if (clearAll) {
      clearAll.addEventListener('click', function () {
        state.fields.forEach(function (f) {
          if (!f.editable) { return; }
          setEdit(f.name, f.type === 'CheckBox' ? false : f.type === 'OptionList' ? [] : '');
        });
        render();
      });
    }
    const reset = document.getElementById('reset-btn');
    if (reset) { reset.addEventListener('click', function () { state.edits = {}; render(); }); }
    const save = document.getElementById('save-btn');
    if (save) {
      save.addEventListener('click', function () {
        const values = dirtyFields().map(function (f) { return { name: f.name, value: currentValue(f) }; });
        if (values.length === 0) { return; }
        save.disabled = true;
        save.innerHTML = '<span class="spinner"></span> Saving…';
        post({ command: 'save', values: values });
      });
    }
  }

  function renderSummary() {
    if (state.loading || state.error || !state.hasForm) { $summary.textContent = ''; return; }
    const editable = state.fields.filter(function (f) { return f.editable; }).length;
    $summary.textContent = esc(state.relPath) + ' · ' + state.fields.length + ' field(s) · ' + editable + ' editable';
  }

  // ── field controls ─────────────────────────────────────
  function controlHtml(f) {
    if (!f.editable) {
      const v = f.hasValue ? esc(f.value) : '—';
      return '<span class="readonly-value" title="' + esc(f.type) + ' fields have no editable value">' + v + '</span>';
    }
    const val = currentValue(f);
    if (f.type === 'CheckBox') {
      return '<input type="checkbox" class="field-check" data-name="' + esc(f.name) + '"' + (val ? ' checked' : '') + ' />';
    }
    if (f.type === 'RadioGroup' || f.type === 'Dropdown') {
      let html = '<select class="field-select" data-name="' + esc(f.name) + '"><option value="">— none —</option>';
      (f.options || []).forEach(function (opt) {
        html += '<option value="' + esc(opt) + '"' + (opt === val ? ' selected' : '') + '>' + esc(opt) + '</option>';
      });
      return html + '</select>';
    }
    if (f.type === 'OptionList') {
      const sel = Array.isArray(val) ? val : [];
      let html = '<select multiple class="field-select" data-name="' + esc(f.name) + '">';
      (f.options || []).forEach(function (opt) {
        html += '<option value="' + esc(opt) + '"' + (sel.indexOf(opt) !== -1 ? ' selected' : '') + '>' + esc(opt) + '</option>';
      });
      return html + '</select>';
    }
    return '<input type="text" class="field-input" data-name="' + esc(f.name) + '" value="' + esc(val) + '" />';
  }

  function renderContent() {
    if (state.loading) { $content.innerHTML = '<div class="empty-message"><span class="spinner"></span> Reading PDF…</div>'; return; }
    if (state.error) { $content.innerHTML = '<div class="empty-message error-message">' + esc(state.error) + '</div>'; return; }
    if (!state.hasForm) { $content.innerHTML = '<div class="empty-message">This PDF has no form fields.</div>'; return; }

    const q = state.search.trim().toLowerCase();
    const rows = q
      ? state.fields.filter(function (f) { return (f.name + ' ' + f.type + ' ' + f.value).toLowerCase().indexOf(q) !== -1; })
      : state.fields;
    if (rows.length === 0) { $content.innerHTML = '<div class="empty-message">Nothing matches the filter.</div>'; return; }

    let html = '<table><thead><tr>' +
      '<th class="col-index">#</th><th>Field Name</th><th class="col-type">Type</th><th class="col-value">Value</th>' +
      '</tr></thead><tbody>';
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      html += '<tr>' +
        '<td class="col-index">' + (i + 1) + '</td>' +
        '<td class="cell-name truncate" title="' + esc(f.name) + '">' + esc(f.name) +
          (isDirty(f) ? '<span class="dirty-dot" title="Unsaved change">●</span>' : '') + '</td>' +
        '<td class="col-type"><span class="badge badge-neutral">' + esc(f.type) + '</span></td>' +
        '<td class="col-value">' + controlHtml(f) + '</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    $content.innerHTML = html;
    wireControls();
  }

  // Update edits without re-rendering the table, so text inputs keep focus.
  function onEdited(name) {
    const f = state.fields.find(function (x) { return x.name === name; });
    const row = $content.querySelector('[data-name="' + cssEscape(name) + '"]');
    if (row) { row.classList.toggle('field-dirty', f && isDirty(f)); }
    const nameCell = row ? row.closest('tr').querySelector('.cell-name') : null;
    if (nameCell) {
      const existing = nameCell.querySelector('.dirty-dot');
      if (f && isDirty(f) && !existing) {
        const dot = document.createElement('span');
        dot.className = 'dirty-dot'; dot.title = 'Unsaved change'; dot.textContent = '●';
        nameCell.appendChild(dot);
      } else if ((!f || !isDirty(f)) && existing) {
        existing.remove();
      }
    }
    renderToolbar();
  }
  function cssEscape(s) { return String(s).replace(/["\\\\]/g, '\\\\$&'); }

  function wireControls() {
    $content.querySelectorAll('.field-input').forEach(function (el) {
      el.addEventListener('input', function () { setEdit(this.getAttribute('data-name'), this.value); onEdited(this.getAttribute('data-name')); });
    });
    $content.querySelectorAll('.field-check').forEach(function (el) {
      el.addEventListener('change', function () { setEdit(this.getAttribute('data-name'), this.checked); onEdited(this.getAttribute('data-name')); });
    });
    $content.querySelectorAll('select.field-select').forEach(function (el) {
      el.addEventListener('change', function () {
        const name = this.getAttribute('data-name');
        if (this.multiple) {
          const vals = Array.prototype.filter.call(this.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
          setEdit(name, vals);
        } else {
          setEdit(name, this.value);
        }
        onEdited(name);
      });
    });
  }

  function render() { renderToolbar(); renderSummary(); renderContent(); }

  render();
  post({ command: 'ready' });
})();
`
