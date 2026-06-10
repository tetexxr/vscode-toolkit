import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
import {
  parseRemoteUrl,
  getFileLogPatch,
  getFileBlame,
  parseGitStatus,
  getCommitLog,
  getCommitMessage,
  getCommitFiles,
  getCommitDiff,
  getCommitDateIso,
  editCommitMessage,
  resetToCommit,
  stageFile,
  getChangedFiles,
  getChangedFileDirectories,
  countCommitsBetween,
  hasUncommittedChanges,
  isRebaseInProgress
} from '../../src/utils/git'

describe('getFileLogPatch', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  it('should return log with patch for a tracked file', async () => {
    const result = await getFileLogPatch(repoRoot, 'package.json')
    assert.ok(result.length > 0)
    assert.ok(result.includes('---COMMIT---'))
    assert.ok(result.includes('commit '))
    assert.ok(result.includes('Author:'))
  })

  it('should include diff hunks in the output', async () => {
    const result = await getFileLogPatch(repoRoot, 'package.json')
    assert.ok(result.includes('diff --git'))
    assert.ok(result.includes('@@'))
  })

  it('should return empty string for an untracked file', async () => {
    const result = await getFileLogPatch(repoRoot, 'nonexistent-file-that-does-not-exist.txt')
    assert.equal(result, '')
  })

  it('should reject for an invalid cwd', async () => {
    await assert.rejects(() => getFileLogPatch('/nonexistent-dir', 'file.txt'))
  })
})

describe('getFileBlame', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  it('should return blame info for a tracked file', async () => {
    const result = await getFileBlame(repoRoot, 'package.json')
    assert.ok(result.length > 0)
    for (const entry of result) {
      assert.ok(entry.hash.length === 40, 'hash should be 40 characters')
      assert.ok(entry.author.length > 0, 'author should not be empty')
      assert.ok(entry.authorTime > 0, 'authorTime should be a positive timestamp')
      assert.ok(entry.summary.length > 0, 'summary should not be empty')
    }
  })

  it('should return one entry per line of the file', async () => {
    const result = await getFileBlame(repoRoot, 'package.json')
    const fileContent = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
    const lineCount = fileContent.split('\n').length
    // git blame may omit the final empty line
    assert.ok(
      result.length === lineCount || result.length === lineCount - 1,
      `expected ~${lineCount} entries, got ${result.length}`
    )
  })

  it('should reject for an untracked file', async () => {
    await assert.rejects(() => getFileBlame(repoRoot, 'nonexistent-file-that-does-not-exist.txt'))
  })

  it('should reject for an invalid cwd', async () => {
    await assert.rejects(() => getFileBlame('/nonexistent-dir', 'file.txt'))
  })
})

