import type * as vscode from 'vscode'
import { registerChangeCaseCommands } from './features/editing/text/change-case'
import { registerSlugCommands } from './features/editing/text/slug'
// import { registerAutoRenameTag } from './features/codegen/auto-rename-tag';
import { registerOpenInGitHubCommands } from './features/git/open-in-github'
import { registerFormatFilesCommands } from './features/workspace/format-files'
import { registerExpandRecursivelyCommands } from './features/workspace/expand-recursively'
import { registerNugetCommands } from './features/packages/nuget/nuget'
import { registerCSharpCommands } from './features/codegen/csharp/csharp'
import { registerNpmIntellisenseCommands } from './features/packages/npm-intellisense'
import { registerPdfViewer } from './features/viewers/pdf-viewer/pdf-provider'
import { registerSvgPreviewCommands } from './features/viewers/svg-preview'
import { registerGitHistoryCommands } from './features/git/git-history'
import { registerAddBracesCodeActions } from './features/editing/text/add-braces'
import { registerGitBlameCommands } from './features/git/git-blame'
import { registerNpmCommands } from './features/packages/npm/npm'
import { registerRelativeImportsCommands } from './features/editing/imports/relative-imports'
import { registerMoveSymbolCommands } from './features/editing/text/move-symbol'
import { registerExpandChangedFilesCommands } from './features/workspace/expand-changed'
import { registerDiagnosticHighlightCommands } from './features/viewers/diagnostic-highlight'
import { registerGitEditCommitCommands } from './features/git/git-edit-commit'
import { registerCommitDiffView } from './features/git/git-commit-diff-view'
import { registerGitStageCommands } from './features/git/git-stage'
import { registerGitMultiCommitCommands } from './features/git/git-multi-commit'
import { registerFindFileOrFolderCommands } from './features/workspace/find-file-or-folder'
import { registerSumNumbersCommands } from './features/editing/text/sum-numbers'
import { registerCsvRainbowCommands } from './features/viewers/csv-rainbow'
import { registerTypeOnlyImportsCommands } from './features/editing/imports/type-only-imports'
import { registerLinesCommands } from './features/editing/text/lines'
import { registerAlignCommands } from './features/editing/text/align'
import { registerToggleQuotesCommands } from './features/editing/text/toggle-quotes'
import { registerTransformCommands } from './features/editing/convert/transform'
import { registerInsertCommands } from './features/editing/generate/insert'
import { registerTimestampCommands } from './features/editing/convert/timestamp'
import { registerUuidHover } from './features/editing/convert/uuid-hover'
import { registerEnvCheckCommands } from './features/workspace/env-check'
import { registerResxCheckCommands } from './features/workspace/resx-check'
import { registerResxEditor } from './features/workspace/resx-editor'
import { registerDependencyAuditCommands } from './features/packages/dependency-audit'
import { registerMarkdownTableCommands } from './features/editing/convert/markdown-table'
import { registerFeatureLauncherCommands } from './features/workspace/feature-launcher'
import { registerJsonToTypeCommands } from './features/editing/convert/json-to-type'
import { registerPasteImageCommands } from './features/workspace/paste-image'
import { registerClipboardHistoryCommands } from './features/workspace/clipboard-history'
import { registerBookmarkCommands } from './features/workspace/bookmarks'
import { registerTodoTreeCommands } from './features/workspace/todo-tree'
import { registerRestClientCommands } from './features/workspace/rest-client'
import { registerRegexPlaygroundCommands } from './features/workspace/regex-playground'
import { registerCompareCommands } from './features/git/compare'
import { registerPeekCommitCommands } from './features/git/peek-commit'
import { registerLocalHistoryCommands } from './features/git/local-history'
import { registerScratchCommands } from './features/workspace/scratch'
import { registerRunScriptsCommands } from './features/packages/run-scripts'
import { registerColorDecorators } from './features/viewers/color-decorators'
import { registerNumberBaseCommands } from './features/editing/convert/number-base'
import { registerDiffToolsCommands } from './features/git/diff-tools'
import { registerCronCommands } from './features/editing/convert/cron'
import { registerGitStashCommands } from './features/git/git-stash'
import { registerEyedropperCommands } from './features/viewers/eyedropper'
import { registerPasswordGeneratorCommands } from './features/editing/generate/password-generator'
import { registerKillPortCommands } from './features/workspace/kill-port'
import { registerTocCommands } from './features/editing/convert/toc'
import { registerJsonPlaygroundCommands } from './features/workspace/json-playground'
import { registerDocxBookmarkCommands } from './features/workspace/docx-bookmarks'
import { registerPdfFieldCommands } from './features/workspace/pdf-fields'
import { registerMarkdownPreviewStyle, extendMarkdownIt } from './features/viewers/markdown-preview-style'

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
  registerCommitDiffView(context)
  registerGitStageCommands(context)
  registerGitMultiCommitCommands(context)
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
  registerResxCheckCommands(context)
  registerResxEditor(context)
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
  registerPasswordGeneratorCommands(context)
  registerKillPortCommands(context)
  registerTocCommands(context)
  registerJsonPlaygroundCommands(context)
  registerDocxBookmarkCommands(context)
  registerPdfFieldCommands(context)
  registerMarkdownPreviewStyle(context)

  // Exposed to VS Code's built-in Markdown preview (see the
  // `markdown.markdownItPlugins` contribution) to gate the enhanced styling.
  return { extendMarkdownIt }
}

export function deactivate() {}
