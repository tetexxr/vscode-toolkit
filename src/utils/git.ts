/**
 * Git helper utilities. Uses child_process.execFile for safety (no shell injection).
 */

import { execFile } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'

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
        reject(err instanceof Error ? err : new Error('git command failed'))
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

export async function getFileLogPatch(
  cwd: string,
  relativePath: string,
  maxCount?: number,
  skip?: number
): Promise<string> {
  const args = ['log', '-p', '--format=%n---COMMIT---%ncommit %H%nAuthor: %an <%ae>%nDate:   %ar (%ai)%n%n    %s%n']
  // Paged: a file's full history with patches can blow past maxBuffer.
  if (maxCount !== undefined) {
    args.push(`--max-count=${maxCount}`)
  }
  if (skip !== undefined && skip > 0) {
    args.push(`--skip=${skip}`)
  }
  args.push('--', relativePath)
  return gitExec(cwd, args, 30000)
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
  const tokens = output.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]
    if (!entry || entry.length < 4) continue
    const x = entry[0]
    const y = entry[1]
    const filePath = entry.substring(3)
    // Renames/copies carry the original path as an extra NUL-separated
    // field after the new path; consume it so it isn't read as an entry.
    if (x === 'R' || x === 'C') i++
    // Skip deleted files
    if (x === 'D' || y === 'D') continue
    // Skip ignored files
    if (x === '!' || y === '!') continue
    files.push({ status: `${x}${y}`.trim(), path: filePath })
  }
  return files
}

export async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  // -z: NUL-separated entries with unquoted paths, so names with accents,
  // quotes, or " -> " parse correctly.
  const output = await gitExec(cwd, ['status', '--porcelain', '-z'])
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
  const trimmed = url.trim()
  let host: string
  let pathname: string

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    // Scheme form (ssh://, https://, git://...): URL handles user@ and :port.
    try {
      const parsed = new URL(trimmed)
      host = parsed.hostname
      pathname = parsed.pathname
    } catch {
      return undefined
    }
  } else {
    // scp-like form: [user@]host:path
    const match = trimmed.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/)
    if (!match) {
      return undefined
    }
    host = match[1]
    pathname = match[2]
  }

  const cleanPath = pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  const slash = cleanPath.indexOf('/')
  if (!host || slash <= 0 || slash === cleanPath.length - 1) {
    return undefined
  }
  return {
    domain: host,
    owner: cleanPath.slice(0, slash),
    repo: cleanPath.slice(slash + 1)
  }
}

export interface CommitLogEntry {
  hash: string
  subject: string
  author: string
  date: string
}

const LOG_FORMAT = '%H%x00%s%x00%an%x00%ar'

function parseLogOutput(raw: string): CommitLogEntry[] {
  if (!raw) return []
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, subject, author, date] = line.split('\x00')
      return { hash, subject, author, date }
    })
}

export async function getCommitLog(cwd: string, count = 200): Promise<CommitLogEntry[]> {
  return parseLogOutput(await gitExec(cwd, ['log', `--max-count=${count}`, `--format=${LOG_FORMAT}`], 30000))
}

/**
 * Commits on `branch` that HEAD doesn't have (cherry-pick candidates).
 * --cherry-pick excludes patch-equivalent commits, so something already
 * cherry-picked (same change, different hash) is not offered again.
 */
export async function getCommitsNotInHead(cwd: string, branch: string, count = 200): Promise<CommitLogEntry[]> {
  return parseLogOutput(
    await gitExec(
      cwd,
      ['log', '--cherry-pick', '--right-only', `HEAD...${branch}`, `--max-count=${count}`, `--format=${LOG_FORMAT}`],
      30000
    )
  )
}

export async function listLocalBranches(cwd: string): Promise<string[]> {
  const raw = await gitExec(cwd, ['for-each-ref', '--sort=-committerdate', 'refs/heads', '--format=%(refname:short)'])
  return raw.split('\n').map(b => b.trim()).filter(Boolean)
}

export async function cherryPickCommit(cwd: string, hash: string): Promise<void> {
  await gitExec(cwd, ['cherry-pick', hash], 30000)
}

/** Whether a cherry-pick stopped on conflicts and is waiting for resolution. */
export async function isCherryPickInProgress(cwd: string): Promise<boolean> {
  const raw = await gitExec(cwd, ['rev-parse', '--git-path', 'CHERRY_PICK_HEAD'])
  return existsSync(path.resolve(cwd, raw.trim()))
}

export async function getCommitMessage(cwd: string, hash: string): Promise<string> {
  return gitExec(cwd, ['log', '-1', '--format=%B', hash])
}

export async function getCommitDateIso(cwd: string, hash: string): Promise<string> {
  return gitExec(cwd, ['log', '-1', '--format=%aI', hash])
}

