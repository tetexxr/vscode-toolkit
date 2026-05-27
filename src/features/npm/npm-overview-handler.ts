/**
 * Message handler for the npm Workspace Overview panel.
 *
 * Two phases on the wire:
 *   1. "ready" — quick first paint from each project's package.json so the
 *      panel renders immediately.
 *   2. "load-versions" — shell out to `npm outdated --json` per project to
 *      pick up resolved versions and what's outdated, then merge.
 *
 * Same architecture as the NuGet overview: lets us inherit npm's local
 * registry handling (auth, scopes, package-lock resolution) for free.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import type {
  NpmOverviewWebviewMessage,
  NpmOverviewExtensionMessage,
  NpmOverviewProject,
  NpmOverviewPackage
} from './npm-types'
import { discoverPackageJsonFiles, loadNpmProject } from './npm-project-loader'
import { detectPackageManager } from './npm-commands'
import { runOutdated, type NpmOutdatedEntry } from './npm-cli'
import { applyOutdatedToProject } from './npm-utils'
import { NpmTaskManager } from './npm-task-manager'
import { logInfo } from '../../utils/logger'

const LOCKFILE_NAMES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json']

interface ProjectCacheEntry {
  fingerprint: string
  outdated: Record<string, NpmOutdatedEntry>
}

export class NpmOverviewHandler implements vscode.Disposable {
  private taskManager: NpmTaskManager
  private disposables: vscode.Disposable[] = []
  /** projectFsPath → cached `npm outdated` output, keyed by package.json + lockfile mtimes. */
  private outdatedCache = new Map<string, ProjectCacheEntry>()

  constructor(private webview: vscode.Webview) {
    this.taskManager = new NpmTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: NpmOverviewWebviewMessage) => this.handleMessage(msg)),
      this.taskManager
    )
  }

  private async handleMessage(msg: NpmOverviewWebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready':
          // Auto-trigger the full load like the NuGet overview does.
          return await this.sendOverview(true)
        case 'load-versions':
          return await this.sendOverview(true)
        case 'update':
          return await this.handleUpdate(msg.projectFsPath, msg.packageName, msg.version, msg.devDependency)
        case 'update-all':
          return await this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.npm'
          )
      }
    } catch (err) {
      this.post({ type: 'overview-error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async sendOverview(loadVersions: boolean): Promise<void> {
    const projectUris = await discoverPackageJsonFiles()
    const projects = await this.loadInstalled(projectUris)

    // First paint: installed list with no versions yet.
    this.post({ type: 'overview-data', projects, loading: loadVersions })

    if (!loadVersions) {
      return
    }

    // Phase 2: run `npm outdated` for every project in parallel and merge.
    const t0 = performance.now()
    await Promise.all(
      projects.map(async project => {
        const outdated = await this.runOutdatedCached(project.fsPath).catch(() => ({}) as Record<string, NpmOutdatedEntry>)
        applyOutdatedToProject(project, outdated)
      })
    )
    logInfo('npm-overview', `outdated check completed in ${Math.round(performance.now() - t0)}ms for ${projects.length} project(s)`)

    this.post({ type: 'overview-data', projects, loading: false })
  }

  private async loadInstalled(projectUris: vscode.Uri[]): Promise<NpmOverviewProject[]> {
    const projects: NpmOverviewProject[] = []
    for (const uri of projectUris) {
      const project = await loadNpmProject(uri)
      const overviewPkgs: NpmOverviewPackage[] = project.packages.map(p => ({
        name: p.name,
        installedVersionRange: p.versionRange,
        latestVersion: '',
        dependencyType: p.dependencyType,
        isOutdated: false
      }))
      projects.push({ name: project.name, fsPath: project.fsPath, packages: overviewPkgs })
    }
    projects.sort((a, b) => a.name.localeCompare(b.name))
    return projects
  }

  /**
   * Cache `npm outdated` output per project, invalidated whenever the
   * package.json or any known lockfile mtime changes. Repeated Refresh clicks
   * are instant unless something actually changed.
   */
  private async runOutdatedCached(packageJsonFsPath: string): Promise<Record<string, NpmOutdatedEntry>> {
    const fp = await this.fingerprint(packageJsonFsPath)
    const cached = this.outdatedCache.get(packageJsonFsPath)
    if (cached && cached.fingerprint === fp) {
      return cached.outdated
    }
    const cwd = path.dirname(packageJsonFsPath)
    const outdated = await runOutdated(cwd, detectPackageManager(cwd))
    this.outdatedCache.set(packageJsonFsPath, { fingerprint: fp, outdated })
    return outdated
  }

  private async fingerprint(packageJsonFsPath: string): Promise<string> {
    const dir = path.dirname(packageJsonFsPath)
    const files = [packageJsonFsPath, ...LOCKFILE_NAMES.map(n => path.join(dir, n))]
    const entries = await Promise.all(
      files.map(async f => {
        try {
          const s = await fs.stat(f)
          return `${f}:${s.mtimeMs}:${s.size}`
        } catch {
          return `${f}:missing`
        }
      })
    )
    return entries.join('|')
  }

  private async handleUpdate(
    projectFsPath: string,
    packageName: string,
    version: string,
    devDependency: boolean
  ): Promise<void> {
    this.post({ type: 'task-started', packageName, action: 'update' })

    const project = await loadNpmProject(vscode.Uri.file(projectFsPath))
    const existing = project.packages.find(p => p.name === packageName)
    const isDev = existing ? existing.dependencyType === 'devDependencies' : devDependency
    const task = NpmTaskManager.buildInstallTask(
      project.directoryPath,
      packageName,
      version,
      isDev,
      project.packageManager
    )

    this.taskManager.enqueue(task, async exitCode => {
      const success = exitCode === 0
      this.post({ type: 'task-finished', packageName, action: 'update', success })
      if (success) {
        await this.sendOverview(true)
      }
    })
  }

  private async handleUpdateAll(
    packages: Array<{ projectFsPath: string; packageName: string; version: string; devDependency: boolean }>
  ): Promise<void> {
    for (const pkg of packages) {
      this.post({ type: 'task-started', packageName: pkg.packageName, action: 'update' })

      const project = await loadNpmProject(vscode.Uri.file(pkg.projectFsPath))
      const existing = project.packages.find(p => p.name === pkg.packageName)
      const isDev = existing ? existing.dependencyType === 'devDependencies' : pkg.devDependency
      const task = NpmTaskManager.buildInstallTask(
        project.directoryPath,
        pkg.packageName,
        pkg.version,
        isDev,
        project.packageManager
      )
      const isLast = pkg === packages[packages.length - 1]

      this.taskManager.enqueue(task, async exitCode => {
        const success = exitCode === 0
        this.post({ type: 'task-finished', packageName: pkg.packageName, action: 'update', success })
        if (isLast) {
          await this.sendOverview(true)
        }
      })
    }
  }

  private post(msg: NpmOverviewExtensionMessage): void {
    this.webview.postMessage(msg)
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
