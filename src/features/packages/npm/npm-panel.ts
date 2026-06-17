/**
 * WebviewPanel lifecycle management for the npm package manager.
 * One panel per package.json file (keyed by fsPath). Reuses existing panels.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as crypto from 'crypto'
import { NpmMessageHandler } from './npm-message-handler'
import { generateWebviewHtml } from './npm-webview'

export class NpmPanel implements vscode.Disposable {
  private static instances = new Map<string, NpmPanel>()

  private readonly key: string
  private panel: vscode.WebviewPanel
  private messageHandler: NpmMessageHandler
  private disposables: vscode.Disposable[] = []

  /** Create a new panel or reveal an existing one for the given package.json. */
  static createOrShow(context: vscode.ExtensionContext, packageJsonUri: vscode.Uri): void {
    const key = packageJsonUri.fsPath
    const existing = NpmPanel.instances.get(key)

    if (existing) {
      existing.panel.reveal()
      return
    }

    const instance = new NpmPanel(context, packageJsonUri)
    NpmPanel.instances.set(key, instance)
  }

  private constructor(context: vscode.ExtensionContext, packageJsonUri: vscode.Uri) {
    this.key = packageJsonUri.fsPath
    const projectName = path.basename(path.dirname(packageJsonUri.fsPath))

    this.panel = vscode.window.createWebviewPanel('toolkitNpm', `npm: ${projectName}`, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true
    })

    const nonce = crypto.randomBytes(16).toString('hex')
    this.panel.webview.html = generateWebviewHtml(nonce)

    this.messageHandler = new NpmMessageHandler(this.panel.webview, packageJsonUri)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    context.subscriptions.push(this)
  }

  public dispose(): void {
    NpmPanel.instances.delete(this.key)

    this.messageHandler.dispose()
    this.panel.dispose()

    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
