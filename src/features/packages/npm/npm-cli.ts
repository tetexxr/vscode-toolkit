/**
 * Thin wrapper around `<pm> outdated` per project. Same idea as
 * `nuget-cli.ts`: lets us inherit each package manager's local registry
 * handling (auth, scopes, lockfile resolution) and dodge the per-package HTTP
 * loop the old code did.
 *
 * Notes:
 *  - `npm outdated` exits with code 1 when it finds outdated packages — not
 *    an error. We accept exit codes 0 and 1 and only reject other failures.
 *    pnpm and yarn behave similarly (yarn classic uses exit 0 even when
 *    outdated entries exist).
 *  - npm works even without `node_modules` installed (`current` is absent in
 *    that case). pnpm and yarn need the project to be installed.
 *  - yarn berry (v2+) has no built-in `outdated` command, so for those projects
 *    we shell out to `npx npm-check-updates --jsonUpgraded` instead, which is
 *    package-manager agnostic and reads package.json directly.
 */

import { spawn } from 'child_process'
import type { PackageManager } from './npm-types'
import { detectYarnIsBerry } from './npm-commands'

const DEFAULT_TIMEOUT_MS = 60_000

/** Common shape we hand back to the rest of the extension, regardless of source CLI. */
export interface NpmOutdatedEntry {
  /** Version currently in node_modules. Missing when the project isn't installed. */
  current?: string
  /** Maximum version satisfying the manifest range. */
  wanted: string
  /** Newest published version on the registry. */
  latest: string
  /** Name of the project that depends on the package (workspace root or sub-package). */
  dependent: string
  location?: string
}

/** Run the outdated command appropriate for the given package manager. */
export function runOutdated(
  cwd: string,
  packageManager: PackageManager,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Record<string, NpmOutdatedEntry>> {
  if (packageManager === 'pnpm') {
    return runOne(cwd, 'pnpm', ['outdated', '--format', 'json'], timeoutMs, parsePnpmOutdatedOutput)
  }
  if (packageManager === 'yarn') {
    // Berry (v2+) has no `yarn outdated`; fall back to npm-check-updates, which
    // works for any manifest. Classic yarn keeps its native command.
    if (detectYarnIsBerry(cwd)) {
      return runOne(cwd, 'npx', ['--yes', 'npm-check-updates', '--jsonUpgraded'], timeoutMs, parseNcuOutdatedOutput)
    }
    return runOne(cwd, 'yarn', ['outdated', '--json'], timeoutMs, parseYarnOutdatedOutput)
  }
  return runOne(cwd, 'npm', ['outdated', '--json'], timeoutMs, parseNpmOutdatedOutput)
}

/** Back-compat alias kept until callers migrate fully. */
export function runNpmOutdated(cwd: string, timeoutMs?: number): Promise<Record<string, NpmOutdatedEntry>> {
  return runOutdated(cwd, 'npm', timeoutMs)
}

function runOne(
  cwd: string,
  cmd: string,
  args: string[],
  timeoutMs: number,
  parse: (stdout: string) => Record<string, NpmOutdatedEntry>
): Promise<Record<string, NpmOutdatedEntry>> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (b: Buffer) => stdout.push(b))
    child.stderr.on('data', (b: Buffer) => stderr.push(b))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} outdated timed out after ${timeoutMs}ms in ${cwd}`))
    }, timeoutMs)

    child.on('error', err => {
      clearTimeout(timer)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`${cmd} CLI not found on PATH. Install it to enable the ${cmd} overview.`))
        return
      }
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timer)
      // npm / pnpm / yarn outdated all return 1 when something is outdated.
      // yarn berry returns 0 with an error message because it doesn't have
      // the command at all — let the parser surface that as a friendly error.
      if (code !== 0 && code !== 1) {
        const stderrText = Buffer.concat(stderr).toString('utf-8').trim()
        const stdoutText = Buffer.concat(stdout).toString('utf-8').trim()
        reject(new Error(`${cmd} outdated exited with code ${code}: ${stderrText || stdoutText || '(no output)'}`))
        return
      }
      try {
        resolve(parse(Buffer.concat(stdout).toString('utf-8')))
      } catch (err) {
        reject(new Error(`Failed to parse ${cmd} outdated output: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
  })
}

// ── Parsers (exported for tests) ──────────────────────────

/**
 * Some npm versions print warnings before the JSON body. Skip everything up to
 * the first `{` so JSON.parse never sees noise.
 */
export function parseNpmOutdatedOutput(stdoutText: string): Record<string, NpmOutdatedEntry> {
  const trimmed = stdoutText.trim()
  if (trimmed === '') {
    return {}
  }
  const start = trimmed.indexOf('{')
  if (start < 0) {
    throw new Error('no JSON body in output')
  }
  return JSON.parse(trimmed.slice(start)) as Record<string, NpmOutdatedEntry>
}

