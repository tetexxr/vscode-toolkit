/**
 * Sequential task queue for npm/yarn/pnpm CLI operations.
 * Ensures install/uninstall commands run one at a time to prevent conflicts.
 */

import * as vscode from 'vscode'
import type { DependencyType, PackageManager } from './npm-types'
import { buildInstallArgs, buildUninstallArgs } from './npm-commands'

const TASK_NAME = 'toolkit-npm'

export type TaskFinishedCallback = (exitCode: number | undefined) => void | Promise<void>

interface QueueEntry {
  task: vscode.Task
  callback: TaskFinishedCallback
}

export class NpmTaskManager implements vscode.Disposable {
  private queue: QueueEntry[] = []
  private running = false
  private current: vscode.TaskExecution | undefined
  private disposable: vscode.Disposable

  constructor() {
    this.disposable = vscode.tasks.onDidEndTaskProcess(e => {
      // Correlate by execution identity: several manager instances (project
      // panel, overview panel) listen to this global event, and all of their
      // tasks share the same name — the name alone would match foreign tasks.
      if (!this.current || e.execution !== this.current) {
        return
      }

      this.current = undefined
      const entry = this.queue.shift()
      this.running = false

      if (entry) {
        void entry.callback(e.exitCode)
      }

      this.runNext()
    })
  }

  /** Queue a CLI task. The callback fires when that task completes. */
  public enqueue(task: vscode.Task, callback: TaskFinishedCallback): void {
    this.queue.push({ task, callback })
    this.runNext()
  }

  private runNext(): void {
    if (this.running || this.queue.length === 0) {
      return
    }
    this.running = true
    vscode.tasks.executeTask(this.queue[0].task).then(
      execution => {
        this.current = execution
      },
      () => {
        // The task failed to start: report it and keep the queue moving.
        const entry = this.queue.shift()
        this.running = false
        this.current = undefined
        if (entry) {
          void entry.callback(undefined)
        }
        this.runNext()
      }
    )
  }

  public dispose(): void {
    this.disposable.dispose()
    this.queue = []
    this.current = undefined
  }

  // ── Task factory methods ───────────────────────────────

  static buildInstallTask(
    projectDir: string,
    packageName: string,
    version: string,
    dependencyType: DependencyType,
    pm: PackageManager
  ): vscode.Task {
    const { cmd, args } = buildInstallArgs(pm, packageName, version, dependencyType)

    return new vscode.Task(
      { type: 'npm', task: 'install' },
      vscode.TaskScope.Workspace,
      TASK_NAME,
      pm,
      new vscode.ShellExecution(cmd, args, { cwd: projectDir })
    )
  }

  static buildUninstallTask(projectDir: string, packageName: string, pm: PackageManager): vscode.Task {
    const { cmd, args } = buildUninstallArgs(pm, packageName)

    return new vscode.Task(
      { type: 'npm', task: 'uninstall' },
      vscode.TaskScope.Workspace,
      TASK_NAME,
      pm,
      new vscode.ShellExecution(cmd, args, { cwd: projectDir })
    )
  }
}
