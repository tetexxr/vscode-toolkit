import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { filterGitIgnored, parseCheckIgnoreOutput } from '../../src/utils/git-ignore'

describe('parseCheckIgnoreOutput', () => {
  it('should parse null-separated paths', () => {
    const out = parseCheckIgnoreOutput('node_modules/foo.js\0dist/bundle.js\0')
    assert.deepEqual(out, ['node_modules/foo.js', 'dist/bundle.js'])
  })

  it('should return an empty array for empty input', () => {
    assert.deepEqual(parseCheckIgnoreOutput(''), [])
  })

  it('should drop trailing empty fields', () => {
    assert.deepEqual(parseCheckIgnoreOutput('a\0b\0\0'), ['a', 'b'])
  })

  it('should accept absolute paths', () => {
    assert.deepEqual(
      parseCheckIgnoreOutput('/repo/dist/foo.js\0/repo/node_modules/x.js\0'),
      ['/repo/dist/foo.js', '/repo/node_modules/x.js']
    )
  })

  it('should preserve UTF-8 characters in paths', () => {
    assert.deepEqual(parseCheckIgnoreOutput('café/menu.txt\0'), ['café/menu.txt'])
  })
})

describe('filterGitIgnored', () => {
  let tmpRepo: string

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: tmpRepo }).toString().trim()
  }

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'))
    git('init')
    fs.writeFileSync(path.join(tmpRepo, '.gitignore'), '*.log\nbuild/\n')
    fs.writeFileSync(path.join(tmpRepo, 'ignored.log'), 'x')
    fs.writeFileSync(path.join(tmpRepo, 'kept.txt'), 'x')
  })

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true })
  })

  it('should filter out paths matched by .gitignore', async () => {
    const result = await filterGitIgnored(['ignored.log', 'kept.txt'], tmpRepo)
    assert.deepEqual(result, ['kept.txt'])
  })

  it('should keep everything when nothing is ignored', async () => {
    const result = await filterGitIgnored(['kept.txt', '.gitignore'], tmpRepo)
    assert.deepEqual(result, ['kept.txt', '.gitignore'])
  })

  it('should return the input unchanged when cwd is not a git repository', async () => {
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-norepo-'))
    try {
      const result = await filterGitIgnored(['a.log', 'b.txt'], plainDir)
      assert.deepEqual(result, ['a.log', 'b.txt'])
    } finally {
      fs.rmSync(plainDir, { recursive: true, force: true })
    }
  })

  it('should return an empty array for an empty input', async () => {
    assert.deepEqual(await filterGitIgnored([], tmpRepo), [])
  })
})
