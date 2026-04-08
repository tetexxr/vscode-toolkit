/**
 * Sequential task queue for npm/yarn/pnpm CLI operations.
 * Ensures install/uninstall commands run one at a time to prevent conflicts.
 */

import * as vscode from 'vscode'
import { PackageManager } from './npm-types'
import { buildInstallArgs, buildUninstallArgs } from './npm-commands'

const TASK_NAME = 'toolkit-npm'

export type TaskFinishedCallback = (exitCode: number | undefined) => void

interface QueueEntry {
  task: vscode.Task
  callback: TaskFinishedCallback
}

export class NpmTaskManager implements vscode.Disposable {
  private queue: QueueEntry[] = []
  private running = false
  private disposable: vscode.Disposable

  constructor() {
    this.disposable = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution.task.name !== TASK_NAME) {
        return
      }

      const entry = this.queue.shift()
      this.running = false

      if (entry) {
        entry.callback(e.exitCode)
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
    vscode.tasks.executeTask(this.queue[0].task)
  }

  public dispose(): void {
    this.disposable.dispose()
    this.queue = []
  }

  // ── Task factory methods ───────────────────────────────

  static buildInstallTask(
    projectDir: string,
    packageName: string,
    version: string,
    devDependency: boolean,
    pm: PackageManager
  ): vscode.Task {
    const { cmd, args } = buildInstallArgs(pm, packageName, version, devDependency)

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
