import * as vscode from 'vscode'
import { execFile } from 'node:child_process'
import { parseLsof, parseNetstat, parsePs, parseTasklist, type ListeningProcess } from './kill-port-utils'
import { logError } from '../../utils/logger'

/**
 * Kill Port — lists the processes listening on TCP ports and lets you kill one
 * or several. The classic "EADDRINUSE :3000" rescue, without leaving the editor.
 */

const EXEC_TIMEOUT_MS = 15_000

function run(command: string, args: string[]): Promise<string> {
  return new Promise(resolve => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (_error, stdout) => {
      // A non-zero exit (e.g. lsof finding nothing) still leaves usable stdout;
      // an outright failure simply yields an empty string → "no ports found".
      resolve(String(stdout))
    })
  })
}

async function listListeningProcesses(): Promise<ListeningProcess[]> {
  if (process.platform === 'win32') {
    const [netstat, tasklist] = await Promise.all([
      run('netstat', ['-ano', '-p', 'TCP']),
      run('tasklist', ['/FO', 'CSV', '/NH'])
    ])
    const names = parseTasklist(tasklist)
    return parseNetstat(netstat).map(p => ({ ...p, command: names.get(p.pid) ?? p.command }))
  }
  const procs = parseLsof(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']))
  return enrichWithPs(procs)
}

/**
 * Augments each process with its full command line, owner, uptime and parent
 * pid via a single `ps` call. Best-effort: if `ps` is unavailable or its output
 * doesn't parse, the base listing is returned untouched.
 */
async function enrichWithPs(procs: ListeningProcess[]): Promise<ListeningProcess[]> {
  const pids = [...new Set(procs.map(p => p.pid))]
  if (pids.length === 0) {
    return procs
  }
  const details = parsePs(await run('ps', ['-p', pids.join(','), '-o', 'pid=,ppid=,user=,etime=,args=']))
  return procs.map(p => {
    const d = details.get(p.pid)
    return d ? { ...p, ppid: d.ppid, user: d.user, elapsed: d.elapsed, commandLine: d.commandLine } : p
  })
}

interface PortPickItem extends vscode.QuickPickItem {
  proc: ListeningProcess
}

function toPickItems(procs: ListeningProcess[]): PortPickItem[] {
  return [...procs]
    .sort((a, b) => a.port - b.port || a.pid - b.pid)
    .map(proc => {
      const meta = [
        proc.command,
        `pid ${proc.pid}`,
        proc.user,
        proc.elapsed && `up ${proc.elapsed}`,
        proc.ppid && `parent ${proc.ppid}`
      ].filter(Boolean)
      return {
        label: `$(plug) :${proc.port}`,
        description: meta.join(' · '),
        detail: proc.commandLine ?? proc.address,
        proc
      }
    })
}

function killPid(pid: number): { ok: boolean; error?: string } {
  try {
    process.kill(pid, 'SIGKILL')
    return { ok: true }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ESRCH') {
      // Already gone — nothing to do, treat as success.
      return { ok: true }
    }
    return { ok: false, error: code === 'EPERM' ? 'permission denied' : String(code ?? err) }
  }
}

export function registerKillPortCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.killPort', async () => {
      let procs: ListeningProcess[]
      try {
        procs = await listListeningProcesses()
      } catch (err) {
        logError('killPort', err)
        vscode.window.showErrorMessage('Toolkit: could not list listening ports.')
        return
      }

      if (procs.length === 0) {
        vscode.window.showInformationMessage('Toolkit: no listening TCP ports found.')
        return
      }

      const picks = await vscode.window.showQuickPick(toPickItems(procs), {
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Select the listening port(s) to kill (type a port number to filter)'
      })
      if (!picks || picks.length === 0) {
        return
      }

      const portList = [...new Set(picks.map(p => p.proc.port))].sort((a, b) => a - b).map(p => `:${p}`).join(', ')
      const confirm = await vscode.window.showWarningMessage(
        `Toolkit: kill ${picks.length === 1 ? 'the process' : `${picks.length} processes`} on ${portList}? This sends SIGKILL.`,
        { modal: true },
        'Kill'
      )
      if (confirm !== 'Kill') {
        return
      }

      // Several ports can share one pid — kill each pid once.
      const killed: number[] = []
      const failed: string[] = []
      for (const pid of new Set(picks.map(p => p.proc.pid))) {
        const result = killPid(pid)
        if (result.ok) {
          killed.push(pid)
        } else {
          failed.push(`pid ${pid} (${result.error})`)
        }
      }

      if (failed.length === 0) {
        vscode.window.showInformationMessage(`Toolkit: freed ${portList}.`)
      } else if (killed.length === 0) {
        vscode.window.showErrorMessage(`Toolkit: could not kill ${failed.join(', ')}.`)
      } else {
        vscode.window.showWarningMessage(`Toolkit: freed ${portList}, but failed on ${failed.join(', ')}.`)
      }
    })
  )
}
