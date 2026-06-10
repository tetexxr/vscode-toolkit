/**
 * IPC bridge between the webview and the extension host.
 *
 * For Installed / Updates the data comes from `npm outdated --json` plus the
 * project's package.json (fast, accurate) and metadata (description, author,
 * downloads) is filled in afterwards via the Search API. Browse keeps using
 * the Search endpoint directly. Same architecture as the NuGet per-project
 * panel.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import type {
  NpmWebviewMessage,
  NpmExtensionMessage,
  NpmPackageViewModel,
  NpmCategory,
  NpmPackageSource
} from './npm-types'
import { getNpmSources, getNpmConfig } from './npm-config'
import { stripVersionRange } from './npm-api'
import { isPrerelease } from '../../utils/semver'
import * as npmApi from './npm-api'
import { loadNpmProject, reloadNpmProject } from './npm-project-loader'
import { runOutdated, type NpmOutdatedEntry } from './npm-cli'
import { detectPackageManager } from './npm-commands'
import { buildInstalledViewModels, filterPackages } from './npm-utils'
import { NpmTaskManager } from './npm-task-manager'

const LOCKFILE_NAMES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json']

interface OutdatedCache {
  fingerprint: string
  outdated: Record<string, NpmOutdatedEntry>
}

interface PackageMetadata {
  description: string
  author: string
  homepage: string
  license: string
  keywords: string[]
  weeklyDownloads?: number
}

export class NpmMessageHandler implements vscode.Disposable {
  private taskManager: NpmTaskManager
  private projectFsPath: string
  private disposables: vscode.Disposable[] = []
  private outdatedCache: OutdatedCache | null = null
  /** name → metadata cache for the Search-API enrichment pass. */
  private metadataCache = new Map<string, PackageMetadata | null>()
  /** Monotonic counter so a stale background enrichment can't overwrite a newer search. */
  private currentSearchId = 0

  constructor(
    private webview: vscode.Webview,
    packageJsonUri: vscode.Uri
  ) {
    this.projectFsPath = packageJsonUri.fsPath
    this.taskManager = new NpmTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: NpmWebviewMessage) => this.handleMessage(msg)),
      this.taskManager,
      vscode.workspace.onDidChangeConfiguration(() => {
        this.outdatedCache = null
        void this.sendInit()
      })
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
        case 'open-url': {
          // URLs come from registry metadata: only allow web schemes.
          const target = vscode.Uri.parse(msg.url)
          if (target.scheme === 'http' || target.scheme === 'https') {
            void vscode.env.openExternal(target)
          }
          return
        }
      }
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
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
    let packages: NpmPackageViewModel[]
    let totalHits = 0

    if (category === 'browse') {
      // Browse keeps the Search API: that's what surfaces the description /
      // weekly downloads / author that make package discovery useful.
      const project = await reloadNpmProject(this.projectFsPath)
      // npm registry returns 400 for empty queries; show popular packages by default.
      const searchQuery = query.trim() || 'popularity:gt:0.9'
      const result = await npmApi.searchNpmPackages(searchQuery, prerelease, source, timeout, skip)
      packages = result.packages
      totalHits = result.totalHits

      for (const pkg of packages) {
        const installed = project.packages.find(p => p.name === pkg.name)
        pkg.isInstalled = !!installed
        pkg.installedVersionRange = installed?.versionRange || ''
        pkg.dependencyType = installed?.dependencyType || ''
        const baseVersion = stripVersionRange(pkg.installedVersionRange)
        pkg.isOutdated = pkg.isInstalled && !!baseVersion && baseVersion !== pkg.version
      }

      this.post({ type: 'packages', packages, category, totalHits, append: skip > 0 })
      this.post({ type: 'loading', loading: false })
      return
    }

    // Installed / Updates: two-phase render.
    //   1) Fast paint with versions only (from package.json + npm outdated).
    //   2) Background enrichment with description / downloads / author via
    //      the Search API — re-rendered when ready.
    const searchId = ++this.currentSearchId
    const project = await reloadNpmProject(this.projectFsPath)
    const outdated = await this.runOutdatedCached().catch(() => ({}) as Record<string, NpmOutdatedEntry>)
    const all = buildInstalledViewModels(project.packages, outdated, source?.url ?? '')
    this.applyCachedMetadata(all)

    packages = filterPackages(all, query, category)
    this.post({ type: 'packages', packages, category, totalHits: packages.length, append: skip > 0 })
    this.post({ type: 'loading', loading: false })

    void this.enrichInBackground(searchId, all, source, query, category, skip)
  }

  /**
   * Background metadata fetch via the Search API. Posts a fresh `packages`
   * message only if the user hasn't moved on to a newer search.
   */
  private async enrichInBackground(
    searchId: number,
    all: NpmPackageViewModel[],
    source: NpmPackageSource | undefined,
    query: string,
    category: NpmCategory,
    skip: number
  ): Promise<void> {
    const needsFetch = all.some(vm => !this.metadataCache.has(vm.name))
    if (!needsFetch) {
      return
    }
    if (searchId === this.currentSearchId) {
      this.post({ type: 'metadata-loading', loading: true })
    }
    try {
      await this.fetchMetadataViaSearch(all, source)
    } catch {
      if (searchId === this.currentSearchId) {
        this.post({ type: 'metadata-loading', loading: false })
      }
      return
    }
    if (searchId !== this.currentSearchId) {
      return
    }
    this.applyCachedMetadata(all)
    const packages = filterPackages(all, query, category)
    this.post({ type: 'packages', packages, category, totalHits: packages.length, append: skip > 0 })
    this.post({ type: 'metadata-loading', loading: false })
  }

  /** Hit the Search API once per package name whose metadata we haven't cached yet. */
  private async fetchMetadataViaSearch(
    viewModels: NpmPackageViewModel[],
    source: NpmPackageSource | undefined
  ): Promise<void> {
    if (!source || viewModels.length === 0) {
      return
    }
    const timeout = getNpmConfig().requestTimeout
    const toFetch = viewModels.filter(vm => !this.metadataCache.has(vm.name))
    if (toFetch.length === 0) {
      return
    }

    await Promise.allSettled(
      toFetch.map(async vm => {
        try {
          const result = await npmApi.searchNpmPackages(vm.name, false, source, timeout)
          const exact = result.packages.find(p => p.name.toLowerCase() === vm.name.toLowerCase())
          this.metadataCache.set(
            vm.name,
            exact
              ? {
                  description: exact.description,
                  author: exact.author,
                  homepage: exact.homepage,
                  license: exact.license,
                  keywords: exact.keywords,
                  weeklyDownloads: exact.weeklyDownloads
                }
              : null
          )
        } catch {
          this.metadataCache.set(vm.name, null)
        }
      })
    )
  }

  /** Paint cached metadata onto fresh view models. */
  private applyCachedMetadata(viewModels: NpmPackageViewModel[]): void {
    for (const vm of viewModels) {
      const meta = this.metadataCache.get(vm.name)
      if (meta) {
        vm.description = meta.description
        vm.author = meta.author
        vm.homepage = meta.homepage
        vm.license = meta.license
        vm.keywords = meta.keywords
        vm.weeklyDownloads = meta.weeklyDownloads
      }
    }
  }

  /** Cache `npm outdated` output by file mtime so repeated tab switches are instant. */
  private async runOutdatedCached(): Promise<Record<string, NpmOutdatedEntry>> {
    const fp = await this.fingerprint()
    if (this.outdatedCache && this.outdatedCache.fingerprint === fp) {
      return this.outdatedCache.outdated
    }
    const cwd = path.dirname(this.projectFsPath)
    const outdated = await runOutdated(cwd, detectPackageManager(cwd))
    this.outdatedCache = { fingerprint: fp, outdated }
    return outdated
  }

  private async fingerprint(): Promise<string> {
    const dir = path.dirname(this.projectFsPath)
    const files = [this.projectFsPath, ...LOCKFILE_NAMES.map(n => path.join(dir, n))]
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

  // ── Package details ────────────────────────────────────

  private async handleSelectPackage(packageName: string): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNpmSources()
    const source = sources[0]
    const timeout = getNpmConfig().requestTimeout

    // Fetch full metadata + all versions
    const { pkg, versions } = await npmApi.fetchNpmPackageFullDetails(packageName, true, source, timeout)
    const project = await reloadNpmProject(this.projectFsPath)
    const installed = project.packages.find(p => p.name === packageName)

    // Use latest stable version as the "main" display version
    const latestStable = versions.find(v => !isPrerelease(v.version))
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
      if (success) {
        this.outdatedCache = null
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
    const task = NpmTaskManager.buildUninstallTask(project.directoryPath, packageName, project.packageManager)

    this.taskManager.enqueue(task, async exitCode => {
      const success = exitCode === 0
      if (success) {
        this.outdatedCache = null
        const updatedProject = await reloadNpmProject(this.projectFsPath)
        this.post({ type: 'project-updated', project: updatedProject })
      }
      this.post({ type: 'task-finished', packageName, action: 'uninstall', success })
    })
  }

  // ── Update all ─────────────────────────────────────────

  private async handleUpdateAll(
    packages: Array<{ name: string; version: string; devDependency: boolean }>
  ): Promise<void> {
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

