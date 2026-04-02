import * as vscode from 'vscode';
import * as path from 'path';
import { getRepoRoot, getFileLog, getFileAtCommit, type FileLogEntry } from '../utils/git';

class GitContentProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }
}

export function registerGitHistoryCommands(context: vscode.ExtensionContext): void {
  const provider = new GitContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('toolkit-git', provider),
  );

  async function showFileHistory(filePath: string): Promise<void> {
    const cwd = path.dirname(filePath);

    let repoRoot: string;
    try {
      repoRoot = await getRepoRoot(cwd);
    } catch {
      vscode.window.showErrorMessage('Not a git repository.');
      return;
    }

    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

    let entries: FileLogEntry[];
    try {
      entries = await getFileLog(repoRoot, relativePath);
    } catch {
      vscode.window.showErrorMessage('Could not retrieve git history for this file.');
      return;
    }

    if (entries.length === 0) {
      vscode.window.showInformationMessage('No git history found for this file.');
      return;
    }

    const items = entries.map(e => ({
      label: `$(git-commit) ${e.message}`,
      description: e.shortHash,
      detail: `$(person) ${e.author}  $(clock) ${e.date}`,
      entry: e,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: `Git History — ${path.basename(filePath)}`,
      placeHolder: 'Select a commit to view changes',
    });

    if (!selected) { return; }

    const { entry } = selected;
    const fileName = path.basename(filePath);

    let currentContent: string;
    try {
      currentContent = await getFileAtCommit(repoRoot, entry.hash, relativePath);
    } catch {
      currentContent = '';
    }

    let parentContent: string;
    try {
      parentContent = await getFileAtCommit(repoRoot, `${entry.hash}~1`, relativePath);
    } catch {
      parentContent = '';
    }

    const beforeUri = vscode.Uri.from({
      scheme: 'toolkit-git',
      path: `/${entry.hash}~1/${relativePath}`,
    });
    const afterUri = vscode.Uri.from({
      scheme: 'toolkit-git',
      path: `/${entry.hash}/${relativePath}`,
    });

    provider.set(beforeUri, parentContent);
    provider.set(afterUri, currentContent);

    await vscode.commands.executeCommand(
      'vscode.diff',
      beforeUri,
      afterUri,
      `${fileName} (${entry.shortHash} — ${entry.message})`,
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.gitHistory', async (uri?: vscode.Uri) => {
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!filePath) {
        vscode.window.showErrorMessage('No file selected.');
        return;
      }
      await showFileHistory(filePath);
    }),
  );
}
