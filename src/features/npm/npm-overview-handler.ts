/**
 * Message handler for the npm Workspace Overview panel.
 * Discovers all projects, loads installed packages, and resolves latest versions.
 */

import * as vscode from 'vscode'
import {
  NpmOverviewWebviewMessage,
  NpmOverviewExtensionMessage,
  NpmOverviewProject,
  NpmOverviewPackage
} from './npm-types'
import { getNpmSources, getNpmConfig } from './npm-config'
import { stripVersionRange } from './npm-api'
import * as npmApi from './npm-api'
import { discoverPackageJsonFiles, loadNpmProject } from './npm-project-loader'
import { NpmTaskManager } from './npm-task-manager'

export class NpmOverviewHandler implements vscode.Disposable {
  private taskManager: NpmTaskManager
  private disposables: vscode.Disposable[] = []

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
          return await this.sendOverview(false)
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
    } catch (err: any) {
      this.post({ type: 'overview-error', message: err.message || String(err) })
    }
  }

  private async sendOverview(loadVersions: boolean): Promise<void> {
    const projectUris = await discoverPackageJsonFiles()
    const source = getNpmSources()[0]
    const config = getNpmConfig()

    // Load all projects and their installed packages
    const projects: NpmOverviewProject[] = []
    for (const uri of projectUris) {
      const project = await loadNpmProject(uri)
      const overviewPkgs: NpmOverviewPackage[] = project.packages.map((p) => ({
        name: p.name,
        installedVersionRange: p.versionRange,
        latestVersion: '',
        dependencyType: p.dependencyType,
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

    // Resolve latest versions for all unique package names
    const uniqueNames = new Set<string>()
    for (const proj of projects) {
      for (const pkg of proj.packages) {
        uniqueNames.add(pkg.name)
      }
    }

    const latestMap = new Map<string, string>()
    await Promise.allSettled(
      [...uniqueNames].map(async (name) => {
        const metadata = await npmApi.fetchInstalledNpmPackagesMetadata(
          [{ name, versionRange: '', dependencyType: 'dependencies' }],
          '',
          config.defaultPrerelease,
          source,
          config.requestTimeout
        )
        if (metadata.length > 0) {
          latestMap.set(name, metadata[0].version)
        }
      })
    )

    // Update projects with resolved versions
    for (const proj of projects) {
      for (const pkg of proj.packages) {
        const latest = latestMap.get(pkg.name)
        if (latest) {
          pkg.latestVersion = latest
          const baseVersion = stripVersionRange(pkg.installedVersionRange)
          pkg.isOutdated = !!baseVersion && baseVersion !== latest
        }
      }
    }

    this.post({ type: 'overview-data', projects, loading: false })
  }

  private async handleUpdate(
    projectFsPath: string,
    packageName: string,
    version: string,
    devDependency: boolean
  ): Promise<void> {
    this.post({ type: 'task-started', packageName, action: 'update' })

    const project = await loadNpmProject(vscode.Uri.file(projectFsPath))
    const existing = project.packages.find((p) => p.name === packageName)
    const isDev = existing ? existing.dependencyType === 'devDependencies' : devDependency
    const task = NpmTaskManager.buildInstallTask(
      project.directoryPath,
      packageName,
      version,
      isDev,
      project.packageManager
    )

    this.taskManager.enqueue(task, async (exitCode) => {
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
      const existing = project.packages.find((p) => p.name === pkg.packageName)
      const isDev = existing ? existing.dependencyType === 'devDependencies' : pkg.devDependency
      const task = NpmTaskManager.buildInstallTask(
        project.directoryPath,
        pkg.packageName,
        pkg.version,
        isDev,
        project.packageManager
      )
      const isLast = pkg === packages[packages.length - 1]

      this.taskManager.enqueue(task, async (exitCode) => {
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
