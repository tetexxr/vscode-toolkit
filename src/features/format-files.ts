import * as vscode from 'vscode';

/**
 * Format Files — bulk format all files in workspace or a specific folder.
 * Uses VS Code's built-in findFiles and formatDocument APIs (no external deps).
 * Follows the same flow as jbockle.format-files:
 *   open → show → organizeImports? → format → save → close
 */

function buildExcludeGlob(): string {
  const config = vscode.workspace.getConfiguration('toolkit.formatFiles');
  const excludedFolders = config.get<string[]>('excludedFolders', [
    'node_modules', '.vscode', '.git', 'dist', 'build', '.chrome',
  ]);
  // Build a glob pattern like: {node_modules,dist,.git}/**
  if (excludedFolders.length === 0) { return ''; }
  return `{${excludedFolders.join(',')}}/**`;
}

async function findAndFormat(
  includeGlob: string,
  baseFolder?: vscode.Uri,
): Promise<void> {
  const excludeGlob = buildExcludeGlob();

  // If scoped to a folder, make the include glob relative to it
  let relativePattern: vscode.GlobPattern;
  if (baseFolder) {
    relativePattern = new vscode.RelativePattern(baseFolder, includeGlob);
  } else {
    relativePattern = includeGlob;
  }

  const files = await vscode.workspace.findFiles(relativePattern, excludeGlob || undefined);

  if (files.length === 0) {
    vscode.window.showInformationMessage('No files found matching the pattern.');
    return;
  }

  // Confirm with user
  const confirm = await vscode.window.showInformationMessage(
    `Format ${files.length} file(s)?`,
    { modal: true },
    'Yes',
  );
  if (confirm !== 'Yes') { return; }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Formatting documents',
      cancellable: true,
    },
    async (progress, token) => {
      const increment = (1 / files.length) * 100;

      // Report initial
      progress.report({ increment: 0 });

      const processed = await formatWithProgress(files, token, progress, increment);

      vscode.window.showInformationMessage(
        `Format Files completed. Processed ${processed} file(s).`,
        { modal: true },
      );
    }
  );
}

async function formatWithProgress(
  files: vscode.Uri[],
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  increment: number,
): Promise<number> {
  const config = vscode.workspace.getConfiguration('toolkit.formatFiles');
  const runOrganizeImports = config.get<boolean>('runOrganizeImports', false);

  let processed = 0;

  for (const file of files) {
    if (token.isCancellationRequested) {
      vscode.window.showInformationMessage(
        `Operation cancelled. Processed ${processed} file(s).`,
        { modal: true },
      );
      break;
    }

    progress.report({ message: file.fsPath, increment });

    try {
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });

      if (runOrganizeImports) {
        await vscode.commands.executeCommand('editor.action.organizeImports');
      }

      await vscode.commands.executeCommand('editor.action.formatDocument');
      await vscode.commands.executeCommand('workbench.action.files.save');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      processed++;
    } catch {
      // Skip files that fail
    }
  }

  return processed;
}

export function registerFormatFilesCommands(context: vscode.ExtensionContext): void {
  // Format all files in workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.workspace', async () => {
      const config = vscode.workspace.getConfiguration('toolkit.formatFiles');
      const includeGlob = config.get<string>('includeGlob', '**/*.{ts,js,json,html,css,md,tsx,jsx,vue,scss,less,yaml,yml}');
      await findAndFormat(includeGlob);
    })
  );

  // Format from custom glob
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.fromGlob', async () => {
      const glob = await vscode.window.showInputBox({
        prompt: 'Enter a glob pattern for files to format',
        placeHolder: '**/*.{ts,js}',
        value: '**/*.{ts,js}',
      });
      if (!glob) { return; }
      await findAndFormat(glob);
    })
  );

  // Format files in specific folder (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.formatFiles.thisFolder', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No folder selected.');
        return;
      }
      const config = vscode.workspace.getConfiguration('toolkit.formatFiles');
      const includeGlob = config.get<string>('includeGlob', '**/*.{ts,js,json,html,css,md,tsx,jsx,vue,scss,less,yaml,yml}');
      await findAndFormat(includeGlob, uri);
    })
  );
}
