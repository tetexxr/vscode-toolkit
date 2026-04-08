/**
 * npm Package Manager feature entry point.
 * Registers commands for managing npm packages in Node.js projects.
 */

import * as vscode from 'vscode'
import { NpmPanel } from './npm-panel'
import { NpmOverviewPanel } from './npm-overview-panel'
import { pickPackageJsonFile } from './npm-project-loader'
import { NpmTreeProvider } from './npm-tree-provider'

export function registerNpmCommands(context: vscode.ExtensionContext): void {
  // Sidebar tree view
  const treeProvider = new NpmTreeProvider()
  context.subscriptions.push(vscode.window.registerTreeDataProvider('npmProjects', treeProvider))

  // Refresh tree when package.json files are created, deleted or changed
  const watcher = vscode.workspace.createFileSystemWatcher('**/package.json')
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => treeProvider.refresh()),
    watcher.onDidDelete(() => treeProvider.refresh()),
    watcher.onDidChange(() => treeProvider.refresh())
  )

  // Workspace overview
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.npm.workspaceOverview', () => {
      NpmOverviewPanel.createOrShow(context)
    })
  )

  // Right-click on package.json in explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.npm.managePackages', (uri: vscode.Uri) => {
      NpmPanel.createOrShow(context, uri)
    })
  )

  // Command palette (shows QuickPick to select package.json)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.npm.managePackagesPalette', async () => {
      const uri = await pickPackageJsonFile()
      if (uri) {
        NpmPanel.createOrShow(context, uri)
      }
    })
  )
}
