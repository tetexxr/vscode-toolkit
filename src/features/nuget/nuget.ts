/**
 * NuGet Package Manager feature entry point.
 * Registers commands for managing NuGet packages in .NET projects.
 */

import * as vscode from 'vscode';
import { NugetPanel } from './nuget-panel';
import { pickProjectFile } from './nuget-project-loader';

export function registerNugetCommands(context: vscode.ExtensionContext): void {
  // Right-click on .csproj/.fsproj/.vbproj in explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.nuget.managePackages', (uri: vscode.Uri) => {
      NugetPanel.createOrShow(context, uri);
    }),
  );

  // Command palette (shows QuickPick to select project file)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.nuget.managePackagesPalette', async () => {
      const uri = await pickProjectFile();
      if (uri) {
        NugetPanel.createOrShow(context, uri);
      }
    }),
  );
}
