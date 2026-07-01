/**
 * WebviewPanel for the Word Bookmarks checker. Singleton — reveals and
 * re-targets the existing panel instead of opening a second one.
 */

import * as vscode from 'vscode'
import { createNonce } from '../../utils/html'
import { DocxBookmarksHandler } from './docx-bookmarks-handler'
import { generateBookmarksHtml } from './docx-bookmarks-webview'

export class DocxBookmarksPanel implements vscode.Disposable {
  private static instance: DocxBookmarksPanel | undefined

  private panel: vscode.WebviewPanel
  private handler: DocxBookmarksHandler
  private disposables: vscode.Disposable[] = []

  static createOrShow(context: vscode.ExtensionContext, targets: vscode.Uri[] = [], autoFix = false): void {
    if (DocxBookmarksPanel.instance) {
      DocxBookmarksPanel.instance.panel.reveal()
      void DocxBookmarksPanel.instance.handler.retarget(targets, autoFix)
      return
    }
    DocxBookmarksPanel.instance = new DocxBookmarksPanel(context, targets, autoFix)
  }

  private constructor(context: vscode.ExtensionContext, targets: vscode.Uri[], autoFix: boolean) {
    this.panel = vscode.window.createWebviewPanel(
      'toolkitDocxBookmarks',
      'Word Bookmarks',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    const nonce = createNonce()
    this.panel.webview.html = generateBookmarksHtml(nonce)
    this.handler = new DocxBookmarksHandler(this.panel.webview, targets, autoFix)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    context.subscriptions.push(this)
  }

  public dispose(): void {
    DocxBookmarksPanel.instance = undefined
    this.handler.dispose()
    this.panel.dispose()
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
