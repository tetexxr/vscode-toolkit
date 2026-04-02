import * as vscode from 'vscode';
import {
  findBracelessControl,
  findBracedSingleStatementControl,
  computeAddBraces,
  computeRemoveBraces,
} from '../utils/braces';

const LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

export function registerAddBracesCodeActions(context: vscode.ExtensionContext) {
  const provider = new BracesCodeActionProvider();
  for (const lang of LANGUAGES) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(lang, provider, {
        providedCodeActionKinds: BracesCodeActionProvider.providedCodeActionKinds,
      }),
    );
  }
}

class BracesCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const lines = Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
    const cursorLine = range.start.line;
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const indentUnit = detectIndentUnit(document);
    const actions: vscode.CodeAction[] = [];

    const braceless = findBracelessControl(lines, cursorLine);
    if (braceless) {
      const edit = computeAddBraces(lines, braceless, indentUnit, eol);
      const action = new vscode.CodeAction('Add braces', vscode.CodeActionKind.QuickFix);
      action.edit = toWorkspaceEdit(document.uri, edit);
      actions.push(action);
    }

    const braced = findBracedSingleStatementControl(lines, cursorLine);
    if (braced) {
      const edit = computeRemoveBraces(lines, braced, indentUnit, eol);
      const action = new vscode.CodeAction('Remove braces', vscode.CodeActionKind.QuickFix);
      action.edit = toWorkspaceEdit(document.uri, edit);
      actions.push(action);
    }

    return actions;
  }
}

function toWorkspaceEdit(
  uri: vscode.Uri,
  edit: { startLine: number; startCol: number; endLine: number; endCol: number; text: string },
): vscode.WorkspaceEdit {
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.replace(
    uri,
    new vscode.Range(edit.startLine, edit.startCol, edit.endLine, edit.endCol),
    edit.text,
  );
  return wsEdit;
}

function detectIndentUnit(document: vscode.TextDocument): string {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.toString() === document.uri.toString()) {
    const tabSize = editor.options.tabSize as number;
    const insertSpaces = editor.options.insertSpaces as boolean;
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
  }
  const config = vscode.workspace.getConfiguration('editor', document.uri);
  return config.get<boolean>('insertSpaces', true)
    ? ' '.repeat(config.get<number>('tabSize', 4))
    : '\t';
}
