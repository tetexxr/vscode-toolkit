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
      relativePath
    ],
    30000
  )
}

export interface BlameInfo {
  hash: string
  author: string
  authorTime: number
  summary: string
}

export async function getFileBlame(cwd: string, relativePath: string): Promise<BlameInfo[]> {
  const raw = await gitExec(cwd, ['blame', '--porcelain', '--', relativePath], 30000)
  const lines = raw.split('\n')
  const commits = new Map<string, BlameInfo>()
  const result: BlameInfo[] = []

  let i = 0
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
    if (!headerMatch) {
      i++
      continue
    }

    const hash = headerMatch[1]
    const finalLine = parseInt(headerMatch[2], 10)
    i++

    if (!commits.has(hash)) {
      const info: BlameInfo = { hash, author: '', authorTime: 0, summary: '' }
      while (i < lines.length && !lines[i].startsWith('\t')) {
        if (lines[i].startsWith('author ')) {
          info.author = lines[i].substring(7)
        } else if (lines[i].startsWith('author-time ')) {
          info.authorTime = parseInt(lines[i].substring(12), 10)
        } else if (lines[i].startsWith('summary ')) {
          info.summary = lines[i].substring(8)
        }
        i++
      }
      commits.set(hash, info)
    } else {
      // Skip metadata lines until content line
      while (i < lines.length && !lines[i].startsWith('\t')) {
        i++
      }
    }

    // Skip the tab-prefixed content line
    if (i < lines.length && lines[i].startsWith('\t')) {
      i++
    }

    const commitInfo = commits.get(hash)!
    result[finalLine - 1] = { ...commitInfo }
  }

  return result
}

export function parseRemoteUrl(url: string): RemoteInfo | undefined {
  const match = url.match(/([\w-]+(?:\.[\w-]+)+)[:/]+([^/]+)\/(.*?)(?:\.git|\/)?$/)
  if (!match) {
    return undefined
  }
  return {
    domain: match[1],
    owner: match[2],
    repo: match[3]
  }
}
