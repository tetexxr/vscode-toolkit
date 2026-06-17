import * as vscode from 'vscode'
import * as crypto from 'node:crypto'
import { formatColor, parseColor, type ColorFormat } from './color-utils'

const VIEW_TYPE = 'toolkit.eyedropper'

function insertFormat(): ColorFormat {
  const value = vscode.workspace.getConfiguration('toolkit.colorPicker').get<string>('insertFormat', 'hex')
  return value === 'rgb' || value === 'hsl' ? value : 'hex'
}

/** Converts the eyedropper's sRGB hex into the configured output format. */
function toOutput(hex: string): string {
  const rgba = parseColor(hex)
  return rgba ? formatColor(rgba, insertFormat()) : hex
}

function buildHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; text-align: center; }
  button {
    font: inherit; padding: 8px 16px; margin-top: 8px; cursor: pointer;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 4px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  p { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <button id="pick">Activate eyedropper</button>
  <p>Click the button, then pick any pixel on your screen.</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const button = document.getElementById('pick');
    async function pick() {
      if (typeof window.EyeDropper === 'undefined') {
        vscode.postMessage({ type: 'unsupported' });
        return;
      }
      try {
        const result = await new window.EyeDropper().open();
        vscode.postMessage({ type: 'picked', color: result.sRGBHex });
      } catch {
        vscode.postMessage({ type: 'cancelled' });
      }
    }
    button.addEventListener('click', pick);
    button.focus();
  </script>
</body>
</html>`
}

async function applyColor(editor: vscode.TextEditor | undefined, color: string): Promise<void> {
  if (!editor) {
    await vscode.env.clipboard.writeText(color)
    vscode.window.showInformationMessage(`Toolkit: ${color} copied to the clipboard.`)
    return
  }
  await editor.edit(builder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        builder.insert(selection.active, color)
      } else {
        builder.replace(selection, color)
      }
    }
  })
  await vscode.window.showTextDocument(editor.document, editor.viewColumn)
}

function pickFromScreen(context: vscode.ExtensionContext): void {
  // Capture the editor now — opening the webview takes focus away from it.
  const targetEditor = vscode.window.activeTextEditor
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Pick Color from Screen',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true }
  )
  const nonce = crypto.randomBytes(16).toString('base64')
  panel.webview.html = buildHtml(nonce)

  const subscription = panel.webview.onDidReceiveMessage(async (message: { type: string; color?: string }) => {
    if (message.type === 'picked' && message.color) {
      await applyColor(targetEditor, toOutput(message.color))
    } else if (message.type === 'unsupported') {
      vscode.window.showWarningMessage('Toolkit: the screen eyedropper is not available in this VS Code build.')
    }
    panel.dispose()
  })
  context.subscriptions.push(subscription)
  panel.onDidDispose(() => {
    subscription.dispose()
  })
}

export function registerEyedropperCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.colorPicker.pickFromScreen', () => pickFromScreen(context))
  )
}
