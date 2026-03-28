/**
 * WebviewPanel for the NuGet Solution Overview.
 * Singleton — only one overview panel at a time.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { NugetOverviewHandler } from './nuget-overview-handler';
import { generateOverviewHtml } from './nuget-overview-webview';

export class NugetOverviewPanel implements vscode.Disposable {
  private static instance: NugetOverviewPanel | undefined;

  private panel: vscode.WebviewPanel;
  private handler: NugetOverviewHandler;
  private disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): void {
    if (NugetOverviewPanel.instance) {
      NugetOverviewPanel.instance.panel.reveal();
      return;
    }

    const instance = new NugetOverviewPanel(context);
    NugetOverviewPanel.instance = instance;
  }

  private constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'toolkitNugetOverview',
      'NuGet: Solution Overview',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const nonce = crypto.randomBytes(16).toString('hex');
    this.panel.webview.html = generateOverviewHtml(this.panel.webview, nonce);

    this.handler = new NugetOverviewHandler(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    context.subscriptions.push(this);
  }

  public dispose(): void {
    NugetOverviewPanel.instance = undefined;
    this.handler.dispose();
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