describe('parseGitStatus', () => {
  // Input mirrors `git status --porcelain -z`: NUL-separated, unquoted paths.
  it('should parse modified files', () => {
    const output = ' M src/utils/git.ts\0 M README.md\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, 'src/utils/git.ts')
    assert.equal(result[0].status, 'M')
    assert.equal(result[1].path, 'README.md')
  })

  it('should parse staged modified files', () => {
    const output = 'M  src/utils/git.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/utils/git.ts')
    assert.equal(result[0].status, 'M')
  })

  it('should parse added files', () => {
    const output = 'A  src/features/new-feature.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/features/new-feature.ts')
    assert.equal(result[0].status, 'A')
  })

  it('should parse untracked files', () => {
    const output = '?? src/new-file.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/new-file.ts')
    assert.equal(result[0].status, '??')
  })

  it('should skip deleted files', () => {
    const output = 'D  src/old-file.ts\0 M src/utils/git.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/utils/git.ts')
  })

  it('should skip worktree-deleted files', () => {
    const output = ' D src/old-file.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 0)
  })

  it('should handle renames by using the new path', () => {
    const output = 'R  src/new-name.ts\0src/old-name.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/new-name.ts')
    assert.equal(result[0].status, 'R')
  })

  it('should not parse the original path of a rename as a separate entry', () => {
    const output = 'R  src/new-name.ts\0src/old-name.ts\0?? src/other.ts\0'
    const result = parseGitStatus(output)
    assert.deepEqual(
      result.map(f => f.path),
      ['src/new-name.ts', 'src/other.ts']
    )
  })

  it('should handle copies by using the new path', () => {
    const output = 'C  src/copy.ts\0src/original.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/copy.ts')
    assert.equal(result[0].status, 'C')
  })

  it('should handle mixed statuses', () => {
    const output = [
      'M  src/a.ts',
      ' M src/b.ts',
      'A  src/c.ts',
      'D  src/d.ts',
      '?? src/e.ts',
      'R  src/g.ts',
      'src/f.ts'
    ].join('\0')
    const result = parseGitStatus(output)
    assert.equal(result.length, 5)
    const paths = result.map(f => f.path)
    assert.deepEqual(paths, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/e.ts', 'src/g.ts'])
  })

  it('should return empty array for empty output', () => {
    assert.deepEqual(parseGitStatus(''), [])
  })

  it('should skip ignored files', () => {
    const output = '!! ignored-file.log\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 0)
  })

  it('should handle files in deeply nested directories', () => {
    const output = ' M src/features/nuget/nuget-api.ts\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'src/features/nuget/nuget-api.ts')
  })

  it('should preserve paths with accents and special characters', () => {
    const output = ' M café.txt\0?? with"quote.txt\0 M docs/año 2026/niño.md\0'
    const result = parseGitStatus(output)
    assert.deepEqual(
      result.map(f => f.path),
      ['café.txt', 'with"quote.txt', 'docs/año 2026/niño.md']
    )
  })

  it('should preserve paths containing a literal arrow', () => {
    const output = ' M notes -> draft.md\0'
    const result = parseGitStatus(output)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'notes -> draft.md')
  })
})

describe('getChangedFiles', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should return changed files with non-ASCII names unquoted', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'café.txt'), 'hola')
    fs.writeFileSync(path.join(tmpRepo, 'plain.txt'), 'plain')
    const result = await getChangedFiles(tmpRepo)
    const paths = result.map(f => f.path).sort()
    assert.deepEqual(paths, ['café.txt', 'plain.txt'])
  })

  it('should report the new path for renamed files', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'old.txt'), 'content')
    git('add', 'old.txt')
    git('commit', '-m', 'add file')
    git('mv', 'old.txt', 'new.txt')
    const result = await getChangedFiles(tmpRepo)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, 'new.txt')
    assert.equal(result[0].status, 'R')
  })
})

describe('parseRemoteUrl', () => {
  it('should parse SSH remote URL', () => {
    const result = parseRemoteUrl('git@github.com:owner/repo.git')
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' })
  })

  it('should parse HTTPS remote URL', () => {
    const result = parseRemoteUrl('https://github.com/owner/repo.git')
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' })
  })

  it('should parse HTTPS remote URL without .git suffix', () => {
    const result = parseRemoteUrl('https://github.com/owner/repo')
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' })
  })

  it('should parse ssh:// protocol URL', () => {
    const result = parseRemoteUrl('ssh://git@github.com/owner/repo.git')
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' })
  })

  it('should parse GitHub Enterprise URL', () => {
    const result = parseRemoteUrl('git@github.corp.com:team/project.git')
    assert.deepEqual(result, { domain: 'github.corp.com', owner: 'team', repo: 'project' })
  })

  it('should handle hyphens in owner and repo names', () => {
    const result = parseRemoteUrl('git@github.com:my-org/my-repo.git')
    assert.deepEqual(result, { domain: 'github.com', owner: 'my-org', repo: 'my-repo' })
  })

  it('should return undefined for an invalid URL', () => {
    assert.equal(parseRemoteUrl('not-a-url'), undefined)
  })

  it('should return undefined for an empty string', () => {
    assert.equal(parseRemoteUrl(''), undefined)
  })
})

