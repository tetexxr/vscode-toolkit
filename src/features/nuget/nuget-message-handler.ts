/**
 * IPC bridge between the webview and the extension host.
 * Handles all messages from the webview, orchestrates API calls,
 * dotnet CLI tasks, and project reloading.
 */

import * as vscode from 'vscode'
import { WebviewMessage, ExtensionMessage, PackageViewModel, Category } from './nuget-types'
import { getNugetSources, getNugetConfig } from './nuget-config'
import { isPrerelease } from '../../utils/semver'
import * as nugetApi from './nuget-api'
import { loadProject, reloadProject } from './nuget-project-loader'
import { NugetTaskManager } from './nuget-task-manager'

export class NugetMessageHandler implements vscode.Disposable {
  private taskManager: NugetTaskManager
  private projectFsPath: string
  private disposables: vscode.Disposable[] = []

  constructor(
    private webview: vscode.Webview,
    projectFileUri: vscode.Uri,
  ) {
    this.projectFsPath = projectFileUri.fsPath
    this.taskManager = new NugetTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg)),
      this.taskManager,
      vscode.workspace.onDidChangeConfiguration(() => {
        nugetApi.clearEndpointCache()
        this.sendInit()
      }),
    )
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready':
          return await this.sendInit()
        case 'search':
          return await this.handleSearch(msg.query, msg.prerelease, msg.sourceIndex, msg.category, msg.skip)
        case 'select-package':
          return await this.handleSelectPackage(msg.packageId)
        case 'install':
          return await this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'install')
        case 'update':
          return await this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'update')
        case 'uninstall':
          return await this.handleUninstall(msg.packageId)
        case 'update-all':
          return await this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.nuget',
          )
        case 'open-url':
          return void vscode.env.openExternal(vscode.Uri.parse(msg.url))
      }
    } catch (err: any) {
      this.post({ type: 'error', message: err.message || String(err) })
      this.post({ type: 'loading', loading: false })
    }
  }

  // ── Init ───────────────────────────────────────────────

  private async sendInit(): Promise<void> {
    const project = await loadProject(vscode.Uri.file(this.projectFsPath))
    const sources = getNugetSources()
    const config = getNugetConfig()
    this.post({ type: 'init', project, sources, config })
  }

  // ── Search ─────────────────────────────────────────────

  private async handleSearch(
    query: string,
    prerelease: boolean,
    sourceIndex: number,
    category: Category,
    skip: number = 0,
  ): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNugetSources()
    const source = sources[sourceIndex] || sources[0]
    const timeout = getNugetConfig().requestTimeout

    const project = await reloadProject(this.projectFsPath)
    let packages: PackageViewModel[]
    let totalHits = 0

    if (category === 'browse') {
      const result = await nugetApi.searchPackages(query, prerelease, source, timeout, skip)
      packages = result.packages
      totalHits = result.totalHits
    } else {
      packages = await nugetApi.fetchInstalledPackagesMetadata(project.packages, query, prerelease, source, timeout)
      totalHits = packages.length
    }

    // Mark installed status
    for (const pkg of packages) {
      const installed = project.packages.find((p) => p.id === pkg.id)
      pkg.isInstalled = !!installed
      pkg.installedVersion = installed?.version || ''
      pkg.isOutdated = pkg.isInstalled && pkg.installedVersion !== pkg.version
    }

    // Filter for updates category
    if (category === 'updates') {
      packages = packages.filter((p) => p.isOutdated)
    }

    this.post({ type: 'packages', packages, category, totalHits, append: skip > 0 })
    this.post({ type: 'loading', loading: false })
  }

  // ── Package details ────────────────────────────────────

  private async handleSelectPackage(packageId: string): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNugetSources()
    const source = sources[0]
    const timeout = getNugetConfig().requestTimeout

    // Fetch all versions (including prerelease) for the dropdown
    const allVersions = await nugetApi.fetchPackageVersions(packageId, true, source, timeout)
    const project = await reloadProject(this.projectFsPath)
    const installed = project.packages.find((p) => p.id === packageId)

    // Use latest stable version as the "main" version for display
    const latestStable = allVersions.find((v) => !isPrerelease(v.version))
    const latest = latestStable || allVersions[0]

    if (latest) {
      const pkg: PackageViewModel = {
        id: packageId,
        version: latest.version,
        description: latest.description || '',
        authors: Array.isArray(latest.authors) ? latest.authors.join(', ') : latest.authors || '',
        iconUrl: latest.iconUrl || '',
        verified: false,
        isInstalled: !!installed,
        installedVersion: installed?.version || '',
        isOutdated: !!installed && installed.version !== latest.version,
        sourceUrl: source.url,
        versions: allVersions,
      }
      this.post({ type: 'package-details', pkg })
    }

    this.post({ type: 'loading', loading: false })
  }

  // ── Install / Update ───────────────────────────────────

  private async handleInstallOrUpdate(
    packageId: string,
    version: string,
    sourceUrl: string,
    action: string,
  ): Promise<void> {
    this.post({ type: 'task-started', packageId, action })

    const task = NugetTaskManager.buildAddTask(this.projectFsPath, packageId, version, sourceUrl)
    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0
      if (success) {
        const project = await reloadProject(this.projectFsPath)
        this.post({ type: 'project-updated', project })
      }
      this.post({ type: 'task-finished', packageId, action, success })
    })
  }

  // ── Uninstall ──────────────────────────────────────────

  private async handleUninstall(packageId: string): Promise<void> {
    this.post({ type: 'task-started', packageId, action: 'uninstall' })

    const task = NugetTaskManager.buildRemoveTask(this.projectFsPath, packageId)
    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0
      if (success) {
        const project = await reloadProject(this.projectFsPath)
        this.post({ type: 'project-updated', project })
      }
      this.post({ type: 'task-finished', packageId, action: 'uninstall', success })
    })
  }

  // ── Update all ─────────────────────────────────────────

  private async handleUpdateAll(packages: Array<{ id: string; version: string; sourceUrl: string }>): Promise<void> {
    for (const pkg of packages) {
      await this.handleInstallOrUpdate(pkg.id, pkg.version, pkg.sourceUrl, 'update')
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private post(msg: ExtensionMessage): void {
    this.webview.postMessage(msg)
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