export interface CommitFileInfo {
  status: string
  path: string
  additions: number
  deletions: number
  isBinary: boolean
}

export async function getCommitParents(cwd: string, hash: string): Promise<string[]> {
  const raw = await gitExec(cwd, ['rev-list', '--parents', '-n', '1', hash])
  return raw.split(/\s+/).filter(Boolean).slice(1)
}

export async function getCommitFiles(cwd: string, hash: string): Promise<CommitFileInfo[]> {
  const parents = await getCommitParents(cwd, hash)
  const nameStatusArgs =
    parents.length === 0
      ? ['diff-tree', '--no-commit-id', '--root', '-r', '--name-status', '-z', hash]
      : ['diff', '--name-status', '-z', parents[0], hash]
  const numstatArgs =
    parents.length === 0
      ? ['diff-tree', '--no-commit-id', '--root', '-r', '--numstat', '-z', hash]
      : ['diff', '--numstat', '-z', parents[0], hash]
  const [statusRaw, numstatRaw] = await Promise.all([
    gitExec(cwd, nameStatusArgs, 30000),
    gitExec(cwd, numstatArgs, 30000)
  ])

  // --numstat -z: "add\tdel\tpath\0", except renames/copies, which come as
  // "add\tdel\t\0src\0dst\0" (empty path field, then both paths as tokens).
  // Keyed by the new path to match the name-status pass below.
  const stats = new Map<string, { additions: number; deletions: number; isBinary: boolean }>()
  const numstatTokens = numstatRaw.split('\0')
  for (let i = 0; i < numstatTokens.length; i++) {
    const entry = numstatTokens[i]
    if (!entry) continue
    const match = entry.match(/^([0-9-]+)\t([0-9-]+)\t([\s\S]*)$/)
    if (!match) continue
    const [, add, del, pathField] = match
    let filePath = pathField
    if (filePath === '') {
      filePath = numstatTokens[i + 2] ?? ''
      i += 2
    }
    const isBinary = add === '-' && del === '-'
    stats.set(filePath, {
      additions: isBinary ? 0 : parseInt(add, 10),
      deletions: isBinary ? 0 : parseInt(del, 10),
      isBinary
    })
  }

  // --name-status -z: "STATUS\0path\0", with two paths (src, dst) for R/C.
  const files: CommitFileInfo[] = []
  const statusTokens = statusRaw.split('\0')
  for (let i = 0; i < statusTokens.length; i++) {
    const statusToken = statusTokens[i]
    if (!statusToken) continue
    const status = statusToken.charAt(0)
    let filePath = statusTokens[i + 1] ?? ''
    i++
    if (status === 'R' || status === 'C') {
      filePath = statusTokens[i + 1] ?? ''
      i++
    }
    if (!filePath) continue
    const stat = stats.get(filePath) || { additions: 0, deletions: 0, isBinary: false }
    files.push({ status, path: filePath, ...stat })
  }

  return files
}

export async function getCommitDiff(cwd: string, hash: string, filePath?: string): Promise<string> {
  const parents = await getCommitParents(cwd, hash)
  const args = parents.length === 0 ? ['diff-tree', '--root', '--no-commit-id', '-p', hash] : ['diff', parents[0], hash]
  if (filePath) args.push('--', filePath)
  return gitExec(cwd, args, 30000)
}

export async function stageFile(cwd: string, ...filePaths: string[]): Promise<void> {
  await gitExec(cwd, ['add', ...filePaths])
}

export async function resetToCommit(cwd: string, hash: string, mode: 'soft' | 'hard' | 'mixed'): Promise<void> {
  await gitExec(cwd, ['reset', `--${mode}`, hash], 30000)
}

export async function countCommitsBetween(cwd: string, fromHash: string, toHash: string): Promise<number> {
  const raw = await gitExec(cwd, ['rev-list', '--count', `${fromHash}..${toHash}`])
  return parseInt(raw, 10)
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const status = await gitExec(cwd, ['status', '--porcelain'])
  return status.length > 0
}

