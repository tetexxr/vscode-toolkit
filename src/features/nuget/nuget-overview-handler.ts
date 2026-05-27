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
import type { OverviewWebviewMessage, OverviewExtensionMessage, OverviewProject, OverviewPackage } from './nuget-types'
import { getNugetConfig } from './nuget-config'
import { discoverProjectFiles, loadProject } from './nuget-project-loader'
import { listOutdatedPackages, type DotnetListOutput } from './nuget-cli'
import { NugetTaskManager } from './nuget-task-manager'

const SOLUTION_GLOB = '**/*.{sln,slnx,slnf}'

export class NugetOverviewHandler implements vscode.Disposable {
  private taskManager: NugetTaskManager
  private disposables: vscode.Disposable[] = []

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
          return await this.sendOverview(false)
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

    const result = await this.runOutdated()
    applyOutdatedToProjects(projects, result)
    this.post({ type: 'overview-data', projects, loading: false })
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
   * Run `dotnet list package --outdated` once against the .sln/.slnx if one
   * exists, otherwise once per .csproj in parallel. Aggregates results into a
   * single DotnetListOutput.
   */
  private async runOutdated(): Promise<DotnetListOutput> {
    const config = getNugetConfig()
    const solution = (await vscode.workspace.findFiles(SOLUTION_GLOB, undefined, 1))[0]

    if (solution) {
      return listOutdatedPackages(solution.fsPath, config.defaultPrerelease)
    }

    const projectUris = await discoverProjectFiles()
    const perProject = await Promise.all(
      projectUris.map(uri => listOutdatedPackages(uri.fsPath, config.defaultPrerelease).catch(() => null))
    )
    const combined: DotnetListOutput = { version: 1, parameters: '--outdated', projects: [] }
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
 * Merge a `dotnet list --outdated` result back into the OverviewProject list:
 *  - Match projects by fsPath.
 *  - For each outdated package, update installedVersion / latestVersion /
 *    isOutdated on the corresponding package.
 *  - If the outdated JSON reports a package we don't have (e.g. it came from
 *    Directory.Packages.props which the XML loader doesn't see), append it.
 *  - Skip packages with a pinned `[x.y.z]` requested version — that's an
 *    explicit lock and matches `dotnet outdated`'s default behavior.
 */
function applyOutdatedToProjects(projects: OverviewProject[], result: DotnetListOutput): void {
  const byPath = new Map<string, OverviewProject>()
  for (const p of projects) {
    byPath.set(normalizePath(p.fsPath), p)
  }

  for (const dnProject of result.projects ?? []) {
    const project = byPath.get(normalizePath(dnProject.path))
    if (!project) {
      continue
    }
    for (const fw of dnProject.frameworks ?? []) {
      for (const pkg of fw.topLevelPackages ?? []) {
        if (isPinned(pkg.requestedVersion)) {
          continue
        }
        upsertPackage(project, pkg.id, pkg.resolvedVersion, pkg.latestVersion ?? '')
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
