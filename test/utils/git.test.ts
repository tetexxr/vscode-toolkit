import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { parseRemoteUrl, getFileLogPatch, getFileBlame, BlameInfo } from '../../src/utils/git'

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
