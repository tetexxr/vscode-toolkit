import * as vscode from 'vscode'
import { PdfFieldsPanel } from './pdf-fields-panel'

/**
 * PDF form field inspector. Opens a webview listing a PDF's AcroForm fields
 * (name, type, current value) and lets the user select fields that hold a value
 * and clear them, overwriting the original PDF.
 *
 *  - Inspect PDF Fields (palette): pick a PDF (or use the active one).
 *  - Inspect PDF Fields (explorer context on a .pdf): that file.
 */

function isPdf(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith('.pdf')
}

/** Resolve the PDF to act on: explorer selection, then active tab. */
function resolveTarget(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri | undefined {
  const selected = (uris && uris.length > 0 ? uris : uri ? [uri] : []).filter(isPdf)
  if (selected.length > 0) {
    return selected[0]
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input && typeof input === 'object' && 'uri' in input) {
    const active = (input as { uri: vscode.Uri }).uri
    if (isPdf(active)) {
      return active
    }
  }
  return undefined
}

async function inspect(context: vscode.ExtensionContext, uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
  let target = resolveTarget(uri, uris)
  if (!target) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Inspect',
      filters: { 'PDF documents': ['pdf'] }
    })
    target = picked?.[0]
  }
  if (!target) {
    return
  }
  PdfFieldsPanel.createOrShow(context, target)
}

export function registerPdfFieldCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.pdf.inspectFields', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      inspect(context, uri, uris)
    )
  )
}
