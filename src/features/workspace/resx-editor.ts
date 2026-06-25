import * as vscode from 'vscode'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import {
  diffResx,
  escapeXmlText,
  findEntryLineRange,
  findValueOffsets,
  normalizeResx,
  parseResx,
  parseResxName,
  planInsertions,
  renameKeyInText,
  reorderToNeutral,
  stringEntries,
  unescapeXml
} from './resx-check-utils'

/**
 * Resource grid editor — a custom editor over `.resx` that shows the whole
 * localization group (neutral + per-locale satellites) as a grid: keys down
 * the side, one column per language. Editing a cell writes into the right
 * file; missing keys are highlighted and can be filled in or added across all
 * languages at once. The raw XML stays available via "Reopen With… → Text".
 */

const NEUTRAL_ID = '__neutral__'

interface Column {
  id: string
  /** Locale code, or null for the neutral file. */
  locale: string | null
  label: string
  uri: vscode.Uri
  document: vscode.TextDocument
}

interface CellPayload {
  value: string
  present: boolean
  placeholderMismatch: boolean
}

interface RowPayload {
  key: string
  cells: Record<string, CellPayload>
}

interface GridPayload {
  type: 'grid'
  base: string
  columns: { id: string; label: string; dirty: boolean; complete: number | null }[]
  rows: RowPayload[]
  /** Column ids that are missing at least one key. */
  hasNeutral: boolean
}

