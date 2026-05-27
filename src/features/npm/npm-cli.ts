/**
 * Thin wrapper around `npm outdated --json` per project. Same idea as
 * `nuget-cli.ts`: lets us inherit npm's local registry handling (auth,
 * scopes, package-lock resolution) and dodge the per-package HTTP loop the
 * old code did.
 *
 * Notes:
 *  - `npm outdated` exits with code 1 when it finds outdated packages. That
 *    is NOT an error — we accept exit codes 0 and 1 and only reject other
 *    failures.
 *  - The command works even without `node_modules` installed; in that case
 *    `current` is absent and we fall back to `wanted` (the version that
 *    satisfies the package.json range).
 */

import { spawn } from 'child_process'

const DEFAULT_TIMEOUT_MS = 60_000

/** Shape emitted by `npm outdated --json` (one entry per outdated dependency). */
export interface NpmOutdatedEntry {
  /** Version currently in node_modules. Missing when the project isn't installed. */
  current?: string
  /** Maximum version satisfying the package.json range. */
  wanted: string
  /** Newest published version on the registry. */
  latest: string
  /** Name of the project that depends on the package (workspace root or sub-package). */
  dependent: string
  location?: string
}

/** Run `npm outdated --json` inside `cwd`. Returns the parsed JSON map. */
export function runNpmOutdated(cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, NpmOutdatedEntry>> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['outdated', '--json'], { cwd })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (b: Buffer) => stdout.push(b))
    child.stderr.on('data', (b: Buffer) => stderr.push(b))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`npm outdated timed out after ${timeoutMs}ms in ${cwd}`))
    }, timeoutMs)

    child.on('error', err => {
      clearTimeout(timer)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('npm CLI not found on PATH. Install Node.js to enable the npm overview.'))
        return
      }
      reject(new Error(`Failed to spawn npm: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timer)
      // npm outdated returns 1 when something is outdated — treat as success.
      if (code !== 0 && code !== 1) {
        const stderrText = Buffer.concat(stderr).toString('utf-8').trim()
        const stdoutText = Buffer.concat(stdout).toString('utf-8').trim()
        reject(new Error(`npm outdated exited with code ${code}: ${stderrText || stdoutText || '(no output)'}`))
        return
      }
      try {
        resolve(parseNpmOutdatedOutput(Buffer.concat(stdout).toString('utf-8')))
      } catch (err) {
        reject(new Error(`Failed to parse npm outdated JSON: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
  })
}

/**
 * Some npm versions print warnings before the JSON body. Skip everything up to
 * the first `{` so JSON.parse never sees noise.
 *
 * Exported for testing.
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
