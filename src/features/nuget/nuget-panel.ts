/**
 * WebviewPanel lifecycle management for the NuGet package manager.
 * One panel per project file (keyed by fsPath). Reuses existing panels.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { NugetMessageHandler } from './nuget-message-handler';
import { generateWebviewHtml } from './nuget-webview';

export class NugetPanel implements vscode.Disposable {
  private static instances = new Map<string, NugetPanel>();

  private readonly key: string;
  private panel: vscode.WebviewPanel;
  private messageHandler: NugetMessageHandler;
  private disposables: vscode.Disposable[] = [];

  /** Create a new panel or reveal an existing one for the given project file. */
  static createOrShow(context: vscode.ExtensionContext, projectFileUri: vscode.Uri): void {
    const key = projectFileUri.fsPath;
    const existing = NugetPanel.instances.get(key);

    if (existing) {
      existing.panel.reveal();
      return;
    }

    const instance = new NugetPanel(context, projectFileUri);
    NugetPanel.instances.set(key, instance);
  }

  private constructor(context: vscode.ExtensionContext, projectFileUri: vscode.Uri) {
    this.key = projectFileUri.fsPath;
    const projectName = path.basename(projectFileUri.fsPath);

    this.panel = vscode.window.createWebviewPanel(
      'toolkitNuget',
      `NuGet: ${projectName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const nonce = crypto.randomBytes(16).toString('hex');
    this.panel.webview.html = generateWebviewHtml(this.panel.webview, nonce);

    this.messageHandler = new NugetMessageHandler(this.panel.webview, projectFileUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    context.subscriptions.push(this);
  }

  public dispose(): void {
    NugetPanel.instances.delete(this.key);

    this.messageHandler.dispose();
    this.panel.dispose();

    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
