import * as vscode from 'vscode'
import { registerChangeCaseCommands } from './features/change-case'
import { registerSlugCommands } from './features/slug'
// import { registerAutoRenameTag } from './features/auto-rename-tag';
import { registerOpenInGitHubCommands } from './features/open-in-github'
import { registerFormatFilesCommands } from './features/format-files'
import { registerExpandRecursivelyCommands } from './features/expand-recursively'
import { registerNugetCommands } from './features/nuget/nuget'
import { registerCSharpCommands } from './features/csharp/csharp'
import { registerNpmIntellisenseCommands } from './features/npm-intellisense'
import { registerPdfViewer } from './features/pdf-viewer/pdf-provider'
import { registerGitHistoryCommands } from './features/git-history'
import { registerAddBracesCodeActions } from './features/add-braces'
import { registerGitBlameCommands } from './features/git-blame'

export function activate(context: vscode.ExtensionContext) {
  registerChangeCaseCommands(context)
  registerSlugCommands(context)
  // registerAutoRenameTag(context);
  registerOpenInGitHubCommands(context)
  registerFormatFilesCommands(context)
  registerExpandRecursivelyCommands(context)
  registerNugetCommands(context)
  registerCSharpCommands(context)
  registerNpmIntellisenseCommands(context)
  registerPdfViewer(context)
  registerGitHistoryCommands(context)
  registerAddBracesCodeActions(context)
  registerGitBlameCommands(context)
}

export function deactivate() {}
