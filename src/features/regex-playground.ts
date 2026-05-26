import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import {
  applyReplace,
  compileRegex,
  findAllMatches,
  highlightMatches,
  type MatchInfo
} from './regex-playground-utils'

const STORAGE_KEY = 'toolkit.regexPlayground.state.v1'

interface PlaygroundState {
  pattern: string
  flags: string
  input: string
  replace: string
}

const DEFAULT_STATE: PlaygroundState = {
  pattern: '',
  flags: 'g',
  input: '',
  replace: ''
}

let currentPanel: vscode.WebviewPanel | null = null

function readState(context: vscode.ExtensionContext): PlaygroundState {
  const stored = context.globalState.get<Partial<PlaygroundState>>(STORAGE_KEY, {})
  return {
    pattern: typeof stored.pattern === 'string' ? stored.pattern : DEFAULT_STATE.pattern,
    flags: typeof stored.flags === 'string' ? stored.flags : DEFAULT_STATE.flags,
    input: typeof stored.input === 'string' ? stored.input : DEFAULT_STATE.input,
    replace: typeof stored.replace === 'string' ? stored.replace : DEFAULT_STATE.replace
  }
}

function writeState(context: vscode.ExtensionContext, state: PlaygroundState): Thenable<void> {
  return context.globalState.update(STORAGE_KEY, state)
}

interface UpdateMessage {
  type: 'update'
  pattern: string
  flags: string
  input: string
  replace: string
}

function handleUpdate(panel: vscode.WebviewPanel, msg: UpdateMessage): void {
  const { pattern, flags, input, replace } = msg
  if (pattern.length === 0) {
    void panel.webview.postMessage({
      type: 'result',
      error: null,
      matches: [],
      highlightedHtml: highlightMatches(input, []),
      replaceResult: input,
      empty: true
    })
    return
  }
  const compiled = compileRegex(pattern, flags)
  if (!compiled.ok) {
    void panel.webview.postMessage({
      type: 'result',
      error: compiled.error,
      matches: [],
      highlightedHtml: '',
      replaceResult: '',
      empty: false
    })
    return
  }
  const matches = findAllMatches(compiled.re, input)
  const highlightedHtml = highlightMatches(input, matches)
  let replaceResult = ''
  try {
    // Fresh RegExp because exec/matchAll above advances lastIndex on global regexes
    const reFresh = compileRegex(pattern, flags) as { ok: true; re: RegExp }
    replaceResult = applyReplace(reFresh.re, input, replace)
  } catch (error) {
    replaceResult = `Replace failed: ${(error as Error).message}`
  }
  const lite: Array<Omit<MatchInfo, 'namedGroups'> & { namedGroups: Record<string, string> }> = matches.map(
    m => ({ ...m })
  )
  void panel.webview.postMessage({
    type: 'result',
    error: null,
    matches: lite,
    highlightedHtml,
    replaceResult,
    empty: false
  })
}

