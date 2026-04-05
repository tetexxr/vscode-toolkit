/**
 * NuGet Package Manager feature entry point.
 * Registers commands for managing NuGet packages in .NET projects.
 */

import * as vscode from 'vscode'
import { NugetPanel } from './nuget-panel'
import { NugetOverviewPanel } from './nuget-overview-panel'
import { pickProjectFile } from './nuget-project-loader'
import { NugetTreeProvider } from './nuget-tree-provider'

export function registerNugetCommands(context: vscode.ExtensionContext): void {
  // Sidebar tree view
  const treeProvider = new NugetTreeProvider()
  context.subscriptions.push(vscode.window.registerTreeDataProvider('nugetProjects', treeProvider))

  // Refresh tree when workspace folders change or files are created/deleted
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}')
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => treeProvider.refresh()),
    watcher.onDidDelete(() => treeProvider.refresh())
  )

  // Solution overview
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.nuget.solutionOverview', () => {
      NugetOverviewPanel.createOrShow(context)
    })
  )

  // Right-click on .csproj/.fsproj/.vbproj in explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.nuget.managePackages', (uri: vscode.Uri) => {
      NugetPanel.createOrShow(context, uri)
    })
  )

  // Command palette (shows QuickPick to select project file)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.nuget.managePackagesPalette', async () => {
      const uri = await pickProjectFile()
      if (uri) {
        NugetPanel.createOrShow(context, uri)
      }
    })
  )
}
