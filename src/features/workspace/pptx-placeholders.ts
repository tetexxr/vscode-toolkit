import * as vscode from 'vscode'
import { PptxPlaceholdersPanel } from './pptx-placeholders-panel'

/**
 * `{{Placeholder}}` checker for .pptx templates.
 *
 * .pptx files are binary (a ZIP), so this feature is command-driven and shows
 * its results in a webview panel: it reads the bytes, inspects the DrawingML
 * text, and reports the placeholders it finds — chiefly one stored across
 * several runs, which a run-by-run exporter would only half fill — with a
 * per-row Fix action.
 *
 *  - Check PowerPoint Placeholders (palette): scans every .pptx in the workspace.
 *  - Check / Fix Placeholders (explorer context on a .pptx): the selected
 *    file(s); Fix opens the panel and offers to consolidate the split ones.
 */

function isPptx(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith('.pptx')
}

/** Resolve the .pptx files a command should act on: explorer selection, then active tab. */
function resolveTargets(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  const selected = (uris && uris.length > 0 ? uris : uri ? [uri] : []).filter(isPptx)
  if (selected.length > 0) {
    return selected
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input && typeof input === 'object' && 'uri' in input) {
    const active = (input as { uri: vscode.Uri }).uri
    if (isPptx(active)) {
      return [active]
    }
  }
  return []
}

export function registerPptxPlaceholderCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.pptx.checkWorkspace', () => PptxPlaceholdersPanel.createOrShow(context)),
    vscode.commands.registerCommand('toolkit.pptx.checkFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      PptxPlaceholdersPanel.createOrShow(context, resolveTargets(uri, uris))
    ),
    vscode.commands.registerCommand('toolkit.pptx.fixFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      PptxPlaceholdersPanel.createOrShow(context, resolveTargets(uri, uris), true)
    )
  )
}
