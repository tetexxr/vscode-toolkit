/**
 * Message handler for the NuGet Solution Overview panel.
 *
 * Two phases on the wire:
 *   1. "ready": send the installed-package list from a quick XML scan so the
 *      panel paints immediately.
 *   2. "load-versions": shell out to `dotnet list package --outdated` against
 *      the solution (or against each project when there's no .sln/.slnx) to
 *      pick up resolved/latest versions. Same code path `dotnet outdated` uses,
 *      so it inherits the local NuGet HTTP cache and `project.assets.json`
 *      reads for free — orders of magnitude faster than reimplementing the
 *      protocol from Node.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { OverviewWebviewMessage, OverviewExtensionMessage, OverviewProject, OverviewPackage } from './nuget-types'
import { getNugetConfig } from './nuget-config'
import { discoverProjectFiles, loadProject } from './nuget-project-loader'
import { listInstalledPackages, listOutdatedPackages, type DotnetListOutput } from './nuget-cli'
import { NugetTaskManager } from './nuget-task-manager'

const SOLUTION_GLOB = '**/*.{sln,slnx,slnf}'

/** Auxiliary files (relative to a project) that affect the resolved package set. */
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

export class NugetOverviewHandler implements vscode.Disposable {
  private taskManager: NugetTaskManager
  private disposables: vscode.Disposable[] = []
  private listCache: ListCache | null = null

  constructor(private webview: vscode.Webview) {
    this.taskManager = new NugetTaskManager()

    this.disposables.push(
      this.webview.onDidReceiveMessage((msg: OverviewWebviewMessage) => this.handleMessage(msg)),
      this.taskManager
    )
  }

