import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import * as path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { JsonEvalResult } from './json-playground-utils'
import { cssColor } from '../../utils/palette'

const STORAGE_KEY = 'toolkit.jsonPlayground.state.v1'

interface PlaygroundState {
  json: string
  query: string
}

const DEFAULT_STATE: PlaygroundState = { json: '', query: '' }

let currentPanel: vscode.WebviewPanel | null = null

function readState(context: vscode.ExtensionContext): PlaygroundState {
  const stored = context.globalState.get<Partial<PlaygroundState>>(STORAGE_KEY, {})
  return {
    json: typeof stored.json === 'string' ? stored.json : DEFAULT_STATE.json,
    query: typeof stored.query === 'string' ? stored.query : DEFAULT_STATE.query
  }
}

function writeState(context: vscode.ExtensionContext, state: PlaygroundState): Thenable<void> {
  return context.globalState.update(STORAGE_KEY, state)
}

interface UpdateMessage {
  type: 'update'
  json: string
  query: string
}

const EVAL_TIMEOUT_MS = 1500
const TIMEOUT_RESULT: JsonEvalResult = {
  error: `Query timed out after ${EVAL_TIMEOUT_MS}ms — possible infinite loop.`,
  output: '',
  type: '',
  count: null,
  empty: false
}

/**
 * Runs evaluations in a persistent worker thread. If a query exceeds its budget
 * (infinite loop), the worker is terminated and recreated lazily; the extension
 * host never blocks.
 */
class JsonEvaluator {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (result: JsonEvalResult) => void; timer: NodeJS.Timeout }>()

  evaluate(request: Omit<UpdateMessage, 'type'>): Promise<JsonEvalResult> {
    const id = this.nextId++
    return new Promise(resolve => {
      const timer = setTimeout(() => this.onTimeout(id), EVAL_TIMEOUT_MS)
      this.pending.set(id, { resolve, timer })
      this.ensureWorker().postMessage({ id, ...request })
    })
  }

  dispose(): void {
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer)
    }
    this.pending.clear()
    void this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }
    const worker = new Worker(path.join(__dirname, 'json-worker.js'))
    worker.on('message', (msg: JsonEvalResult & { id: number }) => {
      const entry = this.pending.get(msg.id)
      if (!entry) {
        return
      }
      clearTimeout(entry.timer)
      this.pending.delete(msg.id)
      entry.resolve(msg)
    })
    worker.on('error', (err: Error) => {
      if (this.worker === worker) {
        this.worker = null
      }
      this.settleAll({ error: `Evaluation failed: ${err.message}`, output: '', type: '', count: null, empty: false })
    })
    worker.on('exit', () => {
      if (this.worker === worker) {
        this.worker = null
      }
    })
    this.worker = worker
    return worker
  }

  /** A stuck evaluation also blocks everything queued behind it: settle all. */
  private onTimeout(id: number): void {
    if (!this.pending.has(id)) {
      return
    }
    void this.worker?.terminate()
    this.worker = null
    this.settleAll(TIMEOUT_RESULT)
  }

  private settleAll(result: JsonEvalResult): void {
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer)
      resolve(result)
    }
    this.pending.clear()
  }
}

const evaluator = new JsonEvaluator()
let updateSeq = 0

async function handleUpdate(panel: vscode.WebviewPanel, msg: UpdateMessage): Promise<void> {
  const seq = ++updateSeq
  const result = await evaluator.evaluate({ json: msg.json, query: msg.query })
  if (seq !== updateSeq || panel !== currentPanel) {
    return // a newer evaluation is in flight, or the panel is gone
  }
  // Nested under `payload` so the message discriminator `type` doesn't clash
  // with the result's own `type` field (the JSON value kind).
  void panel.webview.postMessage({ type: 'result', payload: result })
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
  .hint { font-size: 11px; opacity: 0.6; margin: 0 0 6px 0; }
  textarea {
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
    resize: vertical;
  }
  textarea:focus { border-color: var(--vscode-focusBorder); }
  #json { min-height: 160px; }
  #query { min-height: 52px; }
  .status { font-size: 12px; opacity: 0.7; margin-top: 4px; }
  .error {
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground, transparent);
    border-left: 3px solid var(--vscode-errorForeground);
    padding: 4px 8px;
    margin-top: 6px;
    font-family: var(--vscode-editor-font-family, monospace);
    white-space: pre-wrap;
  }
  pre.result {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 6px 0 0 0;
    padding: 8px;
    background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    border: 1px solid ${cssColor.border};
    border-radius: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    max-height: 50vh;
    overflow: auto;
  }
