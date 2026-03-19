import * as vscode from 'vscode';
import * as path from 'path';
import { getRepoRoot, getCurrentBranch, getCommitHash, getRemoteUrl, parseRemoteUrl } from '../utils/git';

async function getGitInfo(filePath?: string) {
  const cwd = filePath
    ? path.dirname(filePath)
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return undefined;
  }

  const config = vscode.workspace.getConfiguration('toolkit.openInGitHub');
  const remoteName = config.get<string>('remoteName', 'origin');
  const defaultBranch = config.get<string>('defaultBranch', 'main');
  const useCurrentBranch = config.get<boolean>('useCurrentBranch', true);

  try {
    const [repoRoot, remoteUrlRaw, branch] = await Promise.all([
      getRepoRoot(cwd),
      getRemoteUrl(cwd, remoteName),
      useCurrentBranch ? getCurrentBranch(cwd) : Promise.resolve(defaultBranch),
    ]);

    const remote = parseRemoteUrl(remoteUrlRaw);
    if (!remote) {
      vscode.window.showErrorMessage(`Could not parse remote URL: ${remoteUrlRaw}`);
      return undefined;
    }

    const baseUrl = `https://${remote.domain}/${remote.owner}/${remote.repo}`;

    return {
      repoRoot,
      baseUrl,
      branch: branch || defaultBranch,
      cwd,
    };
  } catch (err: any) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return undefined;
  }
}

function getFilePathAndLines(repoRoot: string): { relativePath: string; lineFragment: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return undefined; }

  const filePath = editor.document.uri.fsPath;
  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

  const config = vscode.workspace.getConfiguration('toolkit.openInGitHub');
  const useLocalLine = config.get<boolean>('useLocalLine', true);

  let lineFragment = '';
  if (useLocalLine && editor.selection) {
    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    if (startLine === endLine) {
      lineFragment = `#L${startLine}`;
    } else {
      lineFragment = `#L${startLine}-L${endLine}`;
    }
  }

  return { relativePath, lineFragment };
}

async function openUrl(url: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function copyUrl(url: string): Promise<void> {
  await vscode.env.clipboard.writeText(url);
  vscode.window.showInformationMessage('Link copied to clipboard.');
}

export function registerOpenInGitHubCommands(context: vscode.ExtensionContext): void {
  // Open file at current line
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.file', async () => {
      const editor = vscode.window.activeTextEditor;
      const info = await getGitInfo(editor?.document.uri.fsPath);
      if (!info) { return; }

      const fileInfo = getFilePathAndLines(info.repoRoot);
      if (!fileInfo) {
        vscode.window.showErrorMessage('No active file.');
        return;
      }

      const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/');
      const url = `${info.baseUrl}/blob/${encodeURIComponent(info.branch)}/${encodedPath}${fileInfo.lineFragment}`;
      await openUrl(url);
    })
  );

  // Open repository
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.repo', async () => {
      const info = await getGitInfo();
      if (!info) { return; }
      await openUrl(info.baseUrl);
    })
  );

  // Open blame
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.blame', async () => {
      const editor = vscode.window.activeTextEditor;
      const info = await getGitInfo(editor?.document.uri.fsPath);
      if (!info) { return; }

      const fileInfo = getFilePathAndLines(info.repoRoot);
      if (!fileInfo) {
        vscode.window.showErrorMessage('No active file.');
        return;
      }

      const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/');
      const url = `${info.baseUrl}/blame/${encodeURIComponent(info.branch)}/${encodedPath}${fileInfo.lineFragment}`;
      await openUrl(url);
    })
  );

  // Open file history
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.history', async () => {
      const editor = vscode.window.activeTextEditor;
      const info = await getGitInfo(editor?.document.uri.fsPath);
      if (!info) { return; }

      const fileInfo = getFilePathAndLines(info.repoRoot);
      if (!fileInfo) {
        vscode.window.showErrorMessage('No active file.');
        return;
      }

      const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/');
      const url = `${info.baseUrl}/commits/${encodeURIComponent(info.branch)}/${encodedPath}`;
      await openUrl(url);
    })
  );

  // Copy file link
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.copyFileLink', async () => {
      const editor = vscode.window.activeTextEditor;
      const info = await getGitInfo(editor?.document.uri.fsPath);
      if (!info) { return; }

      const fileInfo = getFilePathAndLines(info.repoRoot);
      if (!fileInfo) {
        vscode.window.showErrorMessage('No active file.');
        return;
      }

      const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/');
      const url = `${info.baseUrl}/blob/${encodeURIComponent(info.branch)}/${encodedPath}${fileInfo.lineFragment}`;
      await copyUrl(url);
    })
  );

  // Copy permalink (with commit hash instead of branch)
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.openInGitHub.copyPermalink', async () => {
      const editor = vscode.window.activeTextEditor;
      const info = await getGitInfo(editor?.document.uri.fsPath);
      if (!info) { return; }

      const fileInfo = getFilePathAndLines(info.repoRoot);
      if (!fileInfo) {
        vscode.window.showErrorMessage('No active file.');
        return;
      }

      try {
        const commitHash = await getCommitHash(info.cwd);
        const encodedPath = fileInfo.relativePath.split('/').map(encodeURIComponent).join('/');
        const url = `${info.baseUrl}/blob/${commitHash}/${encodedPath}${fileInfo.lineFragment}`;
        await copyUrl(url);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
    })
  );
}