  private async handleMessage(msg: OverviewWebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready':
          // Auto-trigger the full load on first open: paint installed list
          // from XML, then immediately enrich with `dotnet list` results.
          return await this.sendOverview(true)
        case 'load-versions':
          return await this.sendOverview(true)
        case 'update':
          return this.handleUpdate(msg.projectFsPath, msg.packageId, msg.version, msg.sourceUrl)
        case 'update-all':
          return this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.nuget'
          )
      }
    } catch (err) {
      this.post({ type: 'overview-error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async sendOverview(loadVersions: boolean): Promise<void> {
    const projects = await this.loadInstalled()

    // First paint with installed list only — no versions yet.
    this.post({ type: 'overview-data', projects, loading: loadVersions })

    if (!loadVersions) {
      return
    }

    const [installedResult, outdatedResult] = await Promise.all([
      this.runListPackageCached(false),
      this.runListPackageCached(true)
    ])
    applyListDataToProjects(projects, installedResult, outdatedResult)
    this.post({ type: 'overview-data', projects, loading: false })
  }

  /**
   * Cache layer over `runListPackage`. Invalidates whenever any csproj /
   * Directory.*.props / project.assets.json mtime changes, so editing a
   * package reference or running `dotnet add package` makes the next refresh
   * see fresh data while idle clicks come back from memory.
   */
  private async runListPackageCached(outdated: boolean): Promise<DotnetListOutput> {
    const fp = await this.fingerprint()
    if (!this.listCache || this.listCache.fingerprint !== fp) {
      this.listCache = { fingerprint: fp, installed: null, outdated: null }
    }
    const key = outdated ? 'outdated' : 'installed'
    if (this.listCache[key]) {
      return this.listCache[key]!
    }
    const result = await this.runListPackage(outdated)
    this.listCache[key] = result
    return result
  }

  private async fingerprint(): Promise<string> {
    const files = await this.fingerprintFiles()
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

  /** Collect every file whose change should invalidate the cached list output. */
  private async fingerprintFiles(): Promise<string[]> {
    const files = new Set<string>()
    const projectUris = await discoverProjectFiles()
    for (const uri of projectUris) {
      files.add(uri.fsPath)
      files.add(path.join(path.dirname(uri.fsPath), 'obj', 'project.assets.json'))
      for (const aux of findAuxiliaryFiles(uri.fsPath)) {
        files.add(aux)
      }
    }
    const solution = (await vscode.workspace.findFiles(SOLUTION_GLOB, undefined, 1))[0]
    if (solution) {
      files.add(solution.fsPath)
    }
    return [...files].sort()
  }

  /** Quick first paint: XML-parsed installed list. No network or msbuild. */
  private async loadInstalled(): Promise<OverviewProject[]> {
    const projectUris = await discoverProjectFiles()
    const projects: OverviewProject[] = []
    for (const uri of projectUris) {
      const project = await loadProject(uri)
      const overviewPkgs: OverviewPackage[] = project.packages.map(p => ({
        id: p.id,
        installedVersion: p.version,
        latestVersion: '',
        isOutdated: false
      }))
      projects.push({ name: project.name, fsPath: project.fsPath, packages: overviewPkgs })
    }
    projects.sort((a, b) => a.name.localeCompare(b.name))
    return projects
  }

  /**
   * Run `dotnet list package [--outdated]` once against the .sln/.slnx if one
   * exists, otherwise once per .csproj in parallel. Aggregates per-project
   * results into a single DotnetListOutput.
   */
  private async runListPackage(outdated: boolean): Promise<DotnetListOutput> {
    const config = getNugetConfig()
    const solution = (await vscode.workspace.findFiles(SOLUTION_GLOB, undefined, 1))[0]
    const runOne = (target: string): Promise<DotnetListOutput> =>
      outdated ? listOutdatedPackages(target, config.defaultPrerelease) : listInstalledPackages(target)

    if (solution) {
      return runOne(solution.fsPath)
    }

    const projectUris = await discoverProjectFiles()
    const perProject = await Promise.all(projectUris.map(uri => runOne(uri.fsPath).catch(() => null)))
    const combined: DotnetListOutput = { version: 1, parameters: outdated ? '--outdated' : '', projects: [] }
    for (const r of perProject) {
      if (r) {
        combined.projects.push(...r.projects)
      }
    }
    return combined
  }

  private handleUpdate(projectFsPath: string, packageId: string, version: string, sourceUrl: string): void {
    this.post({ type: 'task-started', packageId, action: 'update' })

    const task = NugetTaskManager.buildAddTask(projectFsPath, packageId, version, sourceUrl)
    this.taskManager.enqueue(task, async exitCode => {
      const success = exitCode === 0
      this.post({ type: 'task-finished', packageId, action: 'update', success })
      if (success) {
        await this.sendOverview(true)
      }
    })
  }

  private handleUpdateAll(
    packages: Array<{ projectFsPath: string; packageId: string; version: string; sourceUrl: string }>
  ): void {
    for (const pkg of packages) {
      this.post({ type: 'task-started', packageId: pkg.packageId, action: 'update' })

      const task = NugetTaskManager.buildAddTask(pkg.projectFsPath, pkg.packageId, pkg.version, pkg.sourceUrl)
      const isLast = pkg === packages[packages.length - 1]
      this.taskManager.enqueue(task, async exitCode => {
        const success = exitCode === 0
        this.post({ type: 'task-finished', packageId: pkg.packageId, action: 'update', success })
        if (isLast) {
          await this.sendOverview(true)
        }
      })
    }
  }

  private post(msg: OverviewExtensionMessage): void {
    this.webview.postMessage(msg)
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}

/**
 * Merge two `dotnet list package` results (full installed + outdated subset)
 * back into the OverviewProject list:
 *  - Match projects by fsPath.
 *  - For every installed package, set installedVersion / latestVersion /
 *    isOutdated. When the package isn't in the outdated set we treat it as
 *    up to date (latestVersion = resolvedVersion) so the UI shows "Yes".
 *  - If the JSON reports a package we don't have (e.g. it came from
 *    Directory.Packages.props which the XML loader doesn't see), append it.
 *  - Skip packages with a pinned `[x.y.z]` requested version — that's an
 *    explicit lock and matches `dotnet outdated`'s default behavior.
 */
function applyListDataToProjects(
  projects: OverviewProject[],
  installed: DotnetListOutput,
  outdated: DotnetListOutput
): void {
  const byPath = new Map<string, OverviewProject>()
  for (const p of projects) {
    byPath.set(normalizePath(p.fsPath), p)
  }

  // Build (projectPath → packageId → latestVersion) so we can look up "is this
  // outdated, and if so, what's the new version" while walking the installed list.
  const outdatedMap = new Map<string, Map<string, string>>()
  for (const dnProject of outdated.projects ?? []) {
    const key = normalizePath(dnProject.path)
    let pkgMap = outdatedMap.get(key)
    if (!pkgMap) {
      pkgMap = new Map<string, string>()
      outdatedMap.set(key, pkgMap)
    }
    for (const fw of dnProject.frameworks ?? []) {
      for (const pkg of fw.topLevelPackages ?? []) {
        if (pkg.latestVersion) {
          pkgMap.set(pkg.id, pkg.latestVersion)
        }
      }
    }
  }

  for (const dnProject of installed.projects ?? []) {
    const projectKey = normalizePath(dnProject.path)
    const project = byPath.get(projectKey)
    if (!project) {
      continue
    }
    const outdatedForProject = outdatedMap.get(projectKey)
    for (const fw of dnProject.frameworks ?? []) {
      for (const pkg of fw.topLevelPackages ?? []) {
        if (isPinned(pkg.requestedVersion)) {
          // Tag the existing entry (from the XML first paint) as pinned and
          // leave latestVersion / isOutdated alone — the user has explicitly
          // locked the version, so we don't push them to update.
          const entry = project.packages.find(p => p.id === pkg.id)
          if (entry) {
            entry.isPinned = true
          }
          continue
        }
        const latest = outdatedForProject?.get(pkg.id) ?? pkg.resolvedVersion
        upsertPackage(project, pkg.id, pkg.resolvedVersion, latest)
      }
    }
  }
}

function upsertPackage(project: OverviewProject, id: string, resolved: string, latest: string): void {
  let entry = project.packages.find(p => p.id === id)
  if (!entry) {
    entry = { id, installedVersion: resolved, latestVersion: '', isOutdated: false }
    project.packages.push(entry)
  }
  entry.installedVersion = resolved
  entry.latestVersion = latest
  entry.isOutdated = !!latest && latest !== resolved
}

function isPinned(requestedVersion: string | undefined): boolean {
  return !!requestedVersion && requestedVersion.startsWith('[')
}

function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase()
}

/** Walk every parent directory of `projectFsPath` and emit candidate aux-file paths. */
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