</style>
</head>
<body>
  <div class="section">
    <h3>JSON</h3>
    <textarea id="json" placeholder="Paste or load JSON here..." spellcheck="false"></textarea>
  </div>

  <div class="section">
    <h3>Query</h3>
    <p class="hint">JavaScript expression — <code>$</code> (or <code>data</code>) is your parsed JSON. e.g. <code>$.users.filter(u =&gt; u.active).map(u =&gt; u.email)</code></p>
    <textarea id="query" placeholder="$" spellcheck="false"></textarea>
    <div id="status" class="status">Paste some JSON to begin</div>
    <div id="error" class="error" style="display:none"></div>
  </div>

  <div class="section">
    <h3>Result</h3>
    <pre id="result" class="result"></pre>
  </div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi()
  const $ = id => document.getElementById(id)
  let timer = null

  function payload() {
    return { type: 'update', json: $('json').value, query: $('query').value }
  }

  function send() {
    vscode.postMessage(payload())
    vscode.setState(payload())
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(send, 150)
  }

  function renderResult(msg) {
    if (msg.error) {
      $('error').style.display = ''
      $('error').textContent = msg.error
      $('status').textContent = 'Error'
      $('result').textContent = ''
      return
    }
    $('error').style.display = 'none'
    if (msg.empty) {
      $('status').textContent = 'Paste some JSON to begin'
      $('result').textContent = ''
      return
    }
    let label = msg.type
    if (msg.count !== null && msg.count !== undefined) {
      const unit = msg.type === 'array' ? 'item' : 'key'
      label += ' · ' + msg.count + ' ' + unit + (msg.count === 1 ? '' : 's')
    }
    $('status').textContent = label
    $('result').textContent = msg.output || ''
  }

  function applyInitial(state) {
    $('json').value = state.json || ''
    $('query').value = state.query || ''
  }

  // Allow Tab to indent inside the query box instead of moving focus.
  $('query').addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.target
      const start = el.selectionStart, end = el.selectionEnd
      el.value = el.value.slice(0, start) + '  ' + el.value.slice(end)
      el.selectionStart = el.selectionEnd = start + 2
      schedule()
    }
  })

  function attach() {
    ['json', 'query'].forEach(id => $(id).addEventListener('input', schedule))
  }

  window.addEventListener('message', e => {
    const m = e.data
    if (m.type === 'init') {
      applyInitial(m.state)
      send()
    } else if (m.type === 'result') {
      renderResult(m.payload)
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
  const panel = vscode.window.createWebviewPanel('toolkit.jsonPlayground', 'JSON Playground', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const nonce = randomBytes(16).toString('hex')
  panel.webview.html = buildHtml(panel.webview, nonce)
  currentPanel = panel

  panel.onDidDispose(() => {
    if (currentPanel === panel) {
      currentPanel = null
      evaluator.dispose() // recreated lazily if the playground is reopened
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
      await writeState(context, { json: msg.json, query: msg.query })
      void handleUpdate(panel, msg)
    }
  })

  return panel
}

function ensurePanel(context: vscode.ExtensionContext, override?: Partial<PlaygroundState>): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active)
    if (override) {
      const merged = { ...readState(context), ...override }
      void writeState(context, merged).then(() => {
        currentPanel?.webview.postMessage({ type: 'init', state: merged })
      })
    }
    return currentPanel
  }
  return createPanel(context, override)
}

/** Selection if there is one, otherwise the whole active document. */
function activeJsonText(): string {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return ''
  }
  return editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection)
}

export function registerJsonPlaygroundCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    { dispose: () => evaluator.dispose() },
    vscode.commands.registerCommand('toolkit.jsonPlayground.open', () => {
      ensurePanel(context)
    }),
    vscode.commands.registerCommand('toolkit.jsonPlayground.loadSelection', () => {
      ensurePanel(context, { json: activeJsonText() })
    })
  )
}
