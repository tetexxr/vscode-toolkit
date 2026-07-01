import * as vscode from 'vscode'
import { DocxBookmarksPanel } from './docx-bookmarks-panel'

/**
 * Word bookmark checker for .docx templates.
 *
 * .docx files are binary (a ZIP), so this feature is command-driven and shows
 * its results in a webview panel: it reads the bytes, inspects the bookmark
 * XML, and reports defects (chiefly a placeholder split across runs, which
 * breaks the "replace the first run" export logic) with a per-row Fix action.
 *
 *  - Check Word Bookmarks (palette): scans every .docx in the workspace.
 *  - Check / Fix Bookmarks (explorer context on a .docx): the selected file(s);
 *    Fix opens the panel and offers to consolidate the split bookmarks at once.
 */

function isDocx(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith('.docx')
}

/** Resolve the .docx files a command should act on: explorer selection, then active tab. */
function resolveTargets(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  const selected = (uris && uris.length > 0 ? uris : uri ? [uri] : []).filter(isDocx)
  if (selected.length > 0) {
    return selected
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input && typeof input === 'object' && 'uri' in input) {
    const active = (input as { uri: vscode.Uri }).uri
    if (isDocx(active)) {
      return [active]
    }
  }
  return []
}

export function registerDocxBookmarkCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.docx.checkWorkspace', () => DocxBookmarksPanel.createOrShow(context)),
    vscode.commands.registerCommand('toolkit.docx.checkFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      DocxBookmarksPanel.createOrShow(context, resolveTargets(uri, uris))
    ),
    vscode.commands.registerCommand('toolkit.docx.fixFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      DocxBookmarksPanel.createOrShow(context, resolveTargets(uri, uris), true)
    )
  )
}