describe('getCommitLog', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  it('should return an array of commit entries', async () => {
    const result = await getCommitLog(repoRoot)
    assert.ok(result.length > 0)
    for (const entry of result) {
      assert.ok(entry.hash.length === 40, 'hash should be 40 characters')
      assert.ok(entry.subject.length > 0, 'subject should not be empty')
      assert.ok(entry.author.length > 0, 'author should not be empty')
      assert.ok(entry.date.length > 0, 'date should not be empty')
    }
  })

  it('should respect the count parameter', async () => {
    const result = await getCommitLog(repoRoot, 3)
    assert.ok(result.length <= 3)
    assert.ok(result.length > 0)
  })

  it('should return commits in reverse chronological order', async () => {
    const result = await getCommitLog(repoRoot, 5)
    // First entry should be the most recent (HEAD)
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim()
    assert.equal(result[0].hash, headHash)
  })

  it('should reject for an invalid cwd', async () => {
    await assert.rejects(() => getCommitLog('/nonexistent-dir'))
  })
})

describe('getCommitMessage', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  it('should return the full commit message for HEAD', async () => {
    const log = await getCommitLog(repoRoot, 1)
    const message = await getCommitMessage(repoRoot, log[0].hash)
    assert.ok(message.length > 0)
    assert.ok(message.includes(log[0].subject))
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => getCommitMessage(repoRoot, 'invalid-hash'))
  })
})

describe('getCommitFiles', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'hello')
    git('add', 'file.txt')
    git('commit', '-m', 'initial commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should return file info for a commit', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const files = await getCommitFiles(tmpRepo, log[0].hash)
    assert.ok(Array.isArray(files))
    for (const file of files) {
      assert.ok(file.path.length > 0, 'path should not be empty')
      assert.ok(['A', 'M', 'D', 'R', 'C', 'T'].includes(file.status), `unexpected status: ${file.status}`)
      assert.ok(typeof file.additions === 'number')
      assert.ok(typeof file.deletions === 'number')
    }
  })

  it('should return at least one file for a non-empty commit', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const files = await getCommitFiles(tmpRepo, log[0].hash)
    assert.ok(files.length > 0)
  })

  it('should mark text files as not binary', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const files = await getCommitFiles(tmpRepo, log[0].hash)
    const txt = files.find(f => f.path === 'file.txt')
    assert.ok(txt, 'expected file.txt in commit files')
    assert.equal(txt!.isBinary, false)
  })

  it('should report real additions/deletions counts for text files', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'lines.txt'), 'a\nb\nc\n')
    git('add', 'lines.txt')
    git('commit', '-m', 'add lines')
    const headHash = git('rev-parse', 'HEAD')
    const files = await getCommitFiles(tmpRepo, headHash)
    const lines = files.find(f => f.path === 'lines.txt')
    assert.ok(lines)
    assert.equal(lines!.additions, 3)
    assert.equal(lines!.deletions, 0)
    assert.equal(lines!.isBinary, false)
  })

  it('should mark binary files as binary with zero additions/deletions', async () => {
    // PNG header bytes — git detects this as binary content
    const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    fs.writeFileSync(path.join(tmpRepo, 'image.png'), binaryContent)
    git('add', 'image.png')
    git('commit', '-m', 'add binary')
    const headHash = git('rev-parse', 'HEAD')
    const files = await getCommitFiles(tmpRepo, headHash)
    const png = files.find(f => f.path === 'image.png')
    assert.ok(png, 'expected image.png in commit files')
    assert.equal(png!.isBinary, true)
    assert.equal(png!.additions, 0)
    assert.equal(png!.deletions, 0)
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => getCommitFiles(tmpRepo, 'invalid-hash'))
  })

  it('should return files brought in by a merge commit relative to the target branch', async () => {
    const targetBranch = git('rev-parse', '--abbrev-ref', 'HEAD')
    git('checkout', '-b', 'feature')
    fs.writeFileSync(path.join(tmpRepo, 'feature-only.txt'), 'feature content\n')
    git('add', 'feature-only.txt')
    git('commit', '-m', 'add feature file')
    git('checkout', targetBranch)
    git('merge', '--no-ff', 'feature', '-m', 'Merge feature')
    const mergeHash = git('rev-parse', 'HEAD')
    const files = await getCommitFiles(tmpRepo, mergeHash)
    const featureFile = files.find(f => f.path === 'feature-only.txt')
    assert.ok(featureFile, 'expected feature-only.txt in merge commit files')
    assert.equal(featureFile!.status, 'A')
    assert.equal(featureFile!.additions, 1)
  })
})

