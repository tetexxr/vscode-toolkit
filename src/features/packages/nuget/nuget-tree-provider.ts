/**
 * TreeDataProvider that lists .NET project files in the workspace.
 * Each item opens the NuGet package manager panel on click.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { discoverProjectFiles } from './nuget-project-loader'

export class NugetProjectTreeItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None)
    this.description = vscode.workspace.asRelativePath(uri, false)
    this.tooltip = uri.fsPath
    this.command = {
      command: 'toolkit.nuget.managePackages',
      title: 'Manage NuGet Packages',
      arguments: [uri]
    }
    this.contextValue = 'nugetProject'
  }
}

export class NugetTreeProvider implements vscode.TreeDataProvider<NugetProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: NugetProjectTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<NugetProjectTreeItem[]> {
    const files = await discoverProjectFiles()
    return files
      .sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)))
      .map(uri => new NugetProjectTreeItem(uri))
  }
}
