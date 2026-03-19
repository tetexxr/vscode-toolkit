import * as vscode from 'vscode';
import { isExcluded } from '../utils/files';

/**
 * Expand/Collapse Recursively — expand or collapse all folders in the file explorer.
 * Based on metrosoft-application.file-explorer-expand-recursively approach:
 *   revealInExplorer → delay → list.expand/collapse → delay → recurse
 */

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getSubfolders(uri: vscode.Uri, excludePatterns: string[]): Promise<vscode.Uri[]> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(([name, type]) =>
        type === vscode.FileType.Directory && !isExcluded(name, excludePatterns)
      )
      .map(([name]) => vscode.Uri.joinPath(uri, name));
  } catch {
    return [];
  }
}

/**
 * Recursively expand a folder and all its subfolders (depth-first).
 */
async function expandFolder(
  uri: vscode.Uri,
  excludePatterns: string[],
  token: vscode.CancellationToken,
): Promise<void> {
  if (token.isCancellationRequested) { return; }

  try {
    await vscode.commands.executeCommand('revealInExplorer', uri);
    await delay(30);
    await vscode.commands.executeCommand('list.expand');
    await delay(15);
  } catch {
    return;
  }

  const subfolders = await getSubfolders(uri, excludePatterns);
  for (const subfolder of subfolders) {
    if (token.isCancellationRequested) { return; }
    await expandFolder(subfolder, excludePatterns, token);
  }
}

/**
 * Collect all subfolders in post-order (deepest first) for collapsing.
 */
async function collectFoldersPostOrder(
  uri: vscode.Uri,
  excludePatterns: string[],
  result: vscode.Uri[],
): Promise<void> {
  const subfolders = await getSubfolders(uri, excludePatterns);
  for (const subfolder of subfolders) {
    await collectFoldersPostOrder(subfolder, excludePatterns, result);
  }
  result.push(uri);
}

/**
 * Recursively collapse a folder and all its subfolders (bottom-up).
 */
async function collapseFolder(
  uri: vscode.Uri,
  excludePatterns: string[],
  token: vscode.CancellationToken,
): Promise<void> {
  if (token.isCancellationRequested) { return; }

  const folders: vscode.Uri[] = [];
  await collectFoldersPostOrder(uri, excludePatterns, folders);

  for (const folder of folders) {
    if (token.isCancellationRequested) { return; }
    try {
      await vscode.commands.executeCommand('revealInExplorer', folder);
      await delay(10);
      await vscode.commands.executeCommand('list.collapse');
      await delay(10);
    } catch {
      // continue
    }
  }
}

function getExcludePatterns(): string[] {
  const config = vscode.workspace.getConfiguration('toolkit.expandRecursively');
  return config.get<string[]>('excludePatterns', [
    '.git', '.svn', '.vs', '.vscode', '.cache', '__pycache__',
    'node_modules', 'dist', 'build', 'target', 'bin', 'obj',
  ]);
}

export function registerExpandRecursivelyCommands(context: vscode.ExtensionContext): void {
  // Expand recursively
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.expandRecursively', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
      const excludePatterns = getExcludePatterns();

      // Determine target folders
      let targets: vscode.Uri[];
      if (selectedUris && selectedUris.length > 0) {
        targets = selectedUris;
      } else if (uri) {
        targets = [uri];
      } else {
        // Fallback: expand all workspace folders
        targets = (vscode.workspace.workspaceFolders || []).map(f => f.uri);
      }

      if (targets.length === 0) {
        vscode.window.showInformationMessage('No folder selected.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Expanding folders...',
          cancellable: true,
        },
        async (_progress, token) => {
          // Focus explorer first
          await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
          await delay(100);

          for (const target of targets) {
            if (token.isCancellationRequested) { break; }
            await expandFolder(target, excludePatterns, token);
          }
        }
      );
    })
  );

  // Collapse recursively
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.collapseRecursively', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
      const excludePatterns = getExcludePatterns();

      let targets: vscode.Uri[];
      if (selectedUris && selectedUris.length > 0) {
        targets = selectedUris;
      } else if (uri) {
        targets = [uri];
      } else {
        targets = (vscode.workspace.workspaceFolders || []).map(f => f.uri);
      }

      if (targets.length === 0) {
        vscode.window.showInformationMessage('No folder selected.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Collapsing folders...',
          cancellable: true,
        },
        async (_progress, token) => {
          await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
          await delay(100);

          for (const target of targets) {
            if (token.isCancellationRequested) { break; }
            await collapseFolder(target, excludePatterns, token);
          }
        }
      );
    })
  );
}
