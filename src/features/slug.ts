import * as vscode from 'vscode';
import { toSlug } from '../utils/text';

export function registerSlugCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.slugify', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      const config = vscode.workspace.getConfiguration('toolkit.slug');
      const separator = config.get<string>('separator', '-');
      const decamelize = config.get<boolean>('decamelize', true);
      const lowercase = config.get<boolean>('lowercase', true);

      editor.edit(editBuilder => {
        for (const selection of editor.selections) {
          if (selection.isEmpty) { continue; }
          const text = editor.document.getText(selection);
          const slug = toSlug(text, { separator, decamelize, lowercase });
          editBuilder.replace(selection, slug);
        }
      });
    })
  );
}
