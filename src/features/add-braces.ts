import * as vscode from 'vscode'
import {
  findBracelessControl,
  findBracedSingleStatementControl,
  computeAddBraces,
  computeRemoveBraces
} from '../utils/braces'

const LANGUAGES = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'java', 'c', 'cpp'
]

export function registerAddBracesCodeActions(context: vscode.ExtensionContext) {
  const provider = new BracesCodeActionProvider()
  for (const lang of LANGUAGES) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(lang, provider, {
        providedCodeActionKinds: BracesCodeActionProvider.providedCodeActionKinds
      })
    )
  }
}

class BracesCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const cursorLine = range.start.line
    const windowStart = Math.max(0, cursorLine - 25)
    const windowEnd = Math.min(document.lineCount - 1, cursorLine + 25)
    const lines = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => document.lineAt(windowStart + i).text)
    const localCursor = cursorLine - windowStart

    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
    const indentUnit = detectIndentUnit(document)
    const actions: vscode.CodeAction[] = []

    const braceless = findBracelessControl(lines, localCursor)
    if (braceless) {
      const edit = computeAddBraces(lines, braceless, indentUnit, eol, false)
      edit.startLine += windowStart
      edit.endLine += windowStart
      const action = new vscode.CodeAction('Add braces', vscode.CodeActionKind.QuickFix)
      action.edit = toWorkspaceEdit(document.uri, edit)
      actions.push(action)
    }

    const braced = findBracedSingleStatementControl(lines, localCursor)
    if (braced) {
      const edit = computeRemoveBraces(lines, braced, indentUnit, eol)
      edit.startLine += windowStart
      edit.endLine += windowStart
      const action = new vscode.CodeAction('Remove braces', vscode.CodeActionKind.QuickFix)
      action.edit = toWorkspaceEdit(document.uri, edit)
      actions.push(action)
    }

    return actions
  }
}

function toWorkspaceEdit(
  uri: vscode.Uri,
  edit: { startLine: number; startCol: number; endLine: number; endCol: number; text: string }
): vscode.WorkspaceEdit {
  const wsEdit = new vscode.WorkspaceEdit()
  wsEdit.replace(uri, new vscode.Range(edit.startLine, edit.startCol, edit.endLine, edit.endCol), edit.text)
  return wsEdit
}

function detectIndentUnit(document: vscode.TextDocument): string {
  const editor = vscode.window.activeTextEditor
  if (editor && editor.document.uri.toString() === document.uri.toString()) {
    const tabSize = editor.options.tabSize as number
    const insertSpaces = editor.options.insertSpaces as boolean
    return insertSpaces ? ' '.repeat(tabSize) : '\t'
  }
  const config = vscode.workspace.getConfiguration('editor', document.uri)
  return config.get<boolean>('insertSpaces', true) ? ' '.repeat(config.get<number>('tabSize', 4)) : '\t'
}