class GridSession {
  private columns: Column[] = []
  private neutralKeys: string[] = []
  private readonly disposables: vscode.Disposable[] = []
  private refreshTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel
  ) {}

  async init(): Promise<void> {
    this.panel.webview.options = { enableScripts: true }
    await this.resolveColumns()
    this.panel.webview.html = this.html()

    this.panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables)
    vscode.workspace.onDidChangeTextDocument(
      e => {
        if (this.columns.some(c => c.document.uri.toString() === e.document.uri.toString())) {
          this.scheduleRefresh()
        }
      },
      null,
      this.disposables
    )
    vscode.workspace.onDidSaveTextDocument(
      doc => {
        if (this.columns.some(c => c.document.uri.toString() === doc.uri.toString())) {
          this.scheduleRefresh()
        }
      },
      null,
      this.disposables
    )
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  /** Build the ordered list of columns by listing the document's folder. */
  private async resolveColumns(): Promise<void> {
    const parsed = parseResxName(path.basename(this.document.uri.fsPath))
    const dir = vscode.Uri.joinPath(this.document.uri, '..')
    const members: { locale: string | null; uri: vscode.Uri }[] = []
    if (parsed) {
      try {
        for (const [name, type] of await vscode.workspace.fs.readDirectory(dir)) {
          if (type !== vscode.FileType.File) {
            continue
          }
          const member = parseResxName(name)
          if (member && member.base === parsed.base) {
            members.push({ locale: member.locale, uri: vscode.Uri.joinPath(dir, name) })
          }
        }
      } catch {
        // fall back to just the opened file below
      }
    }
    if (members.length === 0) {
      members.push({ locale: parsed?.locale ?? null, uri: this.document.uri })
    }

    // Neutral first, then locales alphabetically.
    members.sort((a, b) => {
      if (a.locale === null) {
        return -1
      }
      if (b.locale === null) {
        return 1
      }
      return a.locale.localeCompare(b.locale)
    })

    const columns: Column[] = []
    for (const m of members) {
      const doc =
        m.uri.toString() === this.document.uri.toString()
          ? this.document
          : await vscode.workspace.openTextDocument(m.uri)
      columns.push({
        id: m.locale ?? NEUTRAL_ID,
        locale: m.locale,
        label: m.locale ?? 'neutral',
        uri: m.uri,
        document: doc
      })
    }
    this.columns = columns
    const neutral = columns.find(c => c.locale === null)
    this.neutralKeys = neutral ? stringEntries(parseResx(neutral.document.getText())).map(e => e.name) : []
  }

  private columnById(id: string): Column | undefined {
    return this.columns.find(c => c.id === id)
  }

  /** Compute the full grid payload from the current document contents. */
  private buildGrid(): GridPayload {
    const neutral = this.columns.find(c => c.locale === null)
    const neutralText = neutral?.document.getText() ?? ''
    const neutralKeys = neutral ? stringEntries(parseResx(neutralText)).map(e => e.name) : []
    this.neutralKeys = neutralKeys

    // Per-column maps + diff, computed once.
    const perColumn = this.columns.map(col => {
      const text = col.document.getText()
      const entries = stringEntries(parseResx(text))
      const values = new Map(entries.map(e => [e.name, unescapeXml(e.value)]))
      const diff = neutral && col.locale !== null ? diffResx(neutralText, text) : null
      const mismatched = new Set(diff?.placeholderMismatch ?? [])
      // Translation coverage: how many of the neutral's keys this language has.
      const complete =
        col.locale === null || neutralKeys.length === 0
          ? null
          : Math.round(((neutralKeys.length - (diff?.missing.length ?? 0)) / neutralKeys.length) * 100)
      return { col, keys: entries.map(e => e.name), values, mismatched, complete }
    })

    // Row order: neutral keys first, then any keys only present in locales.
    const order: string[] = [...neutralKeys]
    const seen = new Set(order)
    for (const pc of perColumn) {
      for (const k of pc.keys) {
        if (!seen.has(k)) {
          seen.add(k)
          order.push(k)
        }
      }
    }

    const rows: RowPayload[] = order.map(key => {
      const cells: Record<string, CellPayload> = {}
      for (const pc of perColumn) {
        const present = pc.values.has(key)
        cells[pc.col.id] = {
          value: present ? pc.values.get(key)! : '',
          present,
          placeholderMismatch: pc.mismatched.has(key)
        }
      }
      return { key, cells }
    })

    return {
      type: 'grid',
      base: parseResxName(path.basename(this.document.uri.fsPath))?.base ?? '',
      columns: perColumn.map(pc => ({
        id: pc.col.id,
        label: pc.col.label,
        dirty: pc.col.document.isDirty,
        complete: pc.complete
      })),
      rows,
      hasNeutral: !!neutral
    }
  }

  private postGrid(): void {
    void this.panel.webview.postMessage(this.buildGrid())
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }
    this.refreshTimer = setTimeout(() => this.postGrid(), 80)
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
      return
    }
    const m = msg as Record<string, unknown>
    switch (m.type) {
      case 'ready':
        this.postGrid()
        return
      case 'edit':
        await this.setValue(String(m.colId), String(m.key), typeof m.value === 'string' ? m.value : '')
        return
      case 'addKey':
        await this.addKey()
        return
      case 'renameKey':
        await this.renameKey(String(m.key))
        return
      case 'deleteKey':
        await this.deleteKey(String(m.key))
        return
      case 'normalize':
        await this.normalize()
        return
      case 'saveAll':
        await this.saveAll()
        return
      case 'sort':
        await this.sortToNeutral()
        return
      case 'open':
        await this.openSource(String(m.colId))
        return
    }
  }

  /** Write a value into one column's file, replacing or inserting the entry. */
  private async setValue(colId: string, key: string, value: string): Promise<void> {
    const col = this.columnById(colId)
    if (!col) {
      return
    }
    const text = col.document.getText()
    const escaped = escapeXmlText(value)
    const offsets = findValueOffsets(text, key)
    const edit = new vscode.WorkspaceEdit()
    if (offsets) {
      edit.replace(
        col.uri,
        new vscode.Range(col.document.positionAt(offsets.start), col.document.positionAt(offsets.end)),
        escaped
      )
    } else {
      // Key absent in this file: insert a fresh entry, in the neutral order.
      const orderKeys = this.neutralKeys.length > 0 ? this.neutralKeys : [key]
      const plan = planInsertions(text, orderKeys, [key])
      if (plan.length === 0) {
        return
      }
      const entry = plan[0].text.replace('<value></value>', `<value>${escaped}</value>`)
      edit.insert(col.uri, new vscode.Position(plan[0].atLine, 0), entry + '\n')
    }
    await vscode.workspace.applyEdit(edit)
    // onDidChangeTextDocument will refresh the grid (present flags, etc.).
  }

  /** Prompt for a new key and add it (empty) to every language. */
  private async addKey(): Promise<void> {
    const key = await vscode.window.showInputBox({
      title: 'Add resource key',
      prompt: 'New key name — added (empty) to every language',
      validateInput: value => {
        const trimmed = value.trim()
        if (!trimmed) {
          return 'Enter a key name.'
        }
        if (this.columns.some(c => stringEntries(parseResx(c.document.getText())).some(e => e.name === trimmed))) {
          return 'That key already exists.'
        }
        return null
      }
    })
    if (!key) {
      return
    }
    const trimmed = key.trim()
    const orderKeys = this.neutralKeys.includes(trimmed) ? this.neutralKeys : [...this.neutralKeys, trimmed]
    const edit = new vscode.WorkspaceEdit()
    for (const col of this.columns) {
      const plan = planInsertions(col.document.getText(), orderKeys, [trimmed])
      if (plan.length > 0) {
        edit.insert(col.uri, new vscode.Position(plan[0].atLine, 0), plan[0].text + '\n')
      }
    }
    await vscode.workspace.applyEdit(edit)
  }

  /** Rename a key across every language file. */
  private async renameKey(oldKey: string): Promise<void> {
    const newKey = await vscode.window.showInputBox({
      title: 'Rename resource key',
      prompt: 'Renamed across every language',
      value: oldKey,
      validateInput: value => {
        const trimmed = value.trim()
        if (!trimmed) {
          return 'Enter a key name.'
        }
        if (trimmed === oldKey) {
          return null
        }
        if (this.columns.some(c => stringEntries(parseResx(c.document.getText())).some(e => e.name === trimmed))) {
          return 'That key already exists.'
        }
        return null
      }
    })
    const trimmed = newKey?.trim()
    if (!trimmed || trimmed === oldKey) {
      return
    }
    const edit = new vscode.WorkspaceEdit()
    for (const col of this.columns) {
      const text = col.document.getText()
      const renamed = renameKeyInText(text, oldKey, trimmed)
      if (renamed !== text) {
        edit.replace(col.uri, new vscode.Range(col.document.positionAt(0), col.document.positionAt(text.length)), renamed)
      }
    }
    if (edit.size > 0) {
      await vscode.workspace.applyEdit(edit)
    }
  }

  /** Delete a key from every language file (with confirmation). */
  private async deleteKey(key: string): Promise<void> {
    const present = this.columns.filter(c => findEntryLineRange(c.document.getText(), key))
    if (present.length === 0) {
      return
    }
    const choice = await vscode.window.showWarningMessage(
      `Delete "${key}" from ${present.length} language file(s)?`,
      { modal: true },
      'Delete'
    )
    if (choice !== 'Delete') {
      return
    }
    const edit = new vscode.WorkspaceEdit()
    for (const col of present) {
      const range = findEntryLineRange(col.document.getText(), key)!
      const end =
        range.endLine + 1 < col.document.lineCount
          ? new vscode.Position(range.endLine + 1, 0)
          : col.document.lineAt(range.endLine).range.end
      edit.delete(col.uri, new vscode.Range(new vscode.Position(range.startLine, 0), end))
    }
    await vscode.workspace.applyEdit(edit)
  }

  /** Rewrite every file in the group to the canonical compact format. */
  private async normalize(): Promise<void> {
    const edit = new vscode.WorkspaceEdit()
    for (const col of this.columns) {
      const text = col.document.getText()
      const normalized = normalizeResx(text)
      if (normalized !== text) {
        edit.replace(col.uri, new vscode.Range(col.document.positionAt(0), col.document.positionAt(text.length)), normalized)
      }
    }
    if (edit.size === 0) {
      vscode.window.showInformationMessage('Toolkit: the group is already in canonical format.')
      return
    }
    await vscode.workspace.applyEdit(edit)
  }

  /** Reorder every locale file to match the neutral key order. */
  private async sortToNeutral(): Promise<void> {
    if (this.neutralKeys.length === 0) {
      vscode.window.showInformationMessage('Toolkit: no neutral file to sort against.')
      return
    }
    const edit = new vscode.WorkspaceEdit()
    for (const col of this.columns) {
      if (col.locale === null) {
        continue
      }
      const text = col.document.getText()
      const reordered = reorderToNeutral(text, this.neutralKeys)
      if (reordered !== text) {
        edit.replace(
          col.uri,
          new vscode.Range(col.document.positionAt(0), col.document.positionAt(text.length)),
          reordered
        )
      }
    }
    if (edit.size > 0) {
      await vscode.workspace.applyEdit(edit)
    }
  }

  private async saveAll(): Promise<void> {
    for (const col of this.columns) {
      if (col.document.isDirty) {
        await col.document.save()
      }
    }
    this.postGrid()
  }

  private async openSource(colId: string): Promise<void> {
    const col = this.columnById(colId)
    if (col) {
      await vscode.commands.executeCommand('vscode.openWith', col.uri, 'default')
    }
  }

  private html(): string {
    const nonce = crypto.randomBytes(16).toString('hex')
    const csp = [
      `default-src 'none'`,
      `style-src ${this.panel.webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ')
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  .toolbar { position: sticky; top: 0; z-index: 3; display: flex; gap: 8px; align-items: center; padding: 6px 10px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
  .toolbar input[type=search] { flex: 0 1 240px; padding: 3px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
  .toolbar button { padding: 3px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; }
  .toolbar button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
  .toolbar label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; user-select: none; }
  .spacer { flex: 1; }
  .count { opacity: 0.7; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 0; text-align: left; vertical-align: top; }
  thead th { position: sticky; top: 37px; z-index: 2; background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)); padding: 5px 8px; font-weight: 600; }
  th.keycol, td.keycol { position: sticky; left: 0; z-index: 1; background: var(--vscode-editor-background); font-family: var(--vscode-editor-font-family); white-space: nowrap; padding: 5px 8px; }
  thead th.keycol { z-index: 2; }
  td.keycol { display: flex; align-items: center; gap: 6px; }
  td.keycol .kname { flex: 1; }
  .rowacts { display: inline-flex; gap: 2px; opacity: 0; }
  tr:hover .rowacts { opacity: 0.75; }
  .rowacts button { background: transparent; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 0 3px; font-size: 0.95em; border-radius: 2px; }
  .rowacts button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); opacity: 1; }
  .cell { min-height: 1.4em; padding: 4px 8px; outline: none; white-space: pre-wrap; word-break: break-word; }
  .cell:focus { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  td.missing .cell:empty::before { content: '— missing —'; opacity: 0.5; font-style: italic; }
  td.missing { background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #5a4500) 35%, transparent); }
  td.mismatch { box-shadow: inset 3px 0 0 var(--vscode-editorWarning-foreground, #cca700); }
  th .pct { font-weight: normal; margin-left: 6px; font-size: 0.85em; opacity: 0.7; }
  th .pct.low { color: var(--vscode-editorWarning-foreground, #cca700); opacity: 1; }
  th .src { cursor: pointer; opacity: 0.6; margin-left: 6px; }
  th .src:hover { opacity: 1; }
  .dirty::after { content: ' ●'; color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
  .empty { padding: 20px; opacity: 0.7; }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="search" id="filter" placeholder="Filter keys…" />
    <label><input type="checkbox" id="onlyIssues" /> Only missing / mismatched</label>
    <span class="spacer"></span>
    <span class="count" id="count"></span>
    <button class="secondary" id="addKey">Add key</button>
    <button class="secondary" id="sort">Sort to neutral</button>
    <button class="secondary" id="normalize">Normalize</button>
    <button id="save">Save all</button>
  </div>
  <div id="root"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let grid = null;

  function render() {
    if (!grid) return;
    const root = document.getElementById('root');
    const filter = document.getElementById('filter').value.trim().toLowerCase();
    const onlyIssues = document.getElementById('onlyIssues').checked;

    const rows = grid.rows.filter(r => {
      if (filter && !r.key.toLowerCase().includes(filter)) return false;
      if (onlyIssues) {
        const issue = grid.columns.some(c => { const cell = r.cells[c.id]; return cell && (!cell.present || cell.placeholderMismatch); });
        if (!issue) return false;
      }
      return true;
    });

    if (grid.rows.length === 0) {
      root.innerHTML = '<div class="empty">This resource group has no string entries.</div>';
      return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    htr.appendChild(th('Key', 'keycol'));
    for (const col of grid.columns) {
      const h = th('');
      if (col.dirty) h.classList.add('dirty');
      const name = document.createElement('span');
      name.textContent = col.label;
      h.appendChild(name);
      if (col.complete !== null) {
        const pct = document.createElement('span');
        pct.className = 'pct' + (col.complete < 100 ? ' low' : '');
        pct.textContent = col.complete + '%';
        pct.title = col.complete + '% of the neutral keys are translated in this language';
        h.appendChild(pct);
      }
      const src = document.createElement('span');
      src.className = 'src';
      src.title = 'Open the raw .resx file';
      src.textContent = '⤢';
      src.addEventListener('click', () => vscode.postMessage({ type: 'open', colId: col.id }));
      h.appendChild(src);
      htr.appendChild(h);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      const kc = document.createElement('td');
      kc.className = 'keycol';
      const kname = document.createElement('span');
      kname.className = 'kname';
      kname.textContent = r.key;
      const acts = document.createElement('span');
      acts.className = 'rowacts';
      const ren = document.createElement('button');
      ren.textContent = '✎';
      ren.title = 'Rename key in all languages';
      ren.addEventListener('click', () => vscode.postMessage({ type: 'renameKey', key: r.key }));
      const del = document.createElement('button');
      del.textContent = '🗑';
      del.title = 'Delete key from all languages';
      del.addEventListener('click', () => vscode.postMessage({ type: 'deleteKey', key: r.key }));
      acts.append(ren, del);
      kc.append(kname, acts);
      tr.appendChild(kc);
      for (const col of grid.columns) {
        const cell = r.cells[col.id];
        const td = document.createElement('td');
        if (!cell.present) td.classList.add('missing');
        if (cell.placeholderMismatch) td.classList.add('mismatch');
        const div = document.createElement('div');
        div.className = 'cell';
        div.contentEditable = 'true';
        div.spellcheck = false;
        div.textContent = cell.value;
        div.dataset.key = r.key;
        div.dataset.colId = col.id;
        div.dataset.original = cell.value;
        div.addEventListener('blur', onBlur);
        div.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); div.blur(); } });
        td.appendChild(div);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.replaceChildren(table);

    document.getElementById('count').textContent = rows.length + ' / ' + grid.rows.length + ' keys';
  }

  function th(text, cls) { const h = document.createElement('th'); if (cls) h.className = cls; h.textContent = text; return h; }

  function onBlur(e) {
    const div = e.target;
    const value = div.innerText;
    if (value === div.dataset.original) return;
    div.dataset.original = value;
    vscode.postMessage({ type: 'edit', colId: div.dataset.colId, key: div.dataset.key, value });
  }

  document.getElementById('filter').addEventListener('input', render);
  document.getElementById('onlyIssues').addEventListener('change', render);
  document.getElementById('addKey').addEventListener('click', () => vscode.postMessage({ type: 'addKey' }));
  document.getElementById('sort').addEventListener('click', () => vscode.postMessage({ type: 'sort' }));
  document.getElementById('normalize').addEventListener('click', () => vscode.postMessage({ type: 'normalize' }));
  document.getElementById('save').addEventListener('click', () => vscode.postMessage({ type: 'saveAll' }));

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'grid') {
      const active = document.activeElement;
      // Don't yank the grid out from under an in-progress edit.
      if (active && active.classList && active.classList.contains('cell')) return;
      grid = e.data;
      render();
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }
    for (const d of this.disposables) {
      d.dispose()
    }
  }
}

class ResxEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'toolkit.resxEditor'

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const session = new GridSession(document, webviewPanel)
    await session.init()
  }
}

export function registerResxEditor(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(ResxEditorProvider.viewType, new ResxEditorProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }),
    vscode.commands.registerCommand('toolkit.resx.openGrid', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target || !target.fsPath.toLowerCase().endsWith('.resx')) {
        vscode.window.showInformationMessage('Toolkit: open or select a .resx file to view it as a grid.')
        return
      }
      await vscode.commands.executeCommand('vscode.openWith', target, ResxEditorProvider.viewType)
    })
  )
}
