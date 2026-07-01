/**
 * WebviewPanel for the PDF Fields inspector. Singleton — reveals and re-targets
 * the existing panel instead of opening a second one.
 */

import * as vscode from 'vscode'
import { createNonce } from '../../utils/html'
import { PdfFieldsHandler } from './pdf-fields-handler'
import { generatePdfFieldsHtml } from './pdf-fields-webview'

export class PdfFieldsPanel implements vscode.Disposable {
  private static instance: PdfFieldsPanel | undefined

  private panel: vscode.WebviewPanel
  private handler: PdfFieldsHandler
  private disposables: vscode.Disposable[] = []

  static createOrShow(context: vscode.ExtensionContext, target: vscode.Uri): void {
    if (PdfFieldsPanel.instance) {
      PdfFieldsPanel.instance.panel.reveal()
      void PdfFieldsPanel.instance.handler.retarget(target)
      return
    }
    PdfFieldsPanel.instance = new PdfFieldsPanel(context, target)
  }

  private constructor(context: vscode.ExtensionContext, target: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'toolkitPdfFields',
      'PDF Fields',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    const nonce = createNonce()
    this.panel.webview.html = generatePdfFieldsHtml(nonce)
    this.handler = new PdfFieldsHandler(this.panel.webview, target)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    context.subscriptions.push(this)
  }

  public dispose(): void {
    PdfFieldsPanel.instance = undefined
    this.handler.dispose()
    this.panel.dispose()
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
