/**
 * TreeDataProvider that lists package.json files in the workspace.
 * Each item opens the npm package manager panel on click.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { discoverPackageJsonFiles } from './npm-project-loader'

export class NpmProjectTreeItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(path.basename(path.dirname(uri.fsPath)), vscode.TreeItemCollapsibleState.None)
    this.description = vscode.workspace.asRelativePath(uri, false)
    this.tooltip = uri.fsPath
    this.command = {
      command: 'toolkit.npm.managePackages',
      title: 'Manage npm Packages',
      arguments: [uri]
    }
    this.contextValue = 'npmProject'
  }
}

export class NpmTreeProvider implements vscode.TreeDataProvider<NpmProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: NpmProjectTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(): Promise<NpmProjectTreeItem[]> {
    const files = await discoverPackageJsonFiles()
    return files
      .sort((a, b) => path.basename(path.dirname(a.fsPath)).localeCompare(path.basename(path.dirname(b.fsPath))))
      .map(uri => new NpmProjectTreeItem(uri))
  }
}
