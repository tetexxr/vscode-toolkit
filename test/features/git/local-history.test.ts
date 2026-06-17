import { strict as assert } from 'assert'
import {
  contentHash,
  formatAge,
  formatSize,
  historyKey,
  isDuplicateOfLatest,
  makeRevisionId,
  pruneRevisions,
  type RevisionMeta
} from '../../../src/features/git/local-history-utils'

const DAY = 24 * 60 * 60 * 1000

function rev(id: string, timestamp: number, hash = id): RevisionMeta {
  return { id, timestamp, size: 10, hash }
}

describe('historyKey', () => {
  it('should be stable for the same URI', () => {
    assert.equal(historyKey('file:///a/b.ts'), historyKey('file:///a/b.ts'))
  })

  it('should differ for different URIs', () => {
    assert.notEqual(historyKey('file:///a/b.ts'), historyKey('file:///a/c.ts'))
  })

  it('should be filesystem-safe (hex only)', () => {
    assert.match(historyKey('file:///weird path/ñ.ts'), /^[0-9a-f]+$/)
  })
})

describe('contentHash', () => {
  it('should match for identical content', () => {
    assert.equal(contentHash('hello'), contentHash('hello'))
  })

  it('should differ for different content', () => {
    assert.notEqual(contentHash('hello'), contentHash('world'))
  })
})

describe('makeRevisionId', () => {
  it('should produce distinct ids for the same timestamp with different counters', () => {
    assert.notEqual(makeRevisionId(1000, 0), makeRevisionId(1000, 1))
  })
})

describe('isDuplicateOfLatest', () => {
  it('should return false when there are no revisions', () => {
    assert.equal(isDuplicateOfLatest([], 'abc'), false)
  })

  it('should return true when the hash matches the newest revision', () => {
    const revisions = [rev('2', 200, 'abc'), rev('1', 100, 'xyz')]
    assert.equal(isDuplicateOfLatest(revisions, 'abc'), true)
  })

  it('should return false when the hash matches only an older revision', () => {
    const revisions = [rev('2', 200, 'abc'), rev('1', 100, 'xyz')]
    assert.equal(isDuplicateOfLatest(revisions, 'xyz'), false)
  })
})

describe('pruneRevisions', () => {
  it('should keep everything when under both limits', () => {
    const revisions = [rev('3', 300), rev('2', 200), rev('1', 100)]
    const { kept, removed } = pruneRevisions(revisions, { maxRevisions: 10, maxAgeMs: DAY }, 400)
    assert.equal(kept.length, 3)
    assert.equal(removed.length, 0)
  })

  it('should drop revisions beyond the count cap, keeping the newest', () => {
    const revisions = [rev('3', 300), rev('2', 200), rev('1', 100)]
    const { kept, removed } = pruneRevisions(revisions, { maxRevisions: 2, maxAgeMs: 0 }, 400)
    assert.deepEqual(kept.map(r => r.id), ['3', '2'])
    assert.deepEqual(removed.map(r => r.id), ['1'])
  })

  it('should drop revisions older than the age limit', () => {
    const now = 100 * DAY
    const revisions = [rev('new', now - 1 * DAY), rev('old', now - 40 * DAY)]
    const { kept, removed } = pruneRevisions(revisions, { maxRevisions: 0, maxAgeMs: 30 * DAY }, now)
    assert.deepEqual(kept.map(r => r.id), ['new'])
    assert.deepEqual(removed.map(r => r.id), ['old'])
  })

  it('should always keep the newest revision even when it is older than the age limit', () => {
    const now = 100 * DAY
    const revisions = [rev('only', now - 90 * DAY)]
    const { kept, removed } = pruneRevisions(revisions, { maxRevisions: 0, maxAgeMs: 30 * DAY }, now)
    assert.deepEqual(kept.map(r => r.id), ['only'])
    assert.equal(removed.length, 0)
  })

  it('should treat non-positive limits as unlimited', () => {
    const revisions = [rev('3', 300), rev('2', 200), rev('1', 100)]
    const { kept, removed } = pruneRevisions(revisions, { maxRevisions: 0, maxAgeMs: 0 }, 400)
    assert.equal(kept.length, 3)
    assert.equal(removed.length, 0)
  })
})

describe('formatAge', () => {
  it('should say "just now" for very recent timestamps', () => {
    assert.equal(formatAge(1000, 1000), 'just now')
    assert.equal(formatAge(1000, 6000), 'just now')
  })

  it('should report seconds, minutes, hours and days', () => {
    const base = 0
    assert.equal(formatAge(base, 30 * 1000), '30s ago')
    assert.equal(formatAge(base, 5 * 60 * 1000), '5 min ago')
    assert.equal(formatAge(base, 3 * 60 * 60 * 1000), '3 h ago')
    assert.equal(formatAge(base, 2 * DAY), '2 d ago')
  })

  it('should fall back to months and years for old timestamps', () => {
    assert.equal(formatAge(0, 90 * DAY), '3 mo ago')
    assert.equal(formatAge(0, 800 * DAY), '2 y ago')
  })
})

describe('formatSize', () => {
  it('should report bytes under 1 KB', () => {
    assert.equal(formatSize(512), '512 B')
  })

  it('should report KB with one decimal under 10 KB', () => {
    assert.equal(formatSize(1536), '1.5 KB')
  })

  it('should round KB without decimals at or above 10 KB', () => {
    assert.equal(formatSize(20 * 1024), '20 KB')
  })

  it('should report MB for large sizes', () => {
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB')
  })
})
