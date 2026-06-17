import * as vscode from 'vscode'
import {
  DEFAULT_EXCLUDED_FOLDERS,
  DEFAULT_INCLUDE_GLOB,
  buildExcludeGlob as buildExcludeGlobPure,
  type ExcludeMap
} from './format-files-utils'
import { filterGitIgnored } from '../../utils/git-ignore'
import { logError, logInfo } from '../../utils/logger'

/**
 * Format Files — bulk format all files in workspace or a specific folder.
 * Uses VS Code's built-in findFiles and provider APIs (no external deps).
 * Flow per file: open (in memory) → organizeImports? → format → save.
 * Everything is addressed by document, never via focus-dependent commands,
 * so the user can keep working while a batch runs.
 */

function buildExcludeGlob(): string | undefined {
  const config = vscode.workspace.getConfiguration('toolkit.formatFiles')
  const excludedFolders = config.get<string[]>('excludedFolders', DEFAULT_EXCLUDED_FOLDERS)
  const filesExclude = vscode.workspace.getConfiguration('files').get<ExcludeMap>('exclude', {})
  const searchExclude = vscode.workspace.getConfiguration('search').get<ExcludeMap>('exclude', {})
  return buildExcludeGlobPure(excludedFolders, filesExclude, searchExclude)
}

async function findAndFormat(includeGlob: string, baseFolder?: vscode.Uri): Promise<void> {
  const excludeGlob = buildExcludeGlob()

  // If scoped to a folder, make the include glob relative to it
  let relativePattern: vscode.GlobPattern
  if (baseFolder) {
    relativePattern = new vscode.RelativePattern(baseFolder, includeGlob)
  } else {
    relativePattern = includeGlob
  }

  let files = await vscode.workspace.findFiles(relativePattern, excludeGlob)

  const config = vscode.workspace.getConfiguration('toolkit.formatFiles')
  const useGitIgnore = config.get<boolean>('useGitIgnore', true)
  if (useGitIgnore && files.length > 0) {
    const cwd = baseFolder?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (cwd) {
      const kept = await filterGitIgnored(files.map(u => u.fsPath), cwd)
      const keptSet = new Set(kept)
      files = files.filter(u => keptSet.has(u.fsPath))
    }
  }

  if (files.length === 0) {
    vscode.window.showInformationMessage('No files found matching the pattern.')
    return
  }

  // Confirm with user
  const confirm = await vscode.window.showInformationMessage(`Format ${files.length} file(s)?`, { modal: true }, 'Yes')
  if (confirm !== 'Yes') {
    return
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Formatting documents',
      cancellable: true
    },
    async (progress, token) => {
      const increment = (1 / files.length) * 100

      // Report initial
      progress.report({ increment: 0 })

      const processed = await formatWithProgress(files, token, progress, increment)

      vscode.window.showInformationMessage(`Format Files completed. Processed ${processed} file(s).`, { modal: true })
    }
  )
}

/** Runs the organize-imports code action on a document without focusing it. */
async function organizeImports(doc: vscode.TextDocument): Promise<void> {
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0)
  const actions = await vscode.commands.executeCommand<(vscode.CodeAction | vscode.Command)[] | undefined>(
    'vscode.executeCodeActionProvider',
    doc.uri,
    fullRange,
    vscode.CodeActionKind.SourceOrganizeImports.value
  )
  for (const action of actions ?? []) {
    if (action instanceof vscode.CodeAction) {
      if (action.edit) {
        await vscode.workspace.applyEdit(action.edit)
      }
      if (action.command) {
        await vscode.commands.executeCommand(action.command.command, ...((action.command.arguments ?? []) as unknown[]))
      }
    } else {
      await vscode.commands.executeCommand(action.command, ...((action.arguments ?? []) as unknown[]))
    }
  }
}

/** The same tab settings the regular Format Document command would use. */
function formattingOptions(doc: vscode.TextDocument): vscode.FormattingOptions {
  const editorConfig = vscode.workspace.getConfiguration('editor', { uri: doc.uri, languageId: doc.languageId })
  return {
    tabSize: editorConfig.get<number>('tabSize', 4),
    insertSpaces: editorConfig.get<boolean>('insertSpaces', true)
  }
}

async function formatWithProgress(
  files: vscode.Uri[],
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  increment: number
): Promise<number> {
  const config = vscode.workspace.getConfiguration('toolkit.formatFiles')
  const runOrganizeImports = config.get<boolean>('runOrganizeImports', false)

  const t0 = performance.now()
  let processed = 0

  for (const file of files) {
    if (token.isCancellationRequested) {
      vscode.window.showInformationMessage(`Operation cancelled. Processed ${processed} file(s).`, { modal: true })
      break
    }

    progress.report({ message: file.fsPath, increment })

    try {
      const doc = await vscode.workspace.openTextDocument(file)

      if (runOrganizeImports) {
        await organizeImports(doc)
      }

      const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
        'vscode.executeFormatDocumentProvider',
        file,
        formattingOptions(doc)
      )
      if (edits && edits.length > 0) {
        const workspaceEdit = new vscode.WorkspaceEdit()
        workspaceEdit.set(file, edits)
        await vscode.workspace.applyEdit(workspaceEdit)
      }

      if (doc.isDirty) {
        await doc.save()
      }

      processed++
    } catch (err) {
      // The batch can include hundreds of files; we keep going and log the
      // failure so the user can pinpoint which one.
      logError(`format-files:${file.fsPath}`, err)
    }
  }

  logInfo('format-files', `formatted ${processed} of ${files.length} file(s) in ${Math.round(performance.now() - t0)}ms`)
  return processed
}

export function registerFormatFilesCommands(context: vscode.ExtensionContext): void {
  // Format all files in workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.workspace', async () => {
      const config = vscode.workspace.getConfiguration('toolkit.formatFiles')
      const includeGlob = config.get<string>('includeGlob', DEFAULT_INCLUDE_GLOB)
      await findAndFormat(includeGlob)
    })
  )

  // Format from custom glob
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.fromGlob', async () => {
      const glob = await vscode.window.showInputBox({
        prompt: 'Enter a glob pattern for files to format',
        placeHolder: '**/*.{ts,js}',
        value: '**/*.{ts,js}'
      })
      if (!glob) {
        return
      }
      await findAndFormat(glob)
    })
  )

  // Format files in specific folder (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.thisFolder', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No folder selected.')
        return
      }
      const config = vscode.workspace.getConfiguration('toolkit.formatFiles')
      const includeGlob = config.get<string>('includeGlob', DEFAULT_INCLUDE_GLOB)
      await findAndFormat(includeGlob, uri)
    })
  )
}
