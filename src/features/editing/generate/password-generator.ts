import * as vscode from 'vscode'
import { randomBytes, randomInt } from 'node:crypto'
import {
  estimateStrength,
  generatePassword,
  type PasswordOptions
} from './password-utils'
import { markClipboardSecret } from '../../workspace/clipboard-history'
import { color } from '../../../utils/palette'

const STORAGE_KEY = 'passwordGenerator.options'
const MIN_LENGTH = 4
const MAX_LENGTH = 128

const DEFAULT_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  excludeChars: '',
  requireEachClass: true
}

let currentPanel: vscode.WebviewPanel | null = null
let lastPassword = ''
// The most recent real editor, tracked so Insert works even though the webview
// holds focus (which makes window.activeTextEditor undefined).
let lastEditor: vscode.TextEditor | undefined

function normalizeOptions(raw: Partial<PasswordOptions> | undefined): PasswordOptions {
  const o = { ...DEFAULT_OPTIONS, ...(raw ?? {}) }
  o.length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(o.length)))
  // At least one class must be on, or there's nothing to generate from.
  if (!o.lowercase && !o.uppercase && !o.digits && !o.symbols) {
    o.lowercase = true
  }
  o.excludeChars = String(o.excludeChars ?? '')
  return o
}

function generate(options: PasswordOptions): { password: string; entropyBits: number; label: string; score: number } {
  const result = generatePassword(options, max => randomInt(max))
  const strength = estimateStrength(result.entropyBits)
  lastPassword = result.password
  return { password: result.password, entropyBits: result.entropyBits, label: strength.label, score: strength.score }
}

async function copyPassword(): Promise<void> {
  if (!lastPassword) {
    return
  }
  await vscode.env.clipboard.writeText(lastPassword)
  // Keep the password out of the toolkit's own clipboard history.
  markClipboardSecret(lastPassword)
  vscode.window.showInformationMessage('Toolkit: password copied to the clipboard.')
}

async function insertPassword(): Promise<void> {
  if (!lastPassword) {
    return
  }
  const editor = lastEditor
  if (!editor) {
    await copyPassword()
    return
  }
  await editor.edit(builder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        builder.insert(selection.active, lastPassword)
      } else {
        builder.replace(selection, lastPassword)
      }
    }
  })
  await vscode.window.showTextDocument(editor.document, editor.viewColumn)
}

