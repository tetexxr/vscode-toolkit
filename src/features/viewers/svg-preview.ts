import * as vscode from 'vscode'
import * as path from 'node:path'
import { createNonce, escapeHtml } from '../../utils/html'

/**
 * SVG Preview — renders the active .svg file in a side panel with live
 * refresh, zoom, and a cycling background (checkerboard / light / dark).
 *
 * Security: the SVG is rendered through an <img> with a data: URI. Browsers
 * never execute scripts or load external resources for image-rendered SVGs,
 * so a malicious file cannot run code in the webview.
 */

const panels = new Map<string, vscode.WebviewPanel>()
const DEBOUNCE_MS = 300

function toDataUri(svgText: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svgText, 'utf8').toString('base64')}`
}

async function readSvg(uri: vscode.Uri): Promise<string | null> {
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
  if (open) {
    return open.getText()
  }
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
  } catch {
    return null
  }
}

async function openPreview(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri
  if (!target || !target.fsPath.toLowerCase().endsWith('.svg')) {
    vscode.window.showInformationMessage('Toolkit: open or select an .svg file first.')
    return
  }

  const key = target.toString()
  const existing = panels.get(key)
  if (existing) {
    existing.reveal(undefined, true)
    return
  }

  const svgText = await readSvg(target)
  if (svgText === null) {
    vscode.window.showWarningMessage('Toolkit: could not read the SVG file.')
    return
  }

  const fileName = path.basename(target.fsPath)
  const panel = vscode.window.createWebviewPanel(
    'toolkit.svgPreview',
    `Preview: ${fileName}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  )
  panels.set(key, panel)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.toString() !== key) {
      return
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      void panel.webview.postMessage({ type: 'update', dataUri: toDataUri(event.document.getText()) })
    }, DEBOUNCE_MS)
  })

  panel.onDidDispose(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    changeListener.dispose()
    panels.delete(key)
  })
  context.subscriptions.push(panel)

  panel.webview.html = buildHtml(fileName, toDataUri(svgText))
}

function buildHtml(fileName: string, dataUri: string): string {
  const nonce = createNonce()
  const csp = [
    "default-src 'none'",
    `img-src data:`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`
  ].join('; ')
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    flex-direction: column;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    flex: 0 0 auto;
  }
  .toolbar button {
    font-family: inherit;
    font-size: 12px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.4));
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
  .toolbar .dims { margin-left: auto; font-size: 12px; opacity: 0.7; }
  .stage {
    flex: 1 1 auto;
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .stage.bg-checker {
    background-image:
      linear-gradient(45deg, rgba(128,128,128,0.25) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.25) 75%),
      linear-gradient(45deg, rgba(128,128,128,0.25) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.25) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 10px 10px;
  }
  .stage.bg-light { background: #ffffff; }
  .stage.bg-dark { background: #1e1e1e; }
  img { display: block; image-rendering: auto; }
  .error { color: var(--vscode-errorForeground); padding: 16px; }
</style>
</head>
<body>
  <div class="toolbar">
    <button id="zoomOut" title="Zoom out">−</button>
    <button id="zoomReset" title="Reset zoom">100%</button>
    <button id="zoomIn" title="Zoom in">+</button>
    <button id="bg" title="Cycle background">Background</button>
    <span class="dims" id="dims"></span>
  </div>
  <div class="stage bg-checker" id="stage">
    <img id="svg" alt="${escapeHtml(fileName)}" src="${dataUri}">
    <div id="error" class="error" hidden>The file is not a valid SVG image.</div>
  </div>
  <script nonce="${nonce}">
    (function () {
      const img = document.getElementById('svg')
      const stage = document.getElementById('stage')
      const dims = document.getElementById('dims')
      const error = document.getElementById('error')
      const zoomLabel = document.getElementById('zoomReset')
      const BACKGROUNDS = ['bg-checker', 'bg-light', 'bg-dark']
      let bgIndex = 0
      let zoom = 1

      function apply() {
        const w = img.naturalWidth || 0
        const h = img.naturalHeight || 0
        if (w > 0) {
          img.style.width = (w * zoom) + 'px'
          img.style.height = (h * zoom) + 'px'
        }
        zoomLabel.textContent = Math.round(zoom * 100) + '%'
        dims.textContent = w > 0 ? w + ' × ' + h : ''
      }

      img.addEventListener('load', () => {
        img.hidden = false
        error.hidden = true
        apply()
      })
      img.addEventListener('error', () => {
        img.hidden = true
        error.hidden = false
        dims.textContent = ''
      })

      document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(zoom * 1.25, 32); apply() })
      document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(zoom / 1.25, 0.05); apply() })
      zoomLabel.addEventListener('click', () => { zoom = 1; apply() })
      document.getElementById('bg').addEventListener('click', () => {
        stage.classList.remove(BACKGROUNDS[bgIndex])
        bgIndex = (bgIndex + 1) % BACKGROUNDS.length
        stage.classList.add(BACKGROUNDS[bgIndex])
      })
      stage.addEventListener('wheel', e => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        zoom = e.deltaY < 0 ? Math.min(zoom * 1.1, 32) : Math.max(zoom / 1.1, 0.05)
        apply()
      }, { passive: false })

      window.addEventListener('message', e => {
        const msg = e.data
        if (msg && msg.type === 'update' && typeof msg.dataUri === 'string' && msg.dataUri.startsWith('data:image/svg+xml;base64,')) {
          img.src = msg.dataUri
        }
      })
    })()
  </script>
</body>
</html>`
}

export function registerSvgPreviewCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.svgPreview.open', (uri?: vscode.Uri) => openPreview(context, uri))
  )
}