describe('getCommitDiff', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'hello')
    git('add', 'file.txt')
    git('commit', '-m', 'initial commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should return diff content for a commit', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const diff = await getCommitDiff(tmpRepo, log[0].hash)
    assert.ok(diff.length > 0)
    assert.ok(diff.includes('diff --git'))
  })

  it('should include hunk headers', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const diff = await getCommitDiff(tmpRepo, log[0].hash)
    assert.ok(diff.includes('@@'))
  })

  it('should include all files when no path filter is given', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'a.txt'), 'a')
    fs.writeFileSync(path.join(tmpRepo, 'b.txt'), 'b')
    git('add', 'a.txt', 'b.txt')
    git('commit', '-m', 'two files')
    const headHash = git('rev-parse', 'HEAD')
    const diff = await getCommitDiff(tmpRepo, headHash)
    assert.ok(diff.includes('a.txt'))
    assert.ok(diff.includes('b.txt'))
  })

  it('should return only the diff for the given file path', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'a.txt'), 'a')
    fs.writeFileSync(path.join(tmpRepo, 'b.txt'), 'b')
    git('add', 'a.txt', 'b.txt')
    git('commit', '-m', 'two files')
    const headHash = git('rev-parse', 'HEAD')
    const diff = await getCommitDiff(tmpRepo, headHash, 'a.txt')
    assert.ok(diff.includes('diff --git a/a.txt b/a.txt'))
    assert.ok(!diff.includes('b/b.txt'))
  })

  it('should return diff for files inside subdirectories when path is given', async () => {
    fs.mkdirSync(path.join(tmpRepo, 'src'))
    fs.writeFileSync(path.join(tmpRepo, 'src', 'nested.txt'), 'nested')
    git('add', 'src/nested.txt')
    git('commit', '-m', 'add nested file')
    const headHash = git('rev-parse', 'HEAD')
    const diff = await getCommitDiff(tmpRepo, headHash, 'src/nested.txt')
    assert.ok(diff.includes('src/nested.txt'))
    assert.ok(diff.includes('+nested'))
  })

  it('should return empty diff when path filter does not match any file in the commit', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const diff = await getCommitDiff(tmpRepo, log[0].hash, 'nonexistent.txt')
    assert.equal(diff, '')
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => getCommitDiff(tmpRepo, 'invalid-hash'))
  })

  it('should return diff content for a merge commit relative to the target branch', async () => {
    const targetBranch = git('rev-parse', '--abbrev-ref', 'HEAD')
    git('checkout', '-b', 'feature')
    fs.writeFileSync(path.join(tmpRepo, 'feature-only.txt'), 'feature content\n')
    git('add', 'feature-only.txt')
    git('commit', '-m', 'add feature file')
    git('checkout', targetBranch)
    git('merge', '--no-ff', 'feature', '-m', 'Merge feature')
    const mergeHash = git('rev-parse', 'HEAD')
    const diff = await getCommitDiff(tmpRepo, mergeHash)
    assert.ok(diff.includes('diff --git'), 'merge diff should contain diff headers')
    assert.ok(diff.includes('feature-only.txt'), 'merge diff should mention the merged file')
    assert.ok(diff.includes('+feature content'), 'merge diff should include the added line')
  })
})

