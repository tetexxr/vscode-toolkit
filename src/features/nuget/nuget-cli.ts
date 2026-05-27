/**
 * Thin wrapper around `dotnet list package` that returns the parsed JSON
 * output. This is what powers the Solution Overview.
 *
 * Why this exists: reimplementing the NuGet protocol from Node was the wrong
 * call — it cannot match the speed of a tool that reuses the local
 * `~/.nuget/v3-cache/` and reads `project.assets.json` directly. Shelling
 * out to the dotnet SDK lets us inherit all of that for free.
 *
 * Requires .NET SDK 9.0+ (the `--format json` switch was added in 9).
 */

import * as path from 'path'
import { spawn } from 'child_process'

const DEFAULT_TIMEOUT_MS = 60_000

/** Shape of the JSON emitted by `dotnet list <target> package [--outdated] --format json`. */
export interface DotnetListOutput {
  version: number
  parameters: string
  sources?: string[]
  projects: DotnetListProject[]
}

export interface DotnetListProject {
  path: string
  frameworks?: DotnetListFramework[]
}

export interface DotnetListFramework {
  framework: string
  topLevelPackages?: DotnetListPackage[]
  transitivePackages?: DotnetListPackage[]
}

export interface DotnetListPackage {
  id: string
  requestedVersion?: string
  resolvedVersion: string
  /** Only present with --outdated. */
  latestVersion?: string
}

/** List every installed top-level package across the target (.sln, .slnx or .csproj). */
export function listInstalledPackages(target: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DotnetListOutput> {
  return runDotnetList(target, ['package', '--format', 'json'], timeoutMs)
}

/**
 * List every outdated top-level package across the target. Packages that are
 * already up to date do not appear in the output.
 */
export function listOutdatedPackages(
  target: string,
  includePrerelease: boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<DotnetListOutput> {
  const args = ['package', '--outdated', '--format', 'json']
  if (includePrerelease) {
    args.push('--include-prerelease')
  }
  return runDotnetList(target, args, timeoutMs)
}

function runDotnetList(target: string, packageArgs: string[], timeoutMs: number): Promise<DotnetListOutput> {
  return new Promise((resolve, reject) => {
    const args = ['list', target, ...packageArgs]
    const child = spawn('dotnet', args, { cwd: path.dirname(target) })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (b: Buffer) => stdout.push(b))
    child.stderr.on('data', (b: Buffer) => stderr.push(b))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`dotnet list timed out after ${timeoutMs}ms for ${target}`))
    }, timeoutMs)

    child.on('error', err => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn dotnet: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timer)
      const stdoutText = Buffer.concat(stdout).toString('utf-8')
      const stderrText = Buffer.concat(stderr).toString('utf-8').trim()

      if (code !== 0) {
        reject(new Error(`dotnet list exited with code ${code}: ${stderrText || stdoutText || '(no output)'}`))
        return
      }

      try {
        resolve(parseJsonOutput(stdoutText))
      } catch (err) {
        reject(new Error(`Failed to parse dotnet list JSON: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
  })
}

/**
 * `dotnet list` sometimes prints informational lines before the JSON body
 * (e.g. when a project is being restored). Trim everything up to the first
 * `{` so JSON.parse always sees clean input.
 */
function parseJsonOutput(stdoutText: string): DotnetListOutput {
  const start = stdoutText.indexOf('{')
  if (start < 0) {
    throw new Error('no JSON body in output')
  }
  return JSON.parse(stdoutText.slice(start)) as DotnetListOutput
}
