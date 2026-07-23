/**
 * Sequential task queue for dotnet CLI operations.
 * Ensures add/remove commands run one at a time to prevent conflicts.
 */

import * as vscode from 'vscode'
import * as path from 'path'

const TASK_NAME = 'toolkit-nuget'

export type TaskFinishedCallback = (exitCode: number | undefined) => void | Promise<void>

interface QueueEntry {
  task: vscode.Task
  callback: TaskFinishedCallback
}

export class NugetTaskManager implements vscode.Disposable {
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

  /** Queue a dotnet CLI task. The callback fires when that task completes. */
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

  static buildAddTask(projectPath: string, packageId: string, version: string, sourceUrl: string): vscode.Task {
    const cwd = path.dirname(projectPath)
    const args: (string | vscode.ShellQuotedString)[] = [
      'add',
      { value: projectPath, quoting: vscode.ShellQuoting.Strong },
      'package',
      packageId,
      '-v',
      version,
      ...(sourceUrl ? ['-s', sourceUrl] : []),
      '--interactive'
    ]

    return new vscode.Task(
      { type: 'dotnet', task: 'add' },
      vscode.TaskScope.Workspace,
      TASK_NAME,
      'dotnet',
      new vscode.ShellExecution('dotnet', args, { cwd })
    )
  }

  static buildRemoveTask(projectPath: string, packageId: string): vscode.Task {
    const cwd = path.dirname(projectPath)
    const args: (string | vscode.ShellQuotedString)[] = [
      'remove',
      { value: projectPath, quoting: vscode.ShellQuoting.Strong },
      'package',
      packageId
    ]

    return new vscode.Task(
      { type: 'dotnet', task: 'remove' },
      vscode.TaskScope.Workspace,
      TASK_NAME,
      'dotnet',
      new vscode.ShellExecution('dotnet', args, { cwd })
    )
  }
}
