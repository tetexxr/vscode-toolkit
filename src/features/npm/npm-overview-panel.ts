/**
 * WebviewPanel for the npm Workspace Overview.
 * Singleton — only one overview panel at a time.
 */

import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { NpmOverviewHandler } from './npm-overview-handler'
import { generateOverviewHtml } from './npm-overview-webview'

export class NpmOverviewPanel implements vscode.Disposable {
  private static instance: NpmOverviewPanel | undefined

  private panel: vscode.WebviewPanel
  private handler: NpmOverviewHandler
  private disposables: vscode.Disposable[] = []

  static createOrShow(context: vscode.ExtensionContext): void {
    if (NpmOverviewPanel.instance) {
      NpmOverviewPanel.instance.panel.reveal()
      return
    }

    const instance = new NpmOverviewPanel(context)
    NpmOverviewPanel.instance = instance
  }

  private constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'toolkitNpmOverview',
      'npm: Workspace Overview',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    )

    const nonce = crypto.randomBytes(16).toString('hex')
    this.panel.webview.html = generateOverviewHtml(nonce)

    this.handler = new NpmOverviewHandler(this.panel.webview)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    context.subscriptions.push(this)
  }

  public dispose(): void {
    NpmOverviewPanel.instance = undefined
    this.handler.dispose()
    this.panel.dispose()
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