describe('editCommitMessage', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'initial')
    git('add', 'file.txt')
    git('commit', '-m', 'first commit')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'second')
    git('add', 'file.txt')
    git('commit', '-m', 'second commit')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'third')
    git('add', 'file.txt')
    git('commit', '-m', 'third commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should amend the HEAD commit message', async () => {
    await editCommitMessage(tmpRepo, git('rev-parse', 'HEAD'), 'updated third commit')
    const msg = git('log', '-1', '--format=%s')
    assert.equal(msg, 'updated third commit')
  })

  it('should not change other commits when amending HEAD', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, git('rev-parse', 'HEAD'), 'updated third')
    const secondMsg = git('log', '-1', '--format=%s', secondHash)
    assert.equal(secondMsg, 'second commit')
  })

  it('should reword a non-HEAD commit via rebase', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, secondHash, 'reworded second commit')
    const msg = git('log', '--format=%s', '--skip=1', '-1')
    assert.equal(msg, 'reworded second commit')
  })

  it('should preserve HEAD message when rewording an older commit', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, secondHash, 'reworded second')
    const headMsg = git('log', '-1', '--format=%s')
    assert.equal(headMsg, 'third commit')
  })

  it('should reject when there are staged changes and editing HEAD', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'staged change')
    git('add', 'file.txt')
    await assert.rejects(() => editCommitMessage(tmpRepo, git('rev-parse', 'HEAD'), 'should fail'), /staged changes/)
  })

  it('should reject when working tree is dirty and editing non-HEAD', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'dirty change')
    await assert.rejects(() => editCommitMessage(tmpRepo, secondHash, 'should fail'), /uncommitted changes/)
  })

  it('should amend HEAD commit with a new date', async () => {
    await editCommitMessage(tmpRepo, git('rev-parse', 'HEAD'), 'third commit', '2020-01-15 10:30:00')
    const newDate = git('log', '-1', '--format=%ai')
    assert.ok(newDate.includes('2020-01-15'))
  })

  function startConflictedRebase(): void {
    const mainBranch = git('branch', '--show-current')
    git('checkout', '-b', 'feature', 'HEAD~2')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'conflicting change')
    git('add', 'file.txt')
    git('commit', '-m', 'feature commit')
    let stopped = false
    try {
      git('rebase', mainBranch)
    } catch {
      stopped = true // expected: rebase stops with a conflict and stays in progress
    }
    assert.ok(stopped, 'rebase should have stopped on a conflict')
  }

  it('should reject when a rebase is already in progress and editing non-HEAD', async () => {
    startConflictedRebase()
    const targetHash = git('log', '--format=%H', '--skip=1', '-1')
    await assert.rejects(() => editCommitMessage(tmpRepo, targetHash, 'should fail'), /rebase is already in progress/)
  })

  it("should not abort the user's in-progress rebase when rejecting", async () => {
    startConflictedRebase()
    const targetHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, targetHash, 'should fail').catch(() => {})
    assert.equal(await isRebaseInProgress(tmpRepo), true, 'the user rebase must still be in progress')
  })
  it('should reword a non-HEAD commit with a new date via rebase', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, secondHash, 'second commit', '2019-06-20 14:00:00')
    const logOutput = git('log', '--format=%ai', '--all')
    assert.ok(logOutput.includes('2019-06-20'))
  })

  it('should set both author AND committer date when amending HEAD with a new date', async () => {
    await editCommitMessage(tmpRepo, git('rev-parse', 'HEAD'), 'third commit', '2020-01-15 10:30:00')
    const authorDate = git('log', '-1', '--format=%ai')
    const committerDate = git('log', '-1', '--format=%ci')
    assert.ok(authorDate.includes('2020-01-15 10:30:00'), `expected author date 2020-01-15 10:30:00, got: ${authorDate}`)
    assert.ok(committerDate.includes('2020-01-15 10:30:00'), `expected committer date 2020-01-15 10:30:00, got: ${committerDate}`)
  })

  it('should set both author AND committer date when rewording a non-HEAD commit', async () => {
    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, secondHash, 'second commit', '2019-06-20 14:00:00')
    const newSecondAuthor = git('log', '--format=%ai', '--skip=1', '-1')
    const newSecondCommitter = git('log', '--format=%ci', '--skip=1', '-1')
    assert.ok(newSecondAuthor.includes('2019-06-20 14:00:00'), `author: ${newSecondAuthor}`)
    assert.ok(newSecondCommitter.includes('2019-06-20 14:00:00'), `committer: ${newSecondCommitter}`)
  })

  it('should preserve committer date of later commits when editing an older commit', async () => {
    // Pin the third (HEAD) commit to a known past date for both author and committer.
    const pastDate = '2020-03-10T12:00:00+00:00'
    execFileSync('git', ['commit', '--amend', '--no-edit', '--date', pastDate], {
      cwd: tmpRepo,
      env: { ...process.env, GIT_COMMITTER_DATE: pastDate }
    })
    const thirdAuthorBefore = git('log', '-1', '--format=%aI')
    const thirdCommitterBefore = git('log', '-1', '--format=%cI')

    const secondHash = git('log', '--format=%H', '--skip=1', '-1')
    await editCommitMessage(tmpRepo, secondHash, 'reworded second', '2019-06-20 14:00:00')

    const thirdAuthorAfter = git('log', '-1', '--format=%aI')
    const thirdCommitterAfter = git('log', '-1', '--format=%cI')

    assert.equal(thirdAuthorAfter, thirdAuthorBefore, 'third commit author date should be preserved')
    assert.equal(
      thirdCommitterAfter,
      thirdCommitterBefore,
      'third commit committer date should be preserved (not reset to rebase time)'
    )
  })
})

