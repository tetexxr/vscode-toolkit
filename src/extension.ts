import * as vscode from 'vscode';
import { registerChangeCaseCommands } from './features/change-case';
import { registerSlugCommands } from './features/slug';
// import { registerAutoRenameTag } from './features/auto-rename-tag';
import { registerOpenInGitHubCommands } from './features/open-in-github';
import { registerFormatFilesCommands } from './features/format-files';
import { registerExpandRecursivelyCommands } from './features/expand-recursively';
import { registerNugetCommands } from './features/nuget/nuget';
import { registerCSharpCommands } from './features/csharp/csharp';

export function activate(context: vscode.ExtensionContext) {
  registerChangeCaseCommands(context);
  registerSlugCommands(context);
  // registerAutoRenameTag(context);
  registerOpenInGitHubCommands(context);
  registerFormatFilesCommands(context);
  registerExpandRecursivelyCommands(context);
  registerNugetCommands(context);
  registerCSharpCommands(context);
}

export function deactivate() {}
