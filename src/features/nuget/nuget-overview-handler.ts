/**
 * Message handler for the NuGet Solution Overview panel.
 * Discovers all projects, loads installed packages, and resolves latest versions.
 */

import * as vscode from 'vscode'
import { OverviewWebviewMessage, OverviewExtensionMessage, OverviewProject, OverviewPackage } from './nuget-types'
import { getNugetSources, getNugetConfig } from './nuget-config'
import * as nugetApi from './nuget-api'
import { discoverProjectFiles, loadProject } from './nuget-project-loader'
import { NugetTaskManager } from './nuget-task-manager'

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
          return await this.handleUpdate(msg.projectFsPath, msg.packageId, msg.version, msg.sourceUrl)
        case 'update-all':
          return await this.handleUpdateAll(msg.packages)
        case 'open-settings':
          return void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:tete.vscode-toolkit toolkit.nuget'
          )
      }
    } catch (err: any) {
      this.post({ type: 'overview-error', message: err.message || String(err) })
    }
  }

  private async sendOverview(loadVersions: boolean): Promise<void> {
    const projectUris = await discoverProjectFiles()
    const source = getNugetSources()[0]
    const config = getNugetConfig()

    // Load all projects and their installed packages
    const projects: OverviewProject[] = []
    for (const uri of projectUris) {
      const project = await loadProject(uri)
      const overviewPkgs: OverviewPackage[] = project.packages.map((p) => ({
        id: p.id,
        installedVersion: p.version,
        latestVersion: '',
        isOutdated: false
      }))
      projects.push({ name: project.name, fsPath: project.fsPath, packages: overviewPkgs })
    }

    // Sort projects alphabetically
    projects.sort((a, b) => a.name.localeCompare(b.name))

    // Send initial data immediately (without versions)
    this.post({ type: 'overview-data', projects, loading: loadVersions })

    if (!loadVersions) {
      return
    }

    // Resolve latest versions for all unique package IDs
    const uniqueIds = new Set<string>()
    for (const proj of projects) {
      for (const pkg of proj.packages) {
        uniqueIds.add(pkg.id)
      }
    }

    const latestMap = new Map<string, string>()
    await Promise.allSettled(
      [...uniqueIds].map(async (id) => {
        const metadata = await nugetApi.fetchInstalledPackagesMetadata(
          [{ id, version: '' }],
          '',
          config.defaultPrerelease,
          source,
          config.requestTimeout
        )
        if (metadata.length > 0) {
          latestMap.set(id, metadata[0].version)
        }
      })
    )

    // Update projects with resolved versions
    for (const proj of projects) {
      for (const pkg of proj.packages) {
        const latest = latestMap.get(pkg.id)
        if (latest) {
          pkg.latestVersion = latest
          pkg.isOutdated = pkg.installedVersion !== latest
        }
      }
    }

    this.post({ type: 'overview-data', projects, loading: false })
  }

  private async handleUpdate(
    projectFsPath: string,
    packageId: string,
    version: string,
    sourceUrl: string
  ): Promise<void> {
    this.post({ type: 'task-started', packageId, action: 'update' })

    const task = NugetTaskManager.buildAddTask(projectFsPath, packageId, version, sourceUrl)
    this.taskManager.enqueue(task, async (exitCode) => {
      const success = exitCode === 0
      this.post({ type: 'task-finished', packageId, action: 'update', success })
      if (success) {
        await this.sendOverview(true)
      }
    })
  }

  private async handleUpdateAll(
    packages: Array<{ projectFsPath: string; packageId: string; version: string; sourceUrl: string }>
  ): Promise<void> {
    for (const pkg of packages) {
      this.post({ type: 'task-started', packageId: pkg.packageId, action: 'update' })

      const task = NugetTaskManager.buildAddTask(pkg.projectFsPath, pkg.packageId, pkg.version, pkg.sourceUrl)
      const isLast = pkg === packages[packages.length - 1]
      this.taskManager.enqueue(task, async (exitCode) => {
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