describe('isRebaseInProgress', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'one')
    git('add', 'file.txt')
    git('commit', '-m', 'first')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'two')
    git('add', 'file.txt')
    git('commit', '-m', 'second')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  function startConflictedRebase(): void {
    const mainBranch = git('branch', '--show-current')
    git('checkout', '-b', 'feature', 'HEAD~1')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'conflict')
    git('add', 'file.txt')
    git('commit', '-m', 'feature change')
    let stopped = false
    try {
      git('rebase', mainBranch)
    } catch {
      stopped = true // expected: rebase stops with a conflict and stays in progress
    }
    assert.ok(stopped, 'rebase should have stopped on a conflict')
  }

  it('should return false in a repository with no rebase in progress', async () => {
    assert.equal(await isRebaseInProgress(tmpRepo), false)
  })

  it('should return true while a conflicted rebase is in progress', async () => {
    startConflictedRebase()
    assert.equal(await isRebaseInProgress(tmpRepo), true)
  })

  it('should return false again after the rebase is aborted', async () => {
    startConflictedRebase()
    git('rebase', '--abort')
    assert.equal(await isRebaseInProgress(tmpRepo), false)
  })
})

describe('getCommitDateIso', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-date-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'hello')
    git('add', 'file.txt')
    git('commit', '-m', 'initial commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should return ISO date for a commit', async () => {
    const log = await getCommitLog(tmpRepo, 1)
    const date = await getCommitDateIso(tmpRepo, log[0].hash)
    assert.ok(date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), `expected ISO format, got: ${date}`)
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => getCommitDateIso(tmpRepo, 'invalid-hash'))
  })
})