function buildHtml(webview: vscode.Webview, nonce: string): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`
  ].join('; ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 16px;
    line-height: 1.4;
  }
  h3 {
    margin: 0 0 6px 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.75;
  }
  .section { margin-bottom: 18px; }
  .row { display: flex; align-items: center; gap: 8px; }
  input[type="text"], textarea {
    flex: 1;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 8px;
    border-radius: 2px;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  input[type="text"]:focus, textarea:focus {
    border-color: var(--vscode-focusBorder);
  }
  textarea { min-height: 140px; resize: vertical; }
  .flags { display: flex; gap: 4px; }
  .flag {
    cursor: pointer;
    user-select: none;
    padding: 4px 8px;
    border-radius: 2px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    min-width: 22px;
    text-align: center;
  }
  .flag:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }
  .flag.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .flag.active:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .status { font-size: 12px; opacity: 0.7; margin-top: 4px; }
  .error {
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground, transparent);
    border-left: 3px solid var(--vscode-errorForeground);
    padding: 4px 8px;
    margin-top: 6px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  pre.highlight, pre.replaced {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 6px 0 0 0;
    padding: 8px;
    background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
  }
  mark.match {
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
  mark.match.m-0 {
    background: var(--vscode-editor-findMatchHighlightBackground);
  }
  mark.match.m-1 {
    background: var(--vscode-editor-selectionHighlightBackground);
  }
  .groups {
    margin-top: 4px;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 2px;
  }
  .match-card {
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  .match-card:last-child { border-bottom: none; }
  .match-card .head { opacity: 0.7; margin-bottom: 4px; }
  .match-card .group { padding-left: 12px; }
  .pattern-input { font-family: var(--vscode-editor-font-family, monospace); }
</style>
</head>
<body>
  <div class="section">
    <h3>Pattern</h3>
    <div class="row">
      <input id="pattern" type="text" class="pattern-input" placeholder="\\\\d+" autocomplete="off" spellcheck="false">
      <div class="flags" id="flags">
        <button type="button" class="flag" data-flag="g" title="global — match every occurrence, not just the first">g</button>
        <button type="button" class="flag" data-flag="i" title="case-insensitive — ignore upper/lower case">i</button>
        <button type="button" class="flag" data-flag="m" title="multiline — ^ and $ match start/end of each line">m</button>
        <button type="button" class="flag" data-flag="s" title="dotAll — . also matches newline characters">s</button>
        <button type="button" class="flag" data-flag="u" title="unicode — proper handling of code points ≥ U+10000 and \\p{...}">u</button>
        <button type="button" class="flag" data-flag="y" title="sticky — match must start exactly at lastIndex">y</button>
      </div>
    </div>
    <div id="status" class="status">No pattern</div>
    <div id="error" class="error" style="display:none"></div>
  </div>

  <div class="section">
    <h3>Test input</h3>
    <textarea id="input" placeholder="Paste or type text to test..." spellcheck="false"></textarea>
    <pre id="highlight" class="highlight"></pre>
  </div>

  <div class="section">
    <h3>Matches</h3>
    <div id="groups" class="groups"></div>
  </div>

  <div class="section">
    <h3>Replace</h3>
    <input id="replace" type="text" class="pattern-input" placeholder="$1 - $2" autocomplete="off" spellcheck="false">
    <pre id="replaceResult" class="replaced"></pre>
  </div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi()
  const $ = id => document.getElementById(id)
  const FLAG_KEYS = ['g', 'i', 'm', 's', 'u', 'y']
  let timer = null

  function getFlags() {
    let s = ''
    for (const k of FLAG_KEYS) {
      const btn = document.querySelector('.flag[data-flag="' + k + '"]')
      if (btn && btn.classList.contains('active')) s += k
    }
    return s
  }

  function setFlags(flags) {
    for (const k of FLAG_KEYS) {
      const btn = document.querySelector('.flag[data-flag="' + k + '"]')
      if (btn) btn.classList.toggle('active', (flags || '').includes(k))
    }
  }

  function payload() {
    return {
      type: 'update',
      pattern: $('pattern').value,
      flags: getFlags(),
      input: $('input').value,
      replace: $('replace').value
    }
  }

  function send() {
    vscode.postMessage(payload())
    vscode.setState(payload())
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(send, 120)
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function renderResult(msg) {
    if (msg.error) {
      $('error').style.display = ''
      $('error').textContent = msg.error
      $('status').textContent = 'Invalid pattern'
      $('highlight').textContent = $('input').value
      $('groups').innerHTML = ''
      $('replaceResult').textContent = ''
      return
    }
    $('error').style.display = 'none'
    if (msg.empty) {
      $('status').textContent = 'No pattern'
      $('highlight').textContent = $('input').value
      $('groups').innerHTML = ''
      $('replaceResult').textContent = ''
      return
    }
    const n = msg.matches.length
    $('status').textContent = n === 1 ? '1 match' : n + ' matches'
    $('highlight').innerHTML = msg.highlightedHtml || ''
    $('replaceResult').textContent = msg.replaceResult || ''
    let html = ''
    for (let i = 0; i < msg.matches.length; i++) {
      const m = msg.matches[i]
      html += '<div class="match-card">'
      html += '<div class="head">Match ' + (i + 1) + ': index ' + m.index + '–' + m.end + '</div>'
      html += '<div>"' + escapeHtml(m.full) + '"</div>'
      for (let g = 0; g < m.groups.length; g++) {
        html += '<div class="group">$' + (g + 1) + ' = "' + escapeHtml(m.groups[g] || '') + '"</div>'
      }
      const named = Object.keys(m.namedGroups || {})
      for (const name of named) {
        html += '<div class="group">' + escapeHtml(name) + ' = "' + escapeHtml(m.namedGroups[name] || '') + '"</div>'
      }
      html += '</div>'
    }
    $('groups').innerHTML = html
  }

  function applyInitial(state) {
    $('pattern').value = state.pattern || ''
    $('input').value = state.input || ''
    $('replace').value = state.replace || ''
    setFlags(state.flags == null ? 'g' : state.flags)
  }

  function attach() {
    ['pattern', 'input', 'replace'].forEach(id => $(id).addEventListener('input', schedule))
    document.querySelectorAll('.flag').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active')
        schedule()
      })
    })
  }

  window.addEventListener('message', e => {
    const m = e.data
    if (m.type === 'init') {
      applyInitial(m.state)
      send()
    } else if (m.type === 'result') {
      renderResult(m)
    }
  })

  attach()
  vscode.postMessage({ type: 'ready' })
})()
</script>
</body>
</html>`
}

function createPanel(context: vscode.ExtensionContext, override?: Partial<PlaygroundState>): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'toolkit.regexPlayground',
    'Regex Playground',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  )
  const nonce = randomBytes(16).toString('hex')
  panel.webview.html = buildHtml(panel.webview, nonce)
  currentPanel = panel

  panel.onDidDispose(() => {
    if (currentPanel === panel) {
      currentPanel = null
    }
  })

  type IncomingMessage = { type: 'ready' } | UpdateMessage
  panel.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
    if (msg.type === 'ready') {
      const state = { ...readState(context), ...(override ?? {}) }
      void panel.webview.postMessage({ type: 'init', state })
      return
    }
    if (msg.type === 'update') {
      await writeState(context, {
        pattern: msg.pattern,
        flags: msg.flags,
        input: msg.input,
        replace: msg.replace
      })
      handleUpdate(panel, msg)
    }
  })

  return panel
}

function ensurePanel(context: vscode.ExtensionContext, override?: Partial<PlaygroundState>): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active)
    if (override) {
      // Persist override and re-send init so the panel reflects the new selection.
      const merged = { ...readState(context), ...override }
      void writeState(context, merged).then(() => {
        currentPanel?.webview.postMessage({ type: 'init', state: merged })
      })
    }
    return currentPanel
  }
  return createPanel(context, override)
}

export function registerRegexPlaygroundCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.regexPlayground.open', () => {
      ensurePanel(context)
    }),
    vscode.commands.registerCommand('toolkit.regexPlayground.testSelectionAsRegex', () => {
      const editor = vscode.window.activeTextEditor
      const text = editor?.document.getText(editor.selection) ?? ''
      ensurePanel(context, { pattern: text })
    }),
    vscode.commands.registerCommand('toolkit.regexPlayground.testSelectionAsInput', () => {
      const editor = vscode.window.activeTextEditor
      const text = editor?.document.getText(editor.selection) ?? ''
      ensurePanel(context, { input: text })
    })
  )
}
