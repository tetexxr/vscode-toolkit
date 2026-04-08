/**
 * IPC bridge between the webview and the extension host.
 * Handles all messages from the webview, orchestrates API calls,
 * npm CLI tasks, and project reloading.
 */

import * as vscode from 'vscode'
import { NpmWebviewMessage, NpmExtensionMessage, NpmPackageViewModel, NpmCategory } from './npm-types'
import { getNpmSources, getNpmConfig } from './npm-config'
import { stripVersionRange } from './npm-api'
import { isPrerelease } from '../../utils/semver'
import * as npmApi from './npm-api'
import { loadNpmProject, reloadNpmProject } from './npm-project-loader'
import { NpmTaskManager } from './npm-task-manager'

export class NpmMessageHandler implements vscode.Disposable {
  private taskManager: NpmTaskManager
  private projectFsPath: string
  private disposables: vscode.Disposable[] = []

  constructor(
    private webview: vscode.Webview,
    packageJsonUri: vscode.Uri
  ) {
    this.projectFsPath = packageJsonUri.fsPath
    this.taskManager = new NpmTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: NpmWebviewMessage) => this.handleMessage(msg)),
      this.taskManager,
      vscode.workspace.onDidChangeConfiguration(() => this.sendInit())
    )
  }

  private async handleMessage(msg: NpmWebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready':
          return await this.sendInit()
        case 'search':
          return await this.handleSearch(msg.query, msg.prerelease, msg.sourceIndex, msg.category, msg.skip)
        case 'select-package':
          return await this.handleSelectPackage(msg.packageName)
        case 'install':
          return await this.handleInstallOrUpdate(msg.packageName, msg.version, msg.devDependency, 'install')
        case 'update':
          return await this.handleInstallOrUpdate(msg.packageName, msg.version, msg.devDependency, 'update')
        case 'uninstall':
          return await this.handleUninstall(msg.packageName)
        case 'update-all':
          return await this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.npm'
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
    const project = await loadNpmProject(vscode.Uri.file(this.projectFsPath))
    const sources = getNpmSources()
    const config = getNpmConfig()
    this.post({ type: 'init', project, sources, config })
  }

  // ── Search ─────────────────────────────────────────────

  private async handleSearch(
    query: string,
    prerelease: boolean,
    sourceIndex: number,
    category: NpmCategory,
    skip: number = 0
  ): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNpmSources()
    const source = sources[sourceIndex] || sources[0]
    const timeout = getNpmConfig().requestTimeout

    const project = await reloadNpmProject(this.projectFsPath)
    let packages: NpmPackageViewModel[]
    let totalHits = 0

    if (category === 'browse') {
      // npm registry returns 400 for empty queries; show popular packages by default
      const searchQuery = query.trim() || 'popularity:gt:0.9'
      const result = await npmApi.searchNpmPackages(searchQuery, prerelease, source, timeout, skip)
      packages = result.packages
      totalHits = result.totalHits
    } else {
      packages = await npmApi.fetchInstalledNpmPackagesMetadata(project.packages, query, prerelease, source, timeout)
      totalHits = packages.length
    }

    // Mark installed status
    for (const pkg of packages) {
      const installed = project.packages.find((p) => p.name === pkg.name)
      pkg.isInstalled = !!installed
      pkg.installedVersionRange = installed?.versionRange || ''
      pkg.dependencyType = installed?.dependencyType || ''

      // Compare stripped version with latest
      const baseVersion = stripVersionRange(pkg.installedVersionRange)
      pkg.isOutdated = pkg.isInstalled && !!baseVersion && baseVersion !== pkg.version
    }

    // Filter for updates category
    if (category === 'updates') {
      packages = packages.filter((p) => p.isOutdated)
    }

    this.post({ type: 'packages', packages, category, totalHits, append: skip > 0 })
    this.post({ type: 'loading', loading: false })
  }

  // ── Package details ────────────────────────────────────

  private async handleSelectPackage(packageName: string): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNpmSources()
    const source = sources[0]
    const timeout = getNpmConfig().requestTimeout

    // Fetch full metadata + all versions
    const { pkg, versions } = await npmApi.fetchNpmPackageFullDetails(packageName, true, source, timeout)
    const project = await reloadNpmProject(this.projectFsPath)
    const installed = project.packages.find((p) => p.name === packageName)

    // Use latest stable version as the "main" display version
    const latestStable = versions.find((v) => !isPrerelease(v.version))
    if (latestStable) {
      pkg.version = latestStable.version
      pkg.deprecated = latestStable.deprecated
    }

    // Mark installed status
    pkg.isInstalled = !!installed
    pkg.installedVersionRange = installed?.versionRange || ''
    pkg.dependencyType = installed?.dependencyType || ''
    pkg.isOutdated = !!installed && stripVersionRange(installed.versionRange) !== pkg.version
    pkg.versions = versions

    this.post({ type: 'package-details', pkg })
    this.post({ type: 'loading', loading: false })
  }

  // ── Install / Update ───────────────────────────────────

  private async handleInstallOrUpdate(
    packageName: string,
    version: string,
    devDependency: boolean,
    action: string
  ): Promise<void> {
    this.post({ type: 'task-started', packageName, action })

    const project = await reloadNpmProject(this.projectFsPath)
    const task = NpmTaskManager.buildInstallTask(project.directoryPath, packageName, version, devDependency)

    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0
      if (success) {
        const updatedProject = await reloadNpmProject(this.projectFsPath)
        this.post({ type: 'project-updated', project: updatedProject })
      }
      this.post({ type: 'task-finished', packageName, action, success })
    })
  }

  // ── Uninstall ──────────────────────────────────────────

  private async handleUninstall(packageName: string): Promise<void> {
    this.post({ type: 'task-started', packageName, action: 'uninstall' })

    const project = await reloadNpmProject(this.projectFsPath)
    const task = NpmTaskManager.buildUninstallTask(project.directoryPath, packageName)

    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0
      if (success) {
        const updatedProject = await reloadNpmProject(this.projectFsPath)
        this.post({ type: 'project-updated', project: updatedProject })
      }
      this.post({ type: 'task-finished', packageName, action: 'uninstall', success })
    })
  }

  // ── Update all ─────────────────────────────────────────

  private async handleUpdateAll(packages: Array<{ name: string; version: string; devDependency: boolean }>): Promise<void> {
    for (const pkg of packages) {
      await this.handleInstallOrUpdate(pkg.name, pkg.version, pkg.devDependency, 'update')
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private post(msg: NpmExtensionMessage): void {
    this.webview.postMessage(msg)
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
