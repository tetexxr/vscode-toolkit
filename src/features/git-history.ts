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

class CommitItem extends vscode.TreeItem {
  constructor(
    public readonly entry: FileLogEntry,
    public readonly repoRoot: string,
    public readonly relativePath: string,
  ) {
    super(entry.message, vscode.TreeItemCollapsibleState.None);
    this.description = `${entry.shortHash} · ${entry.date}`;
    this.tooltip = `${entry.message}\n\n${entry.author} · ${entry.hash}\n${entry.date}`;
    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.command = {
      command: 'toolkit.gitHistory.showDiff',
      title: 'Show Diff',
      arguments: [this],
    };
  }
}

class GitHistoryTreeProvider implements vscode.TreeDataProvider<CommitItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: CommitItem[] = [];
  private _currentFile: string | undefined;

  get currentFile() { return this._currentFile; }

  async loadFile(filePath: string): Promise<void> {
    const cwd = path.dirname(filePath);
    const repoRoot = await getRepoRoot(cwd);
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const entries = await getFileLog(repoRoot, relativePath);

    this._currentFile = filePath;
    this.items = entries.map(e => new CommitItem(e, repoRoot, relativePath));
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this._currentFile = undefined;
    this.items = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  getChildren(): CommitItem[] {
    return this.items;
  }
}

export function registerGitHistoryCommands(context: vscode.ExtensionContext): void {
  const contentProvider = new GitContentProvider();
  const treeProvider = new GitHistoryTreeProvider();

  const treeView = vscode.window.createTreeView('toolkitGitFileHistory', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('toolkit-git', contentProvider),
    treeView,
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.gitHistory', async (uri?: vscode.Uri) => {
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!filePath) {
        vscode.window.showErrorMessage('No file selected.');
        return;
      }

      try {
        await treeProvider.loadFile(filePath);
        treeView.description = path.basename(filePath);
        await vscode.commands.executeCommand('setContext', 'toolkit.gitHistoryActive', true);
        await vscode.commands.executeCommand('toolkitGitFileHistory.focus');
      } catch {
        vscode.window.showErrorMessage('Could not retrieve git history for this file.');
      }
    }),

    vscode.commands.registerCommand('toolkit.gitHistory.close', () => {
      treeProvider.clear();
      treeView.description = undefined;
      vscode.commands.executeCommand('setContext', 'toolkit.gitHistoryActive', false);
    }),

    vscode.commands.registerCommand('toolkit.gitHistory.showDiff', async (item: CommitItem) => {
      const { entry, repoRoot, relativePath } = item;
      const fileName = path.basename(relativePath);

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

      contentProvider.set(beforeUri, parentContent);
      contentProvider.set(afterUri, currentContent);

      await vscode.commands.executeCommand(
        'vscode.diff',
        beforeUri,
        afterUri,
        `${fileName} (${entry.shortHash} — ${entry.message})`,
      );
    }),
  );
}
