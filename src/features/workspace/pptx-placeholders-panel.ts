/**
 * WebviewPanel for the PowerPoint Placeholders checker. Singleton — reveals and
 * re-targets the existing panel instead of opening a second one.
 */

import * as vscode from 'vscode'
import { createNonce } from '../../utils/html'
import { PptxPlaceholdersHandler } from './pptx-placeholders-handler'
import { generatePlaceholdersHtml } from './pptx-placeholders-webview'

export class PptxPlaceholdersPanel implements vscode.Disposable {
  private static instance: PptxPlaceholdersPanel | undefined

  private panel: vscode.WebviewPanel
  private handler: PptxPlaceholdersHandler
  private disposables: vscode.Disposable[] = []

  static createOrShow(context: vscode.ExtensionContext, targets: vscode.Uri[] = [], autoFix = false): void {
    if (PptxPlaceholdersPanel.instance) {
      PptxPlaceholdersPanel.instance.panel.reveal()
      void PptxPlaceholdersPanel.instance.handler.retarget(targets, autoFix)
      return
    }
    PptxPlaceholdersPanel.instance = new PptxPlaceholdersPanel(context, targets, autoFix)
  }

  private constructor(context: vscode.ExtensionContext, targets: vscode.Uri[], autoFix: boolean) {
    this.panel = vscode.window.createWebviewPanel(
      'toolkitPptxPlaceholders',
      'PowerPoint Placeholders',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    const nonce = createNonce()
    this.panel.webview.html = generatePlaceholdersHtml(nonce)
    this.handler = new PptxPlaceholdersHandler(this.panel.webview, targets, autoFix)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    context.subscriptions.push(this)
  }

  public dispose(): void {
    PptxPlaceholdersPanel.instance = undefined
    this.handler.dispose()
    this.panel.dispose()
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
