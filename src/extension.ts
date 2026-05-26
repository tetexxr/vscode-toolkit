import type * as vscode from 'vscode'
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
import { registerNpmCommands } from './features/npm/npm'
import { registerRelativeImportsCommands } from './features/relative-imports'
import { registerMoveSymbolCommands } from './features/move-symbol'
import { registerExpandChangedFilesCommands } from './features/expand-changed'
import { registerDiagnosticHighlightCommands } from './features/diagnostic-highlight'
import { registerGitEditCommitCommands } from './features/git-edit-commit'
import { registerGitStageCommands } from './features/git-stage'
import { registerFindFileOrFolderCommands } from './features/find-file-or-folder'
import { registerSumNumbersCommands } from './features/sum-numbers'
import { registerCsvRainbowCommands } from './features/csv-rainbow'
import { registerTypeOnlyImportsCommands } from './features/type-only-imports'
import { registerLinesCommands } from './features/lines'
import { registerAlignCommands } from './features/align'
import { registerToggleQuotesCommands } from './features/toggle-quotes'
import { registerTransformCommands } from './features/transform'
import { registerInsertCommands } from './features/insert'

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
  registerNpmCommands(context)
  registerRelativeImportsCommands(context)
  registerMoveSymbolCommands(context)
  registerExpandChangedFilesCommands(context)
  registerDiagnosticHighlightCommands(context)
  registerGitEditCommitCommands(context)
  registerGitStageCommands(context)
  registerFindFileOrFolderCommands(context)
  registerSumNumbersCommands(context)
  registerCsvRainbowCommands(context)
  registerTypeOnlyImportsCommands(context)
  registerLinesCommands(context)
  registerAlignCommands(context)
  registerToggleQuotesCommands(context)
  registerTransformCommands(context)
  registerInsertCommands(context)
}

export function deactivate() {}
