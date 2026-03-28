/**
 * IPC bridge between the webview and the extension host.
 * Handles all messages from the webview, orchestrates API calls,
 * dotnet CLI tasks, and project reloading.
 */

import * as vscode from 'vscode';
import {
  WebviewMessage, ExtensionMessage,
  PackageSource, PackageViewModel, NugetConfig, Category,
} from './nuget-types';
import * as nugetApi from './nuget-api';
import { loadProject, reloadProject } from './nuget-project-loader';
import { NugetTaskManager } from './nuget-task-manager';

export class NugetMessageHandler implements vscode.Disposable {
  private taskManager: NugetTaskManager;
  private projectFsPath: string;
  private disposables: vscode.Disposable[] = [];

  constructor(private webview: vscode.Webview, projectFileUri: vscode.Uri) {
    this.projectFsPath = projectFileUri.fsPath;
    this.taskManager = new NugetTaskManager();

    this.disposables.push(
      this.webview.onDidReceiveMessage(
        (msg: WebviewMessage) => this.handleMessage(msg),
      ),
      this.taskManager,
      vscode.workspace.onDidChangeConfiguration(() => {
        nugetApi.clearEndpointCache();
        this.sendInit();
      }),
    );
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready': return await this.sendInit();
        case 'search': return await this.handleSearch(msg.query, msg.prerelease, msg.sourceIndex, msg.category);
        case 'select-package': return await this.handleSelectPackage(msg.packageId);
        case 'install': return await this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'install');
        case 'update': return await this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'update');
        case 'uninstall': return await this.handleUninstall(msg.packageId);
        case 'update-all': return await this.handleUpdateAll(msg.packages);
        case 'open-settings':
          return void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tete.vscode-toolkit toolkit.nuget');
        case 'open-url':
          return void vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    } catch (err: any) {
      this.post({ type: 'error', message: err.message || String(err) });
      this.post({ type: 'loading', loading: false });
    }
  }

  // ── Init ───────────────────────────────────────────────

  private async sendInit(): Promise<void> {
    const project = await loadProject(vscode.Uri.file(this.projectFsPath));
    const sources = this.getSources();
    const config = this.getConfig();
    this.post({ type: 'init', project, sources, config });
  }

  // ── Search ─────────────────────────────────────────────

  private async handleSearch(query: string, prerelease: boolean, sourceIndex: number, category: Category): Promise<void> {
    this.post({ type: 'loading', loading: true });

    const sources = this.getSources();
    const source = sources[sourceIndex] || sources[0];
    const timeout = this.getConfig().requestTimeout;

    let packages: PackageViewModel[];

    if (category === 'browse') {
      packages = await nugetApi.searchPackages(query, prerelease, source, timeout);
    } else {
      const project = await reloadProject(this.projectFsPath);
      packages = await nugetApi.fetchInstalledPackagesMetadata(
        project.packages, query, prerelease, source, timeout,
      );
    }

    // Mark installed status
    const project = await reloadProject(this.projectFsPath);
    for (const pkg of packages) {
      const installed = project.packages.find(p => p.id === pkg.id);
      pkg.isInstalled = !!installed;
      pkg.installedVersion = installed?.version || '';
      pkg.isOutdated = pkg.isInstalled && pkg.installedVersion !== pkg.version;
    }

    // Filter for updates category
    if (category === 'updates') {
      packages = packages.filter(p => p.isOutdated);
    }

    this.post({ type: 'packages', packages, category });
    this.post({ type: 'loading', loading: false });
  }

  // ── Package details ────────────────────────────────────

  private async handleSelectPackage(packageId: string): Promise<void> {
    this.post({ type: 'loading', loading: true });

    const sources = this.getSources();
    const source = sources[0]; // Use first source for details
    const timeout = this.getConfig().requestTimeout;

    const versions = await nugetApi.fetchPackageVersions(packageId, true, source, timeout);
    const project = await reloadProject(this.projectFsPath);
    const installed = project.packages.find(p => p.id === packageId);

    const latest = versions[0];
    if (latest) {
      const pkg: PackageViewModel = {
        id: packageId,
        version: latest.version,
        description: latest.description || '',
        authors: Array.isArray(latest.authors) ? latest.authors.join(', ') : (latest.authors || ''),
        iconUrl: latest.iconUrl || '',
        verified: false,
        isInstalled: !!installed,
        installedVersion: installed?.version || '',
        isOutdated: !!installed && installed.version !== latest.version,
        sourceUrl: source.url,
        versions,
      };
      this.post({ type: 'package-details', pkg });
    }

    this.post({ type: 'loading', loading: false });
  }

  // ── Install / Update ───────────────────────────────────

  private async handleInstallOrUpdate(packageId: string, version: string, sourceUrl: string, action: string): Promise<void> {
    this.post({ type: 'task-started', packageId, action });

    const task = NugetTaskManager.buildAddTask(this.projectFsPath, packageId, version, sourceUrl);
    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0;
      if (success) {
        const project = await reloadProject(this.projectFsPath);
        this.post({ type: 'project-updated', project });
      }
      this.post({ type: 'task-finished', packageId, action, success });
    });
  }

  // ── Uninstall ──────────────────────────────────────────

  private async handleUninstall(packageId: string): Promise<void> {
    this.post({ type: 'task-started', packageId, action: 'uninstall' });

    const task = NugetTaskManager.buildRemoveTask(this.projectFsPath, packageId);
    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0;
      if (success) {
        const project = await reloadProject(this.projectFsPath);
        this.post({ type: 'project-updated', project });
      }
      this.post({ type: 'task-finished', packageId, action: 'uninstall', success });
    });
  }

  // ── Update all ─────────────────────────────────────────

  private async handleUpdateAll(packages: Array<{ id: string; version: string; sourceUrl: string }>): Promise<void> {
    for (const pkg of packages) {
      await this.handleInstallOrUpdate(pkg.id, pkg.version, pkg.sourceUrl, 'update');
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private post(msg: ExtensionMessage): void {
    this.webview.postMessage(msg);
  }

  private getSources(): PackageSource[] {
    const config = vscode.workspace.getConfiguration('toolkit.nuget');
    return config.get<PackageSource[]>('sources', [
      { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' },
    ]);
  }

  private getConfig(): NugetConfig {
    const config = vscode.workspace.getConfiguration('toolkit.nuget');
    return {
      requestTimeout: config.get<number>('requestTimeout', 10000),
      defaultPrerelease: config.get<boolean>('defaultPrerelease', false),
    };
  }

  public dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
