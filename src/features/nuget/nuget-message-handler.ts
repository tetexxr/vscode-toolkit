/**
 * IPC bridge between the webview and the extension host.
 * Handles all messages from the webview, orchestrates API calls,
 * dotnet CLI tasks, and project reloading.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { WebviewMessage, ExtensionMessage, PackageViewModel, Category } from './nuget-types'
import { getNugetSources, getNugetConfig } from './nuget-config'
import { isPrerelease } from '../../utils/semver'
import * as nugetApi from './nuget-api'
import { loadProject, reloadProject } from './nuget-project-loader'
import { listInstalledPackages, listOutdatedPackages, type DotnetListOutput } from './nuget-cli'
import { NugetTaskManager } from './nuget-task-manager'
import type { PackageSource } from './nuget-types'

const PARENT_AUX_FILES = [
  'Directory.Packages.props',
  'Directory.Build.props',
  'Directory.Build.targets',
  'NuGet.config',
  'nuget.config'
]

interface ListCache {
  fingerprint: string
  installed: DotnetListOutput | null
  outdated: DotnetListOutput | null
}

/** Subset of PackageViewModel that Search API can fill in for an installed row. */
interface PackageMetadata {
  description: string
  authors: string
  iconUrl: string
  totalDownloads?: number
  verified: boolean
}

export class NugetMessageHandler implements vscode.Disposable {
  private taskManager: NugetTaskManager
  private projectFsPath: string
  private disposables: vscode.Disposable[] = []
  private listCache: ListCache | null = null
  /** id → metadata cache, lifetime = this panel session. Negative entries (no match) stored as `null`. */
  private metadataCache = new Map<string, PackageMetadata | null>()
  /** Monotonic counter so a slow background enrichment can't overwrite a newer search. */
  private currentSearchId = 0

