import { strict as assert } from 'assert'
import {
  parseBlamePorcelain,
  isUncommittedSha,
  extractSubject,
  extractBody,
  formatHover
} from '../../src/features/peek-commit-utils'

const SAMPLE_PORCELAIN = [
  'abc1234567890abcdef1234567890abcdef123456 42 42 1',
  'author Xavier Xiqués',
  'author-mail <xavier@example.com>',
  'author-time 1700000000',
  'author-tz +0200',
  'committer Xavier Xiqués',
  'committer-mail <xavier@example.com>',
  'committer-time 1700000000',
  'committer-tz +0200',
  'summary Add aliasing support to import converter',
  'filename src/features/imports.ts',
  '\tconst foo = bar()'
].join('\n')

const UNCOMMITTED_PORCELAIN = [
  '0000000000000000000000000000000000000000 1 1 1',
  'author Not Committed Yet',
  'author-mail <not.committed.yet>',
  'author-time 1700000000',
  'author-tz +0200',
  'committer Not Committed Yet',
  'committer-mail <not.committed.yet>',
  'committer-time 1700000000',
  'committer-tz +0200',
  'summary Version of file.ts',
  'previous abc1234 file.ts',
  'filename file.ts',
  '\tnew unsaved line'
].join('\n')

describe('parseBlamePorcelain', () => {
  it('parses a typical entry', () => {
    const info = parseBlamePorcelain(SAMPLE_PORCELAIN)
    assert.ok(info)
    assert.equal(info!.sha, 'abc1234567890abcdef1234567890abcdef123456')
    assert.equal(info!.author, 'Xavier Xiqués')
    assert.equal(info!.authorEmail, 'xavier@example.com')
    assert.equal(info!.authorTime, 1700000000)
    assert.equal(info!.summary, 'Add aliasing support to import converter')
    assert.equal(info!.uncommitted, false)
  })

  it('detects the uncommitted sha sentinel', () => {
    const info = parseBlamePorcelain(UNCOMMITTED_PORCELAIN)
    assert.ok(info)
    assert.equal(info!.uncommitted, true)
    assert.equal(info!.author, 'Not Committed Yet')
  })

  it('returns null on empty or malformed input', () => {
    assert.equal(parseBlamePorcelain(''), null)
    assert.equal(parseBlamePorcelain('not a porcelain header'), null)
  })

  it('handles a header with no group size', () => {
    const text = 'abc1234567890abcdef1234567890abcdef123456 1 1\nauthor X\nauthor-time 0\nsummary x\n\tline'
    const info = parseBlamePorcelain(text)
    assert.ok(info)
    assert.equal(info!.sha, 'abc1234567890abcdef1234567890abcdef123456')
  })
})

describe('isUncommittedSha', () => {
  it('returns true for the all-zero sha', () => {
    assert.equal(isUncommittedSha('0000000000000000000000000000000000000000'), true)
  })

  it('returns false for any other sha', () => {
    assert.equal(isUncommittedSha('abc1234567890abcdef1234567890abcdef123456'), false)
  })

  it('returns false for too-short strings', () => {
    assert.equal(isUncommittedSha('000'), false)
  })
})

describe('extractSubject / extractBody', () => {
  it('returns the first line as the subject', () => {
    assert.equal(extractSubject('fix bug\n\nlong body'), 'fix bug')
  })

  it('returns the rest as the body, with blank-line separators trimmed', () => {
    assert.equal(extractBody('fix bug\n\nlong body'), 'long body')
  })

  it('returns an empty body for single-line messages', () => {
    assert.equal(extractBody('subject only'), '')
  })

  it('handles empty input', () => {
    assert.equal(extractSubject(''), '')
    assert.equal(extractBody(''), '')
  })
})

describe('formatHover', () => {
  it('renders subject, hash, author and relative date', () => {
    const blame = parseBlamePorcelain(SAMPLE_PORCELAIN)!
    const md = formatHover(blame, { fullMessage: 'Add aliasing support', now: 1700000000_000 + 60_000 })
    assert.match(md, /\*\*Add aliasing support\*\*/)
    assert.match(md, /`abc1234`/)
    assert.match(md, /Xavier Xiqués/)
    assert.match(md, /1 minute ago/)
  })

  it('includes the commit body when present', () => {
    const blame = parseBlamePorcelain(SAMPLE_PORCELAIN)!
    const md = formatHover(blame, {
      fullMessage: 'subject\n\nbody line one\nbody line two',
      now: 1700000000_000
    })
    assert.match(md, /body line one/)
    assert.match(md, /body line two/)
  })

  it('returns the not-committed placeholder for uncommitted lines', () => {
    const blame = parseBlamePorcelain(UNCOMMITTED_PORCELAIN)!
    const md = formatHover(blame)
    assert.match(md, /Not committed yet/)
    assert.doesNotMatch(md, /Show full commit/)
  })

  it('escapes markdown special characters in the subject and author', () => {
    const blame: Parameters<typeof formatHover>[0] = {
      sha: 'abc1234',
      author: '[brackets]_user',
      authorEmail: 'x@x',
      authorTime: 1700000000,
      summary: '*bold* commit',
      uncommitted: false
    }
    const md = formatHover(blame, { now: 1700000000_000 })
    assert.match(md, /\\\[brackets\\\]/)
    assert.match(md, /\\\*bold\\\* commit/)
  })

  it('includes a "Show full commit" command link', () => {
    const blame = parseBlamePorcelain(SAMPLE_PORCELAIN)!
    const md = formatHover(blame, { fullMessage: 'subject' })
    assert.match(md, /command:toolkit\.peekCommit\.showFull/)
    assert.match(md, /Show full commit/)
  })
})
