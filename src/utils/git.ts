/**
 * Git helper utilities. Uses child_process.execFile for safety (no shell injection).
 */

import { execFile } from 'child_process'

function gitExec(cwd: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err)
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

export async function getRepoRoot(cwd: string): Promise<string> {
  return gitExec(cwd, ['rev-parse', '--show-toplevel'])
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return gitExec(cwd, ['branch', '--show-current'])
}

export async function getCommitHash(cwd: string): Promise<string> {
  return gitExec(cwd, ['rev-parse', 'HEAD'])
}

export async function getRemoteUrl(cwd: string, remoteName: string): Promise<string> {
  return gitExec(cwd, ['remote', 'get-url', remoteName])
}

export async function isGitIgnored(cwd: string, filePath: string): Promise<boolean> {
  try {
    await gitExec(cwd, ['check-ignore', '-q', filePath])
    return true
  } catch {
    return false
  }
}

/**
 * Parses a git remote URL (SSH or HTTPS) into components.
 * Supports:
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo.git
 *   ssh://git@github.com/owner/repo.git
 */
export interface RemoteInfo {
  domain: string
  owner: string
  repo: string
}

export async function getFileLogPatch(cwd: string, relativePath: string): Promise<string> {
  return gitExec(
    cwd,
    [
      'log',
      '-p',
      '--format=%n---COMMIT---%ncommit %H%nAuthor: %an <%ae>%nDate:   %ar (%ai)%n%n    %s%n',
      '--',
      relativePath,
    ],
    30000,
  )
}

export function parseRemoteUrl(url: string): RemoteInfo | undefined {
  const match = url.match(/([\w-]+(?:\.[\w-]+)+)[:/]+([^/]+)\/(.*?)(?:\.git|\/)?$/)
  if (!match) {
    return undefined
  }
  return {
    domain: match[1],
    owner: match[2],
    repo: match[3],
  }
}