/**
 * pnpm emits the same shape npm does (object keyed by package name), just with
 * slightly different field names — `wanted` may be missing when the manifest
 * range itself already accepts `latest`.
 */
export function parsePnpmOutdatedOutput(stdoutText: string): Record<string, NpmOutdatedEntry> {
  const trimmed = stdoutText.trim()
  if (trimmed === '') {
    return {}
  }
  const start = trimmed.indexOf('{')
  if (start < 0) {
    throw new Error('no JSON body in output')
  }
  const raw = JSON.parse(trimmed.slice(start)) as Record<
    string,
    { current?: string; latest?: string; wanted?: string; dependencyType?: string }
  >
  const result: Record<string, NpmOutdatedEntry> = {}
  for (const [name, entry] of Object.entries(raw)) {
    if (!entry.latest) {
      continue
    }
    result[name] = {
      current: entry.current,
      wanted: entry.wanted ?? entry.latest,
      latest: entry.latest,
      dependent: '' // pnpm doesn't surface this
    }
  }
  return result
}

/**
 * yarn v1 emits ND-JSON. The interesting line has `type: "table"` and a body
 * with columns [Package, Current, Wanted, Latest, Package Type, URL]. yarn
 * berry (v2+) has no `outdated` command at all — we surface a clear error so
 * the user knows to use a different tool.
 */
export function parseYarnOutdatedOutput(stdoutText: string): Record<string, NpmOutdatedEntry> {
  const trimmed = stdoutText.trim()
  if (trimmed === '') {
    return {}
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  let table: { head?: string[]; body?: string[][] } | null = null
  let sawBerryHint = false

  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      // Skip lines that aren't JSON (yarn v1 sometimes prints prologue text).
      continue
    }
    if (!parsed || typeof parsed !== 'object') {
      continue
    }
    const msg = parsed as { type?: string; data?: unknown }
    if (msg.type === 'table' && msg.data && typeof msg.data === 'object') {
      table = msg.data
      break
    }
    if (msg.type === 'error' && typeof msg.data === 'string' && /not a recognised command/i.test(msg.data)) {
      sawBerryHint = true
    }
  }

  if (!table) {
    if (sawBerryHint) {
      throw new Error('yarn berry (v2+) does not support `yarn outdated`. Install a plugin or use `npx npm-check-updates`.')
    }
    return {}
  }

  const head = (table.head || []).map(h => h.toLowerCase())
  const colCurrent = head.indexOf('current')
  const colWanted = head.indexOf('wanted')
  const colLatest = head.indexOf('latest')
  const colPackage = 0
  if (colLatest < 0) {
    throw new Error('yarn outdated table is missing a Latest column')
  }

  const result: Record<string, NpmOutdatedEntry> = {}
  for (const row of table.body || []) {
    const name = row[colPackage]
    const latest = row[colLatest]
    if (!name || !latest) {
      continue
    }
    result[name] = {
      current: colCurrent >= 0 ? row[colCurrent] : undefined,
      wanted: colWanted >= 0 ? row[colWanted] : latest,
      latest,
      dependent: ''
    }
  }
  return result
}

/**
 * `npm-check-updates --jsonUpgraded` prints a flat `{ name: targetRange }` map of
 * every dependency whose latest exceeds its manifest range (keeping the original
 * operator, e.g. `"^8.5.2"` or `"8.5.2"` for a pinned dep). We don't get the
 * installed version, so `current` is left undefined — the merge logic then
 * compares `latest` against the manifest range. When nothing is upgradable ncu
 * prints `{}`.
 */
export function parseNcuOutdatedOutput(stdoutText: string): Record<string, NpmOutdatedEntry> {
  const trimmed = stdoutText.trim()
  if (trimmed === '') {
    return {}
  }
  const start = trimmed.indexOf('{')
  if (start < 0) {
    return {}
  }
  const raw = JSON.parse(trimmed.slice(start)) as Record<string, string>
  const result: Record<string, NpmOutdatedEntry> = {}
  for (const [name, target] of Object.entries(raw)) {
    const latest = stripRangeOperator(target)
    if (!latest) {
      continue
    }
    result[name] = { wanted: latest, latest, dependent: '' }
  }
  return result
}

/** Drop a leading semver operator (`^`, `~`, `>=`, …) so a range becomes a bare version. */
function stripRangeOperator(range: string): string {
  if (!range || range === '*' || range === 'latest') {
    return ''
  }
  return range.replace(/^[~^>=<\s]+/, '').trim()
}