function buildHtml(nonce: string): string {
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`
  ].join('; ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; max-width: 640px; }
  .password {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 1.3em; word-break: break-all;
    padding: 10px 12px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px; background: var(--vscode-input-background); min-height: 1.4em;
  }
  .row { display: flex; align-items: center; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .classes label { margin-right: 14px; white-space: nowrap; }
  input[type="range"] { flex: 1; }
  input[type="text"], input[type="number"] {
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 3px; padding: 3px 6px;
  }
  button {
    font: inherit; padding: 6px 14px; cursor: pointer; border: none; border-radius: 4px;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .meter { display: flex; gap: 4px; margin: 6px 0; }
  .seg { height: 6px; flex: 1; border-radius: 3px; background: var(--vscode-panel-border); }
  .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
</style>
</head>
<body>
  <div class="password" id="password">&nbsp;</div>
  <div class="meter" id="meter"><span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span></div>
  <div class="meta"><span id="strength"></span> · <span id="entropy"></span> bits of entropy</div>

  <div class="row">
    <label for="length">Length: <span id="lengthValue"></span></label>
    <input type="range" id="length" min="${MIN_LENGTH}" max="${MAX_LENGTH}" />
  </div>
  <div class="row classes">
    <label><input type="checkbox" id="lowercase"> a-z</label>
    <label><input type="checkbox" id="uppercase"> A-Z</label>
    <label><input type="checkbox" id="digits"> 0-9</label>
    <label><input type="checkbox" id="symbols"> !@#$</label>
  </div>
  <div class="row classes">
    <label><input type="checkbox" id="excludeAmbiguous"> Exclude look-alikes (I l 1 O 0 o |)</label>
    <label><input type="checkbox" id="requireEachClass"> Require each class</label>
  </div>
  <div class="row">
    <label for="excludeChars">Exclude characters:</label>
    <input type="text" id="excludeChars" placeholder="e.g. {}[]" />
  </div>
  <div class="row">
    <button id="regenerate">↻ Regenerate</button>
    <button id="copy" class="secondary">Copy</button>
    <button id="insert" class="secondary">Insert at cursor</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const ids = ['length','lowercase','uppercase','digits','symbols','excludeAmbiguous','requireEachClass','excludeChars']
    const el = id => document.getElementById(id)
    const colors = ['${color.error}','${color.orange}','${color.warning}','${color.success}','${color.accent}']

    function readOptions() {
      return {
        length: Number(el('length').value),
        lowercase: el('lowercase').checked,
        uppercase: el('uppercase').checked,
        digits: el('digits').checked,
        symbols: el('symbols').checked,
        excludeAmbiguous: el('excludeAmbiguous').checked,
        requireEachClass: el('requireEachClass').checked,
        excludeChars: el('excludeChars').value
      }
    }
    function applyOptions(o) {
      el('length').value = o.length
      el('lengthValue').textContent = o.length
      el('lowercase').checked = o.lowercase
      el('uppercase').checked = o.uppercase
      el('digits').checked = o.digits
      el('symbols').checked = o.symbols
      el('excludeAmbiguous').checked = o.excludeAmbiguous
      el('requireEachClass').checked = o.requireEachClass
      el('excludeChars').value = o.excludeChars
    }
    function generate() {
      el('lengthValue').textContent = el('length').value
      vscode.postMessage({ type: 'generate', options: readOptions() })
    }

    for (const id of ids) {
      const ev = (id === 'length' || id === 'excludeChars') ? 'input' : 'change'
      el(id).addEventListener(ev, generate)
    }
    el('regenerate').addEventListener('click', generate)
    el('copy').addEventListener('click', () => vscode.postMessage({ type: 'copy' }))
    el('insert').addEventListener('click', () => vscode.postMessage({ type: 'insert' }))

    window.addEventListener('message', e => {
      const msg = e.data
      if (msg.type === 'init') {
        applyOptions(msg.options)
        generate()
      } else if (msg.type === 'result') {
        el('password').textContent = msg.password || '—'
        el('entropy').textContent = msg.entropyBits
        el('strength').textContent = msg.label
        const segs = document.querySelectorAll('.seg')
        segs.forEach((s, i) => { s.style.background = i <= msg.score ? colors[msg.score] : 'var(--vscode-panel-border)' })
      }
    })
    vscode.postMessage({ type: 'ready' })
  </script>
</body>
</html>`
}

function createPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel('toolkit.passwordGenerator', 'Password Generator', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const nonce = randomBytes(16).toString('hex')
  panel.webview.html = buildHtml(nonce)
  currentPanel = panel

  panel.onDidDispose(() => {
    if (currentPanel === panel) {
      currentPanel = null
      lastPassword = ''
    }
  })

  type Incoming =
    | { type: 'ready' }
    | { type: 'generate'; options: Partial<PasswordOptions> }
    | { type: 'copy' }
    | { type: 'insert' }
  panel.webview.onDidReceiveMessage(async (msg: Incoming) => {
    if (msg.type === 'ready') {
      const options = normalizeOptions(context.globalState.get<Partial<PasswordOptions>>(STORAGE_KEY))
      void panel.webview.postMessage({ type: 'init', options })
    } else if (msg.type === 'generate') {
      const options = normalizeOptions(msg.options)
      await context.globalState.update(STORAGE_KEY, options)
      void panel.webview.postMessage({ type: 'result', ...generate(options) })
    } else if (msg.type === 'copy') {
      await copyPassword()
    } else if (msg.type === 'insert') {
      await insertPassword()
    }
  })

  return panel
}

export function registerPasswordGeneratorCommands(context: vscode.ExtensionContext): void {
  lastEditor = vscode.window.activeTextEditor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        lastEditor = editor
      }
    }),
    vscode.commands.registerCommand('toolkit.passwordGenerator.open', () => {
      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Active)
      } else {
        createPanel(context)
      }
    })
  )
}
