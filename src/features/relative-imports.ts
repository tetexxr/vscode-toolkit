import * as vscode from 'vscode'
import * as path from 'path'
import {
  findTsConfig,
  loadPathsFromConfig,
  resolveAlias,
  toRelative,
  findImportMatches,
  PATH_RE,
} from './relative-imports-utils'

export function registerRelativeImportsCommands(context: vscode.ExtensionContext): void {
  // Command: convert all alias imports in current file
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.convertImportsToRelative', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return

      const configPath = findTsConfig(path.dirname(editor.document.uri.fsPath))
      if (!configPath) {
        vscode.window.showWarningMessage('No tsconfig.json or jsconfig.json found.')
        return
      }

      const config = loadPathsFromConfig(configPath)
      if (!config) {
        vscode.window.showWarningMessage('No path aliases found in tsconfig/jsconfig.')
        return
      }

      const matches = findImportMatches(
        editor.document.getText(),
        editor.document.uri.fsPath,
        config
      )
      if (matches.length === 0) {
        vscode.window.showInformationMessage('No alias imports to convert.')
        return
      }

      await editor.edit((eb) => {
        for (const m of matches) {
          eb.replace(
            new vscode.Range(
              editor.document.positionAt(m.pathStart),
              editor.document.positionAt(m.pathStart + m.importPath.length)
            ),
            m.relativePath
          )
        }
      })

      vscode.window.showInformationMessage(
        `Converted ${matches.length} import${matches.length > 1 ? 's' : ''} to relative paths.`
      )
    })
  )

  // Code Action provider: offer conversion on individual import lines
  const codeActionProvider: vscode.CodeActionProvider = {
    provideCodeActions(document, range) {
      const configPath = findTsConfig(path.dirname(document.uri.fsPath))
      if (!configPath) return []

      const config = loadPathsFromConfig(configPath)
      if (!config) return []

      const line = document.lineAt(range.start.line)
      const re = new RegExp(PATH_RE.source, 'g')
      let match: RegExpExecArray | null
      const actions: vscode.CodeAction[] = []

      while ((match = re.exec(line.text)) !== null) {
        const quote = match[1]
        const importPath = match[2]
        if (importPath.startsWith('.') || importPath.startsWith('/')) continue

        const absolute = resolveAlias(importPath, config)
        if (!absolute) continue

        const relative = toRelative(document.uri.fsPath, absolute)
        const pathStart = match.index + match[0].indexOf(quote + importPath) + 1

        const action = new vscode.CodeAction(
          `Convert to relative import: '${relative}'`,
          vscode.CodeActionKind.RefactorRewrite
        )
        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(
          document.uri,
          new vscode.Range(
            new vscode.Position(range.start.line, pathStart),
            new vscode.Position(range.start.line, pathStart + importPath.length)
          ),
          relative
        )
        actions.push(action)
      }
      return actions
    },
  }

  const languages = [
    'typescript',
    'typescriptreact',
    'javascript',
    'javascriptreact',
    'vue',
    'svelte',
  ]
  for (const lang of languages) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(lang, codeActionProvider, {
        providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite],
      })
    )
  }
}