  constructor(
    private webview: vscode.Webview,
    projectFileUri: vscode.Uri
  ) {
    this.projectFsPath = projectFileUri.fsPath
    this.taskManager = new NugetTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg)),
      this.taskManager,
      vscode.workspace.onDidChangeConfiguration(() => {
        nugetApi.clearEndpointCache()
        this.listCache = null
        void this.sendInit()
      })
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
          return this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'install')
        case 'update':
          return this.handleInstallOrUpdate(msg.packageId, msg.version, msg.sourceUrl, 'update')
        case 'uninstall':
          return this.handleUninstall(msg.packageId)
        case 'update-all':
          return this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.nuget'
          )
        case 'open-url':
          return void vscode.env.openExternal(vscode.Uri.parse(msg.url))
      }
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
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
    skip: number = 0
  ): Promise<void> {
    this.post({ type: 'loading', loading: true })

    let packages: PackageViewModel[]
    let totalHits = 0

    if (category === 'browse') {
      // Browse keeps the Search API: that's what surfaces the description /
      // icon / author / downloads that make package discovery useful.
      const sources = getNugetSources()
      const source = sources[sourceIndex] || sources[0]
      const timeout = getNugetConfig().requestTimeout
      const project = await reloadProject(this.projectFsPath)

      const result = await nugetApi.searchPackages(query, prerelease, source, timeout, skip)
      packages = result.packages
      totalHits = result.totalHits

      for (const pkg of packages) {
        const installed = project.packages.find(p => p.id === pkg.id)
        pkg.isInstalled = !!installed
        pkg.installedVersion = installed?.version || ''
        pkg.isOutdated = pkg.isInstalled && pkg.installedVersion !== pkg.version
      }
    } else {
      // Installed / Updates: two-phase render.
      //   1) Fast paint with versions only (dotnet list).
      //   2) Background enrichment with description / icon / author / downloads
      //      via Search API — re-rendered when ready.
      const searchId = ++this.currentSearchId
      const sources = getNugetSources()
      const source = sources[sourceIndex] || sources[0]
      const all = await this.buildInstalledViewModels(prerelease, source?.url ?? '')

      // Apply cached metadata immediately so revisits to the same project show
      // icons without any flicker.
      this.applyCachedMetadata(all)

      packages = filterPackages(all, query, category)
      this.post({ type: 'packages', packages, category, totalHits: packages.length, append: skip > 0 })
      this.post({ type: 'loading', loading: false })

      // Phase 2: enrich any rows whose metadata we don't already have. Fired
      // and forgotten — staleness is guarded by `searchId`.
      void this.enrichInBackground(searchId, all, source, query, category, skip)
      return
    }

    this.post({ type: 'packages', packages, category, totalHits, append: skip > 0 })
    this.post({ type: 'loading', loading: false })
  }

  /**
   * Background enrichment for the Installed / Updates tabs. Sends a fresh
   * `packages` message only if the user hasn't moved on to a newer search.
   * Posts a `metadata-loading` toggle so the webview can show / hide its
   * "loading details" status bar.
   */
  private async enrichInBackground(
    searchId: number,
    all: PackageViewModel[],
    source: PackageSource | undefined,
    query: string,
    category: Category,
    skip: number
  ): Promise<void> {
    const needsFetch = all.some(vm => !this.metadataCache.has(vm.id))
    if (!needsFetch) {
      return
    }
    if (searchId === this.currentSearchId) {
      this.post({ type: 'metadata-loading', loading: true })
    }
    try {
      await this.enrichWithSearchMetadata(all, source)
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

  /** Paint cached metadata onto fresh view models without hitting the network. */
  private applyCachedMetadata(viewModels: PackageViewModel[]): void {
    for (const vm of viewModels) {
      const meta = this.metadataCache.get(vm.id)
      if (meta) {
        vm.description = meta.description
        vm.authors = meta.authors
        vm.iconUrl = meta.iconUrl
        vm.totalDownloads = meta.totalDownloads
        vm.verified = meta.verified
      }
    }
  }

  /**
   * Build view models for the Installed / Updates tabs from `dotnet list`
   * output. No description / icon / author / downloads here — the panel of
   * package details (handleSelectPackage) still hits Registration for that
   * when the user clicks a row.
   */
  private async buildInstalledViewModels(prerelease: boolean, sourceUrl: string): Promise<PackageViewModel[]> {
    const [installed, outdated] = await Promise.all([this.runListCached(false, prerelease), this.runListCached(true, prerelease)])

    // Build per-id maps so multi-targeting projects don't show the same package twice.
    const installedMap = new Map<string, { resolved: string; isPinned: boolean }>()
    for (const proj of installed.projects ?? []) {
      for (const fw of proj.frameworks ?? []) {
        for (const pkg of fw.topLevelPackages ?? []) {
          if (!installedMap.has(pkg.id)) {
            installedMap.set(pkg.id, {
              resolved: pkg.resolvedVersion,
              isPinned: !!pkg.requestedVersion && pkg.requestedVersion.startsWith('[')
            })
          }
        }
      }
    }

    const outdatedMap = new Map<string, string>()
    for (const proj of outdated.projects ?? []) {
      for (const fw of proj.frameworks ?? []) {
        for (const pkg of fw.topLevelPackages ?? []) {
          if (pkg.latestVersion) {
            outdatedMap.set(pkg.id, pkg.latestVersion)
          }
        }
      }
    }

    const result: PackageViewModel[] = []
    for (const [id, info] of installedMap) {
      const latest = info.isPinned ? info.resolved : (outdatedMap.get(id) ?? info.resolved)
      result.push({
        id,
        version: latest,
        description: '',
        authors: '',
        iconUrl: '',
        totalDownloads: undefined,
        verified: false,
        isInstalled: true,
        installedVersion: info.resolved,
        isOutdated: !info.isPinned && latest !== info.resolved,
        sourceUrl
      })
    }
    result.sort((a, b) => a.id.localeCompare(b.id))
    return result
  }

  /**
   * Hit the Search API once per package id whose metadata we haven't cached
   * yet, and stash the results in `metadataCache`. Does not mutate the view
   * models — callers reapply via `applyCachedMetadata`.
   */
  private async enrichWithSearchMetadata(viewModels: PackageViewModel[], source: PackageSource | undefined): Promise<void> {
    if (!source || viewModels.length === 0) {
      return
    }
    const timeout = getNugetConfig().requestTimeout
    const toFetch = viewModels.filter(vm => !this.metadataCache.has(vm.id))
    if (toFetch.length === 0) {
      return
    }

    await Promise.allSettled(
      toFetch.map(async vm => {
        try {
          const result = await nugetApi.searchPackages(vm.id, false, source, timeout)
          const exact = result.packages.find(p => p.id.toLowerCase() === vm.id.toLowerCase())
          this.metadataCache.set(
            vm.id,
            exact
              ? {
                  description: exact.description,
                  authors: exact.authors,
                  iconUrl: exact.iconUrl,
                  totalDownloads: exact.totalDownloads,
                  verified: exact.verified
                }
              : null
          )
        } catch {
          this.metadataCache.set(vm.id, null)
        }
      })
    )
  }

  /** Cache `dotnet list` results by file mtime so repeated tab switches are instant. */
  private async runListCached(outdated: boolean, prerelease: boolean): Promise<DotnetListOutput> {
    const fp = (await this.fingerprint()) + '|prerelease=' + prerelease
    if (!this.listCache || this.listCache.fingerprint !== fp) {
      this.listCache = { fingerprint: fp, installed: null, outdated: null }
    }
    const key = outdated ? 'outdated' : 'installed'
    if (this.listCache[key]) {
      return this.listCache[key]!
    }
    const result = outdated
      ? await listOutdatedPackages(this.projectFsPath, prerelease)
      : await listInstalledPackages(this.projectFsPath)
    this.listCache[key] = result
    return result
  }

  private async fingerprint(): Promise<string> {
    const files = [
      this.projectFsPath,
      path.join(path.dirname(this.projectFsPath), 'obj', 'project.assets.json'),
      ...findAuxiliaryFiles(this.projectFsPath)
    ]
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

  private async handleSelectPackage(packageId: string): Promise<void> {
    this.post({ type: 'loading', loading: true })

    const sources = getNugetSources()
    const source = sources[0]
    const timeout = getNugetConfig().requestTimeout

    // Fetch all versions (including prerelease) for the dropdown
    const allVersions = await nugetApi.fetchPackageVersions(packageId, true, source, timeout)
    const project = await reloadProject(this.projectFsPath)
    const installed = project.packages.find(p => p.id === packageId)

    // Use latest stable version as the "main" version for display
    const latestStable = allVersions.find(v => !isPrerelease(v.version))
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
        versions: allVersions
      }
      this.post({ type: 'package-details', pkg })
    }

    this.post({ type: 'loading', loading: false })
  }

  // ── Install / Update ───────────────────────────────────

  private handleInstallOrUpdate(packageId: string, version: string, sourceUrl: string, action: string): void {
    this.post({ type: 'task-started', packageId, action })

    const task = NugetTaskManager.buildAddTask(this.projectFsPath, packageId, version, sourceUrl)
    this.taskManager.enqueue(task, async exitCode => {
      const success = exitCode === 0
      if (success) {
        const project = await reloadProject(this.projectFsPath)
        this.post({ type: 'project-updated', project })
      }
      this.post({ type: 'task-finished', packageId, action, success })
    })
  }

  // ── Uninstall ──────────────────────────────────────────

  private handleUninstall(packageId: string): void {
    this.post({ type: 'task-started', packageId, action: 'uninstall' })

    const task = NugetTaskManager.buildRemoveTask(this.projectFsPath, packageId)
    this.taskManager.enqueue(task, async exitCode => {
      const success = exitCode === 0
      if (success) {
        const project = await reloadProject(this.projectFsPath)
        this.post({ type: 'project-updated', project })
      }
      this.post({ type: 'task-finished', packageId, action: 'uninstall', success })
    })
  }

  // ── Update all ─────────────────────────────────────────

  private handleUpdateAll(packages: Array<{ id: string; version: string; sourceUrl: string }>): void {
    for (const pkg of packages) {
      this.handleInstallOrUpdate(pkg.id, pkg.version, pkg.sourceUrl, 'update')
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

/** Apply the user's text filter and the active tab (installed vs updates) to a view-model list. */
function filterPackages(all: PackageViewModel[], query: string, category: Category): PackageViewModel[] {
  let packages = all
  const trimmed = query.trim().toLowerCase()
  if (trimmed) {
    packages = packages.filter(p => p.id.toLowerCase().includes(trimmed))
  }
  if (category === 'updates') {
    packages = packages.filter(p => p.isOutdated)
  }
  return packages
}

/** Walk every parent directory of `projectFsPath` collecting aux-file paths. */
function findAuxiliaryFiles(projectFsPath: string): string[] {
  const found: string[] = []
  let dir = path.dirname(projectFsPath)
  const root = path.parse(dir).root
  while (dir && dir !== root) {
    for (const name of PARENT_AUX_FILES) {
      found.push(path.join(dir, name))
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return found
}