describe('resetToCommit', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-reset-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'one')
    git('add', 'file.txt')
    git('commit', '-m', 'first')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'two')
    git('add', 'file.txt')
    git('commit', '-m', 'second')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'three')
    git('add', 'file.txt')
    git('commit', '-m', 'third')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should move HEAD with --soft and keep changes staged', async () => {
    const firstHash = git('log', '--format=%H', '--reverse').split('\n')[0]
    await resetToCommit(tmpRepo, firstHash, 'soft')
    assert.equal(git('rev-parse', 'HEAD'), firstHash)
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('file.txt'), 'file.txt should be staged')
    assert.equal(fs.readFileSync(path.join(tmpRepo, 'file.txt'), 'utf-8'), 'three')
  })

  it('should move HEAD with --hard and discard working tree changes', async () => {
    const firstHash = git('log', '--format=%H', '--reverse').split('\n')[0]
    await resetToCommit(tmpRepo, firstHash, 'hard')
    assert.equal(git('rev-parse', 'HEAD'), firstHash)
    assert.equal(git('diff', '--cached', '--name-only'), '')
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(fs.readFileSync(path.join(tmpRepo, 'file.txt'), 'utf-8'), 'one')
  })

  it('should move HEAD with --mixed and unstage changes', async () => {
    const firstHash = git('log', '--format=%H', '--reverse').split('\n')[0]
    await resetToCommit(tmpRepo, firstHash, 'mixed')
    assert.equal(git('rev-parse', 'HEAD'), firstHash)
    assert.equal(git('diff', '--cached', '--name-only'), '')
    assert.ok(git('status', '--porcelain').includes('file.txt'))
    assert.equal(fs.readFileSync(path.join(tmpRepo, 'file.txt'), 'utf-8'), 'three')
  })

  it('should be a no-op when resetting to current HEAD with --soft', async () => {
    const headHash = git('rev-parse', 'HEAD')
    await resetToCommit(tmpRepo, headHash, 'soft')
    assert.equal(git('rev-parse', 'HEAD'), headHash)
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => resetToCommit(tmpRepo, 'invalid-hash', 'soft'))
  })

  it('should reject for an invalid cwd', async () => {
    const headHash = git('rev-parse', 'HEAD')
    await assert.rejects(() => resetToCommit('/nonexistent-dir', headHash, 'soft'))
  })
})

describe('countCommitsBetween', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-count-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'one')
    git('add', 'file.txt')
    git('commit', '-m', 'first')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'two')
    git('add', 'file.txt')
    git('commit', '-m', 'second')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'three')
    git('add', 'file.txt')
    git('commit', '-m', 'third')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should count commits between first and HEAD', async () => {
    const firstHash = git('log', '--format=%H', '--reverse').split('\n')[0]
    const headHash = git('rev-parse', 'HEAD')
    const count = await countCommitsBetween(tmpRepo, firstHash, headHash)
    assert.equal(count, 2)
  })

  it('should return 0 when from and to are the same', async () => {
    const headHash = git('rev-parse', 'HEAD')
    const count = await countCommitsBetween(tmpRepo, headHash, headHash)
    assert.equal(count, 0)
  })

  it('should count 1 commit between adjacent commits', async () => {
    const [firstHash, secondHash] = git('log', '--format=%H', '--reverse').split('\n').slice(0, 2)
    const count = await countCommitsBetween(tmpRepo, firstHash, secondHash)
    assert.equal(count, 1)
  })

  it('should reject for an invalid hash', async () => {
    await assert.rejects(() => countCommitsBetween(tmpRepo, 'invalid-hash', 'HEAD'))
  })

  it('should reject for an invalid cwd', async () => {
    await assert.rejects(() => countCommitsBetween('/nonexistent-dir', 'HEAD', 'HEAD'))
  })
})

