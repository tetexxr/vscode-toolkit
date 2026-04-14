/**
 * Git helper utilities. Uses child_process.execFile for safety (no shell injection).
 */

import { execFile } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

function gitExec(cwd: string, args: string[], timeout = 5000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv } = {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024
    }
    if (env) {
      options.env = { ...process.env, ...env }
    }
    execFile('git', args, options, (err, stdout) => {
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

export interface ChangedFile {
  status: string
  path: string
}

/**
 * Parses `git status --porcelain` output into a list of changed files.
 * Skips deleted files (they don't exist on disk). Handles renames by using the new path.
 */
export function parseGitStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = []
  for (const line of output.split('\n')) {
    if (!line || line.length < 4) continue
    const x = line[0]
    const y = line[1]
    // Skip deleted files
    if (x === 'D' || y === 'D') continue
    // Skip ignored files
    if (x === '!' || y === '!') continue
    let filePath = line.substring(3)
    // Handle renames: "R  old -> new" — take the new path
    if (x === 'R') {
      const arrow = filePath.indexOf(' -> ')
      if (arrow !== -1) {
        filePath = filePath.substring(arrow + 4)
      }
    }
    files.push({ status: `${x}${y}`.trim(), path: filePath })
  }
  return files
}

export async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const output = await gitExec(cwd, ['status', '--porcelain'])
  return parseGitStatus(output)
}

/**
 * Given a list of file paths (relative to repo root), returns the unique
 * parent directories sorted from shallowest to deepest.
 */
export function getChangedFileDirectories(filePaths: string[]): string[] {
  const dirs = new Set<string>()
  for (const filePath of filePaths) {
    const parts = filePath.split('/')
    // Remove the filename, keep directory segments
    parts.pop()
    // Add all ancestor directories
    for (let i = 1; i <= parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  return [...dirs].sort((a, b) => {
    const depthA = a.split('/').length
    const depthB = b.split('/').length
    if (depthA !== depthB) return depthA - depthB
    return a.localeCompare(b)
  })
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

export interface CommitLogEntry {
  hash: string
  subject: string
  author: string
  date: string
}

export async function getCommitLog(cwd: string, count = 200): Promise<CommitLogEntry[]> {
  const raw = await gitExec(cwd, ['log', `--max-count=${count}`, '--format=%H%x00%s%x00%an%x00%ar'], 30000)
  if (!raw) return []
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, subject, author, date] = line.split('\x00')
      return { hash, subject, author, date }
    })
}

export async function getCommitMessage(cwd: string, hash: string): Promise<string> {
  return gitExec(cwd, ['log', '-1', '--format=%B', hash])
}

export interface CommitFileInfo {
  status: string
  path: string
  additions: number
  deletions: number
}

export async function getCommitFiles(cwd: string, hash: string): Promise<CommitFileInfo[]> {
  const [statusRaw, numstatRaw] = await Promise.all([
    gitExec(cwd, ['diff-tree', '--no-commit-id', '--root', '-r', '--name-status', hash], 30000),
    gitExec(cwd, ['diff-tree', '--no-commit-id', '--root', '-r', '--numstat', hash], 30000)
  ])

  const stats = new Map<string, { additions: number; deletions: number }>()
  for (const line of numstatRaw.split('\n').filter(Boolean)) {
    const [add, del, ...rest] = line.split('\t')
    const filePath = rest.join('\t')
    stats.set(filePath, {
      additions: add === '-' ? 0 : parseInt(add, 10),
      deletions: del === '-' ? 0 : parseInt(del, 10)
    })
  }

  const files: CommitFileInfo[] = []
  for (const line of statusRaw.split('\n').filter(Boolean)) {
    const [statusCode, ...pathParts] = line.split('\t')
    const filePath = pathParts[pathParts.length - 1]
    const status = statusCode.charAt(0)
    const stat = stats.get(filePath) || { additions: 0, deletions: 0 }
    files.push({ status, path: filePath, ...stat })
  }

  return files
}

export async function getCommitDiff(cwd: string, hash: string): Promise<string> {
  return gitExec(cwd, ['diff-tree', '--root', '--no-commit-id', '-p', hash], 30000)
}

export async function stageFile(cwd: string, ...filePaths: string[]): Promise<void> {
  await gitExec(cwd, ['add', ...filePaths])
}

export async function editCommitMessage(cwd: string, hash: string, newMessage: string): Promise<void> {
  const headHash = await gitExec(cwd, ['rev-parse', 'HEAD'])

  if (hash === headHash) {
    const staged = await gitExec(cwd, ['diff', '--cached', '--name-only']).catch(() => '')
    if (staged) {
      throw new Error(
        'There are staged changes that would be included in the amend. Please unstage or commit them first.'
      )
    }
    await gitExec(cwd, ['commit', '--amend', '-m', newMessage], 30000)
  } else {
    const status = await gitExec(cwd, ['status', '--porcelain']).catch(() => '')
    if (status) {
      throw new Error('Working tree has uncommitted changes. Please commit or stash them before editing older commits.')
    }

    const shortHash = hash.substring(0, 7)
    const msgFile = path.join(os.tmpdir(), `toolkit-reword-${Date.now()}.txt`)
    fs.writeFileSync(msgFile, newMessage)

    const sedInPlace = process.platform === 'darwin'
      ? `sed -i '' 's/^pick ${shortHash}/reword ${shortHash}/'`
      : `sed -i 's/^pick ${shortHash}/reword ${shortHash}/'`

    try {
      await gitExec(cwd, ['rebase', '-i', `${hash}^`], 60000, {
        GIT_SEQUENCE_EDITOR: sedInPlace,
        GIT_EDITOR: `cp "${msgFile}"`
      })
    } finally {
      try {
        fs.unlinkSync(msgFile)
      } catch {}
    }
  }
}
