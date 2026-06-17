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
import { registerSvgPreviewCommands } from './features/svg-preview'
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
import { registerTimestampCommands } from './features/timestamp'
import { registerUuidHover } from './features/uuid-hover'
import { registerEnvCheckCommands } from './features/env-check'
import { registerDependencyAuditCommands } from './features/dependency-audit'
import { registerMarkdownTableCommands } from './features/markdown-table'
import { registerFeatureLauncherCommands } from './features/feature-launcher'
import { registerJsonToTypeCommands } from './features/json-to-type'
import { registerPasteImageCommands } from './features/paste-image'
import { registerClipboardHistoryCommands } from './features/clipboard-history'
import { registerBookmarkCommands } from './features/bookmarks'
import { registerTodoTreeCommands } from './features/todo-tree'
import { registerRestClientCommands } from './features/rest-client'
import { registerRegexPlaygroundCommands } from './features/regex-playground'
import { registerCompareCommands } from './features/compare'
import { registerPeekCommitCommands } from './features/peek-commit'
import { registerLocalHistoryCommands } from './features/local-history'
import { registerScratchCommands } from './features/scratch'
import { registerRunScriptsCommands } from './features/run-scripts'
import { registerColorDecorators } from './features/color-decorators'
import { registerNumberBaseCommands } from './features/number-base'
import { registerDiffToolsCommands } from './features/diff-tools'
import { registerCronCommands } from './features/cron'
import { registerGitStashCommands } from './features/git-stash'
import { registerEyedropperCommands } from './features/eyedropper'

export function activate(context: vscode.ExtensionContext) {
  registerFeatureLauncherCommands(context)
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
  registerSvgPreviewCommands(context)
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
  registerTimestampCommands(context)
  registerUuidHover(context)
  registerEnvCheckCommands(context)
  registerDependencyAuditCommands(context)
  registerMarkdownTableCommands(context)
  registerJsonToTypeCommands(context)
  registerPasteImageCommands(context)
  registerClipboardHistoryCommands(context)
  registerBookmarkCommands(context)
  registerTodoTreeCommands(context)
  registerRestClientCommands(context)
  registerRegexPlaygroundCommands(context)
  registerCompareCommands(context)
  registerPeekCommitCommands(context)
  registerLocalHistoryCommands(context)
  registerScratchCommands(context)
  registerRunScriptsCommands(context)
  registerColorDecorators(context)
  registerNumberBaseCommands(context)
  registerDiffToolsCommands(context)
  registerCronCommands(context)
  registerGitStashCommands(context)
  registerEyedropperCommands(context)
}

export function deactivate() {}