/** Whether a rebase (interactive or am-based) is currently in progress. */
export async function isRebaseInProgress(cwd: string): Promise<boolean> {
  const raw = await gitExec(cwd, ['rev-parse', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply'])
  return raw
    .split('\n')
    .map(p => p.trim())
    .some(p => p.length > 0 && existsSync(path.resolve(cwd, p)))
}

export async function editCommitMessage(
  cwd: string,
  hash: string,
  newMessage: string,
  newDate?: string
): Promise<void> {
  const headHash = await gitExec(cwd, ['rev-parse', 'HEAD'])
  // `git commit --amend --date` only sets the author date; without GIT_COMMITTER_DATE
  // the committer date defaults to "now", which is what GitHub uses for push timestamps.
  const dateEnv: Record<string, string> = newDate ? { GIT_AUTHOR_DATE: newDate, GIT_COMMITTER_DATE: newDate } : {}

  if (hash === headHash) {
    const staged = await gitExec(cwd, ['diff', '--cached', '--name-only']).catch(() => '')
    if (staged) {
      throw new Error(
        'There are staged changes that would be included in the amend. Please unstage or commit them first.'
      )
    }
    const args = ['commit', '--amend', '-m', newMessage]
    if (newDate) {
      args.push('--date', newDate)
    }
    await gitExec(cwd, args, 30000, dateEnv)
  } else {
    // Checked before the dirty-tree guard: a conflicted rebase also makes the
    // working tree dirty, and "rebase in progress" is the actionable error.
    if (await isRebaseInProgress(cwd)) {
      throw new Error(
        'A rebase is already in progress in this repository. Finish or abort it before editing older commits.'
      )
    }

    const status = await gitExec(cwd, ['status', '--porcelain']).catch(() => '')
    if (status) {
      throw new Error('Working tree has uncommitted changes. Please commit or stash them before editing older commits.')
    }

    const shortHash = hash.substring(0, 7)
    const parentHash = await gitExec(cwd, ['rev-parse', `${hash}^`])

    const amendArgs = ['commit', '--amend', '-m', newMessage]
    if (newDate) {
      amendArgs.push('--date', newDate)
    }

    // Portable sequence editor: rewrites the rebase todo with Node instead of sed
    // (BSD and GNU sed disagree on -i, and Windows has no sed). Git appends the
    // todo path as the last argument. ELECTRON_RUN_AS_NODE makes VS Code's
    // Electron binary behave as plain Node when process.execPath points at it.
    const todoScript = `const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/^pick ${shortHash}/m,"edit ${shortHash}"))`

    try {
      // --committer-date-is-author-date keeps later commits' committer date equal to
      // their original author date instead of being reset to "now" by rebase --continue.
      await gitExec(cwd, ['rebase', '-i', '--committer-date-is-author-date', parentHash], 60000, {
        GIT_SEQUENCE_EDITOR: `"${process.execPath}" -e '${todoScript}'`,
        ELECTRON_RUN_AS_NODE: '1'
      })

      await gitExec(cwd, amendArgs, 30000, dateEnv)
      await gitExec(cwd, ['rebase', '--continue'], 30000)
    } catch (err) {
      // This rebase is ours (we checked none was running): roll it back so the
      // repository is left exactly as it was.
      await gitExec(cwd, ['rebase', '--abort']).catch(() => {})
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Editing the commit failed and the rebase was rolled back: ${message}`)
    }
  }
}

/**
 * Melds `hash` into its parent via an automated interactive rebase.
 * 'fixup' keeps the parent's message; 'squash' keeps both, concatenated.
 */
export async function squashIntoParent(cwd: string, hash: string, mode: 'fixup' | 'squash'): Promise<void> {
  if (await isRebaseInProgress(cwd)) {
    throw new Error('A rebase is already in progress in this repository. Finish or abort it before squashing commits.')
  }
  const status = await gitExec(cwd, ['status', '--porcelain']).catch(() => '')
  if (status) {
    throw new Error('Working tree has uncommitted changes. Please commit or stash them before squashing commits.')
  }
  const parents = await getCommitParents(cwd, hash)
  if (parents.length === 0) {
    throw new Error('The root commit has no parent to squash into.')
  }
  if (parents.length > 1) {
    throw new Error('Merge commits cannot be squashed into a parent.')
  }

  // The rebase must start at the parent's parent so the parent itself is in
  // the todo; when the parent is the root commit, rebase from --root.
  const grandParents = await getCommitParents(cwd, parents[0])
  const baseArgs = grandParents.length === 0 ? ['--root'] : [`${parents[0]}^`]

  const shortHash = hash.substring(0, 7)
  const todoScript = `const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/^pick ${shortHash}/m,"${mode} ${shortHash}"))`

  const env: Record<string, string> = {
    GIT_SEQUENCE_EDITOR: `"${process.execPath}" -e '${todoScript}'`,
    ELECTRON_RUN_AS_NODE: '1'
  }
  if (mode === 'squash') {
    // squash stops to edit the combined message — accept git's default
    // (both messages concatenated) with a no-op editor.
    env.GIT_EDITOR = `"${process.execPath}" -e ""`
  }

  try {
    await gitExec(cwd, ['rebase', '-i', '--committer-date-is-author-date', ...baseArgs], 60000, env)
  } catch (err) {
    // This rebase is ours (we checked none was running): roll it back.
    await gitExec(cwd, ['rebase', '--abort']).catch(() => {})
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Squashing the commit failed and the rebase was rolled back: ${message}`)
  }
}