describe('hasUncommittedChanges', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-dirty-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'initial')
    git('add', 'file.txt')
    git('commit', '-m', 'initial commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should return false for a clean working tree', async () => {
    const result = await hasUncommittedChanges(tmpRepo)
    assert.equal(result, false)
  })

  it('should return true for modified unstaged file', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'modified')
    const result = await hasUncommittedChanges(tmpRepo)
    assert.equal(result, true)
  })

  it('should return true for modified staged file', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'modified')
    git('add', 'file.txt')
    const result = await hasUncommittedChanges(tmpRepo)
    assert.equal(result, true)
  })

  it('should return true for untracked file', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'new.txt'), 'new')
    const result = await hasUncommittedChanges(tmpRepo)
    assert.equal(result, true)
  })

  it('should reject for an invalid cwd', async () => {
    await assert.rejects(() => hasUncommittedChanges('/nonexistent-dir'))
  })
})

describe('stageFile', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-stage-test-'))
    git('init')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')

    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'initial')
    git('add', 'file.txt')
    git('commit', '-m', 'initial commit')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should stage a single modified file', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'file.txt'), 'modified')
    await stageFile(tmpRepo, 'file.txt')
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('file.txt'))
  })

  it('should stage a new untracked file', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'new.txt'), 'new file')
    await stageFile(tmpRepo, 'new.txt')
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('new.txt'))
  })

  it('should stage multiple files at once', async () => {
    fs.writeFileSync(path.join(tmpRepo, 'a.txt'), 'a')
    fs.writeFileSync(path.join(tmpRepo, 'b.txt'), 'b')
    await stageFile(tmpRepo, 'a.txt', 'b.txt')
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('a.txt'))
    assert.ok(staged.includes('b.txt'))
  })

  it('should stage a folder recursively', async () => {
    const subdir = path.join(tmpRepo, 'src')
    fs.mkdirSync(subdir)
    fs.writeFileSync(path.join(subdir, 'one.txt'), 'one')
    fs.writeFileSync(path.join(subdir, 'two.txt'), 'two')
    await stageFile(tmpRepo, 'src')
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('src/one.txt'))
    assert.ok(staged.includes('src/two.txt'))
  })

  it('should stage files in nested subdirectories', async () => {
    const nested = path.join(tmpRepo, 'src', 'deep')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'file.txt'), 'deep')
    await stageFile(tmpRepo, 'src')
    const staged = git('diff', '--cached', '--name-only')
    assert.ok(staged.includes('src/deep/file.txt'))
  })

  it('should reject for a nonexistent file', async () => {
    await assert.rejects(() => stageFile(tmpRepo, 'nonexistent.txt'))
  })
})

describe('getChangedFileDirectories', () => {
  it('should return parent directories of changed files', () => {
    const result = getChangedFileDirectories(['src/utils/git.ts'])
    assert.deepEqual(result, ['src', 'src/utils'])
  })

  it('should return empty array for root-level files', () => {
    const result = getChangedFileDirectories(['README.md'])
    assert.deepEqual(result, [])
  })

  it('should deduplicate shared parent directories', () => {
    const result = getChangedFileDirectories(['src/utils/git.ts', 'src/utils/files.ts'])
    assert.deepEqual(result, ['src', 'src/utils'])
  })

  it('should sort from shallowest to deepest', () => {
    const result = getChangedFileDirectories(['src/features/nuget/nuget-api.ts', 'src/utils/git.ts'])
    assert.deepEqual(result, ['src', 'src/features', 'src/utils', 'src/features/nuget'])
  })

  it('should include all ancestor directories', () => {
    const result = getChangedFileDirectories(['a/b/c/d/file.ts'])
    assert.deepEqual(result, ['a', 'a/b', 'a/b/c', 'a/b/c/d'])
  })

  it('should handle multiple files in different trees', () => {
    const result = getChangedFileDirectories(['src/a.ts', 'lib/b.ts', 'test/c.ts'])
    assert.deepEqual(result, ['lib', 'src', 'test'])
  })

  it('should return empty array for empty input', () => {
    assert.deepEqual(getChangedFileDirectories([]), [])
  })

  it('should handle files with mixed depths', () => {
    const result = getChangedFileDirectories(['README.md', 'src/extension.ts', 'src/features/expand-changed.ts'])
    assert.deepEqual(result, ['src', 'src/features'])
  })
})
