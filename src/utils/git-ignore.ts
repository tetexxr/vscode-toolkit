import { spawn } from 'node:child_process'

/**
 * Parses the null-separated output of `git check-ignore --stdin -z`. Returns the
 * list of ignored paths (which is a subset of the input).
 */
export function parseCheckIgnoreOutput(stdout: string): string[] {
  if (stdout.length === 0) {
    return []
  }
  return stdout.split('\0').filter(p => p.length > 0)
}

/**
 * Filters out paths that are ignored by `.gitignore`. Falls back to returning the
 * input unchanged when:
 *   - git is not installed
 *   - `cwd` is not inside a git repository
 *   - any other transient failure happens
 *
 * Paths are passed to `git check-ignore --stdin -z` via stdin, so the call scales
 * to thousands of files in a single process spawn.
 */
export function filterGitIgnored(filePaths: string[], cwd: string): Promise<string[]> {
  if (filePaths.length === 0) {
    return Promise.resolve([])
  }
  return new Promise(resolve => {
    let child
    try {
      child = spawn('git', ['check-ignore', '--stdin', '-z'], { cwd })
    } catch {
      resolve(filePaths)
      return
    }

    let stdout = ''
    let resolved = false
    const finish = (result: string[]) => {
      if (!resolved) {
        resolved = true
        resolve(result)
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => finish(filePaths))
    child.on('close', code => {
      // git check-ignore exit codes:
      //   0: at least one path matched (was ignored)
      //   1: no paths matched
      //   128: fatal error (not a git repo, etc.)
      if (code === 0 || code === 1) {
        const ignored = new Set(parseCheckIgnoreOutput(stdout))
        finish(filePaths.filter(p => !ignored.has(p)))
        return
      }
      finish(filePaths)
    })

    child.stdin.on('error', () => {
      // EPIPE may fire when git exits before we finish writing; the close handler
      // will still resolve so we don't need to do anything else here.
    })
    child.stdin.write(filePaths.join('\0') + '\0')
    child.stdin.end()
  })
}
