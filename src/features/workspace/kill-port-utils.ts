/**
 * Pure parsers for the Kill Port feature.
 *
 * Listing the processes that hold a TCP port is platform-specific:
 *   - macOS / Linux: `lsof -nP -iTCP -sTCP:LISTEN -F pcn` (machine-readable)
 *   - Windows:       `netstat -ano -p TCP` + `tasklist /FO CSV /NH` for names
 *
 * The shell-running and UI live in kill-port.ts; everything here is pure so it
 * can be unit-tested without spawning processes.
 */

export interface ListeningProcess {
  port: number
  pid: number
  /** Short process/command name, when known (lsof's COMMAND, truncated by the OS). */
  command?: string
  /** The raw local address the port was bound to (e.g. `*:3000`, `[::1]:8080`). */
  address?: string
  /** Full command line with arguments, when enriched via `ps`. */
  commandLine?: string
  /** Owning user, when enriched via `ps`. */
  user?: string
  /** Human-friendly uptime (e.g. `2h 15m`), when enriched via `ps`. */
  elapsed?: string
  /** Parent process id, when enriched via `ps`. */
  ppid?: number
}

/** Per-process details pulled from `ps`, keyed by pid in {@link parsePs}. */
export interface ProcessDetail {
  pid: number
  ppid?: number
  user?: string
  elapsed?: string
  commandLine?: string
}

/** Extracts the port from a local address like `*:3000`, `127.0.0.1:8080`, `[::1]:3000`. */
export function portFromAddress(address: string): number | null {
  // Listening sockets have no `->peer`, but guard anyway.
  const local = address.split('->')[0]
  const idx = local.lastIndexOf(':')
  if (idx === -1) {
    return null
  }
  const port = parseInt(local.slice(idx + 1).trim(), 10)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
}

/**
 * Parses `lsof -F pcn` output. Each process is introduced by a `p<pid>` line,
 * its `c<command>` follows, and every bound socket emits an `n<address>` line.
 * A process listening on both IPv4 and IPv6 yields two `n` lines for the same
 * port, so we dedupe by pid+port.
 */
export function parseLsof(stdout: string): ListeningProcess[] {
  const result: ListeningProcess[] = []
  const seen = new Set<string>()
  let pid = NaN
  let command: string | undefined

  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue
    }
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      pid = parseInt(value, 10)
      command = undefined
    } else if (tag === 'c') {
      command = value
    } else if (tag === 'n') {
      const port = portFromAddress(value)
      if (port == null || !Number.isInteger(pid)) {
        continue
      }
      const key = `${pid}-${port}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push({ pid, command, port, address: value })
    }
  }
  return result
}

/**
 * Parses `netstat -ano` output, keeping only TCP rows in the LISTENING state.
 * Columns are: Proto, Local Address, Foreign Address, State, PID.
 */
export function parseNetstat(stdout: string): ListeningProcess[] {
  const result: ListeningProcess[] = []
  const seen = new Set<string>()

  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!/^TCP\b/i.test(line)) {
      continue
    }
    const cols = line.split(/\s+/)
    if (cols.length < 5 || !/^LISTENING$/i.test(cols[3])) {
      continue
    }
    const port = portFromAddress(cols[1])
    const pid = parseInt(cols[cols.length - 1], 10)
    if (port == null || !Number.isInteger(pid)) {
      continue
    }
    const key = `${pid}-${port}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push({ pid, port, address: cols[1] })
  }
  return result
}

/**
 * Turns a `ps`-style elapsed time (`[[dd-]hh:]mm:ss`) into a compact, two-unit
 * label like `1d 2h`, `2h 15m`, `15m 30s`, or `30s`.
 */
export function humanizeElapsed(etime: string): string | undefined {
  const m = etime.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/)
  if (!m) {
    return undefined
  }
  const days = parseInt(m[1] ?? '0', 10)
  const hours = parseInt(m[2] ?? '0', 10)
  const mins = parseInt(m[3], 10)
  const secs = parseInt(m[4], 10)
  if (days) {
    return `${days}d ${hours}h`
  }
  if (hours) {
    return `${hours}h ${mins}m`
  }
  if (mins) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * Parses `ps -o pid=,ppid=,user=,etime=,args=` output into a pid → detail map.
 * The command line is the last, space-bearing field, so we split off exactly
 * the four fixed leading columns and keep the rest verbatim.
 */
export function parsePs(stdout: string): Map<number, ProcessDetail> {
  const map = new Map<number, ProcessDetail>()
  for (const raw of stdout.split(/\r?\n/)) {
    const m = raw.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/)
    if (!m) {
      continue
    }
    const pid = parseInt(m[1], 10)
    map.set(pid, {
      pid,
      ppid: parseInt(m[2], 10),
      user: m[3],
      elapsed: humanizeElapsed(m[4]),
      commandLine: m[5].trim()
    })
  }
  return map
}

/**
 * Parses `tasklist /FO CSV /NH` into a pid → image-name map, used to label the
 * pids that netstat reports on Windows. CSV rows look like:
 *   "node.exe","12345","Console","1","45,678 K"
 */
export function parseTasklist(stdout: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      continue
    }
    const cells = line.split('","').map(c => c.replace(/^"|"$/g, ''))
    const pid = parseInt(cells[1], 10)
    if (cells.length < 2 || !Number.isInteger(pid)) {
      continue
    }
    map.set(pid, cells[0])
  }
  return map
}
