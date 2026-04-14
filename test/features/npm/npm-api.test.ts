import { strict as assert } from 'assert'
import {
  stripVersionRange,
  encodePackageName,
  resolveAuthor,
  searchResultToViewModel,
  extractVersionDetails,
  filterAndSortResults
} from '../../../src/features/npm/npm-api'
import type { NpmSearchObject, NpmPackageMetadata, NpmPackageViewModel } from '../../../src/features/npm/npm-types'

describe('stripVersionRange', () => {
  it('should strip caret prefix', () => {
    assert.equal(stripVersionRange('^1.2.3'), '1.2.3')
  })

  it('should strip tilde prefix', () => {
    assert.equal(stripVersionRange('~1.0.0'), '1.0.0')
  })

  it('should strip >= prefix', () => {
    assert.equal(stripVersionRange('>=1.0.0'), '1.0.0')
  })

  it('should strip > prefix', () => {
    assert.equal(stripVersionRange('>1.0.0'), '1.0.0')
  })

  it('should strip <= prefix', () => {
    assert.equal(stripVersionRange('<=1.0.0'), '1.0.0')
  })

  it('should strip < prefix', () => {
    assert.equal(stripVersionRange('<2.0.0'), '2.0.0')
  })

  it('should strip = prefix', () => {
    assert.equal(stripVersionRange('=1.0.0'), '1.0.0')
  })

  it('should return version unchanged if no prefix', () => {
    assert.equal(stripVersionRange('1.0.0'), '1.0.0')
  })

  it('should return empty string for wildcard *', () => {
    assert.equal(stripVersionRange('*'), '')
  })

  it('should return empty string for "latest"', () => {
    assert.equal(stripVersionRange('latest'), '')
  })

  it('should return empty string for empty input', () => {
    assert.equal(stripVersionRange(''), '')
  })

  it('should handle prerelease with prefix', () => {
    assert.equal(stripVersionRange('^1.0.0-beta.1'), '1.0.0-beta.1')
  })

  it('should handle tilde with prerelease', () => {
    assert.equal(stripVersionRange('~2.0.0-rc.1'), '2.0.0-rc.1')
  })

  it('should handle prefix with spaces', () => {
    assert.equal(stripVersionRange('>= 1.0.0'), '1.0.0')
  })
})

describe('encodePackageName', () => {
  it('should return simple name unchanged', () => {
    assert.equal(encodePackageName('express'), 'express')
  })

  it('should encode scoped package name', () => {
    assert.equal(encodePackageName('@angular/core'), '@angular%2Fcore')
  })

  it('should encode nested scoped package', () => {
    assert.equal(encodePackageName('@types/node'), '@types%2Fnode')
  })

  it('should handle name with special characters', () => {
    assert.equal(encodePackageName('my-package'), 'my-package')
  })

  it('should handle name with dots', () => {
    assert.equal(encodePackageName('socket.io'), 'socket.io')
  })

  it('should handle deeply scoped package', () => {
    assert.equal(encodePackageName('@org/sub/pkg'), '@org%2Fsub%2Fpkg')
  })
})

describe('resolveAuthor', () => {
  it('should return name from object', () => {
    assert.equal(resolveAuthor({ name: 'John Doe', email: 'john@example.com' }), 'John Doe')
  })

  it('should return string directly', () => {
    assert.equal(resolveAuthor('Jane Doe'), 'Jane Doe')
  })

  it('should return empty string for undefined', () => {
    assert.equal(resolveAuthor(undefined), '')
  })

  it('should return empty string for object without name', () => {
    assert.equal(resolveAuthor({ name: '' }), '')
  })

  it('should return name from object with url only', () => {
    assert.equal(resolveAuthor({ name: 'Author', url: 'https://example.com' }), 'Author')
  })

  it('should handle author string with email format', () => {
    assert.equal(resolveAuthor('John Doe <john@example.com>'), 'John Doe <john@example.com>')
  })
})

describe('searchResultToViewModel', () => {
  function makeSearchObject(
    pkgOverrides: Partial<NpmSearchObject['package']> = {},
    objOverrides: Partial<NpmSearchObject> = {}
  ): NpmSearchObject {
    return {
      package: {
        name: 'test-pkg',
        version: '1.0.0',
        description: 'A test package',
        keywords: ['test'],
        date: '2024-01-15',
        license: 'MIT',
        publisher: { username: 'testuser', email: 'test@example.com' },
        maintainers: [{ username: 'testuser', email: 'test@example.com' }],
        links: { npm: 'https://npmjs.com/package/test-pkg', homepage: 'https://example.com' },
        ...pkgOverrides
      },
      score: { final: 0.9, detail: { quality: 0.9, popularity: 0.8, maintenance: 0.9 } },
      searchScore: 100,
      ...objOverrides
    }
  }

  it('should map basic fields correctly', () => {
    const result = searchResultToViewModel(makeSearchObject(), 'https://registry.npmjs.org')
    assert.equal(result.name, 'test-pkg')
    assert.equal(result.version, '1.0.0')
    assert.equal(result.description, 'A test package')
    assert.equal(result.author, 'testuser')
    assert.equal(result.homepage, 'https://example.com')
    assert.equal(result.license, 'MIT')
    assert.equal(result.sourceUrl, 'https://registry.npmjs.org')
  })

  it('should default isInstalled and isOutdated to false', () => {
    const result = searchResultToViewModel(makeSearchObject(), 'https://registry.npmjs.org')
    assert.equal(result.isInstalled, false)
    assert.equal(result.isOutdated, false)
    assert.equal(result.installedVersionRange, '')
    assert.equal(result.dependencyType, '')
  })

  it('should map weekly downloads', () => {
    const result = searchResultToViewModel(
      makeSearchObject({}, { downloads: { monthly: 4000000, weekly: 1000000 } }),
      'https://registry.npmjs.org'
    )
    assert.equal(result.weeklyDownloads, 1000000)
  })

  it('should handle missing downloads', () => {
    const result = searchResultToViewModel(makeSearchObject(), 'https://registry.npmjs.org')
    assert.equal(result.weeklyDownloads, undefined)
  })

  it('should handle missing description', () => {
    const result = searchResultToViewModel(makeSearchObject({ description: '' }), 'https://registry.npmjs.org')
    assert.equal(result.description, '')
  })

  it('should handle missing homepage link', () => {
    const result = searchResultToViewModel(makeSearchObject({ links: {} }), 'https://registry.npmjs.org')
    assert.equal(result.homepage, '')
  })

  it('should handle missing keywords', () => {
    const result = searchResultToViewModel(
      makeSearchObject({ keywords: undefined as unknown as string[] }),
      'https://registry.npmjs.org'
    )
    assert.deepEqual(result.keywords, [])
  })

  it('should handle missing publisher', () => {
    const result = searchResultToViewModel(
      makeSearchObject({ publisher: undefined as unknown as { username: string; email: string } }),
      'https://registry.npmjs.org'
    )
    assert.equal(result.author, '')
  })

  it('should handle missing license', () => {
    const result = searchResultToViewModel(makeSearchObject({ license: undefined }), 'https://registry.npmjs.org')
    assert.equal(result.license, '')
  })
})

describe('extractVersionDetails', () => {
  function makeMetadata(versions: Record<string, object>, time?: Record<string, string>): NpmPackageMetadata {
    const versionEntries: Record<string, any> = {}
    for (const [v, meta] of Object.entries(versions)) {
      versionEntries[v] = { name: 'test', version: v, description: '', ...meta }
    }
    return {
      name: 'test',
      description: '',
      'dist-tags': { latest: Object.keys(versions)[0] || '' },
      versions: versionEntries,
      time: time || {}
    }
  }

  it('should extract versions sorted descending', () => {
    const meta = makeMetadata({ '1.0.0': {}, '2.0.0': {}, '1.5.0': {} })
    const result = extractVersionDetails(meta, false)
    assert.deepEqual(
      result.map(v => v.version),
      ['2.0.0', '1.5.0', '1.0.0']
    )
  })

  it('should include prerelease versions when flag is true', () => {
    const meta = makeMetadata({ '1.0.0': {}, '2.0.0-beta.1': {}, '1.5.0': {} })
    const result = extractVersionDetails(meta, true)
    assert.equal(result.length, 3)
    assert.equal(result[0].version, '2.0.0-beta.1')
  })

  it('should exclude prerelease versions when flag is false', () => {
    const meta = makeMetadata({ '1.0.0': {}, '2.0.0-beta.1': {}, '1.5.0': {} })
    const result = extractVersionDetails(meta, false)
    assert.equal(result.length, 2)
    assert.ok(result.every(v => !v.version.includes('beta')))
  })

  it('should include published dates from time map', () => {
    const meta = makeMetadata({ '1.0.0': {} }, { '1.0.0': '2024-01-15T10:00:00.000Z' })
    const result = extractVersionDetails(meta, false)
    assert.equal(result[0].published, '2024-01-15T10:00:00.000Z')
  })

  it('should return empty published when time entry is missing', () => {
    const meta = makeMetadata({ '1.0.0': {} })
    const result = extractVersionDetails(meta, false)
    assert.equal(result[0].published, '')
  })

  it('should include deprecated field', () => {
    const meta = makeMetadata({ '1.0.0': { deprecated: 'Use v2 instead' } })
    const result = extractVersionDetails(meta, false)
    assert.equal(result[0].deprecated, 'Use v2 instead')
  })

  it('should include dependencies', () => {
    const meta = makeMetadata({ '1.0.0': { dependencies: { lodash: '^4.0.0' } } })
    const result = extractVersionDetails(meta, false)
    assert.deepEqual(result[0].dependencies, { lodash: '^4.0.0' })
  })

  it('should include peerDependencies', () => {
    const meta = makeMetadata({ '1.0.0': { peerDependencies: { react: '>=16' } } })
    const result = extractVersionDetails(meta, false)
    assert.deepEqual(result[0].peerDependencies, { react: '>=16' })
  })

  it('should return empty array for metadata with no versions', () => {
    const meta = makeMetadata({})
    const result = extractVersionDetails(meta, false)
    assert.deepEqual(result, [])
  })

  it('should handle many versions in correct order', () => {
    const meta = makeMetadata({
      '0.1.0': {},
      '0.2.0': {},
      '1.0.0': {},
      '1.0.1': {},
      '1.1.0': {},
      '2.0.0-alpha.1': {},
      '2.0.0': {}
    })
    const result = extractVersionDetails(meta, true)
    assert.equal(result[0].version, '2.0.0')
    assert.equal(result[1].version, '2.0.0-alpha.1')
    assert.equal(result[result.length - 1].version, '0.1.0')
  })
})

describe('filterAndSortResults', () => {
  function makePkg(name: string, description: string = ''): NpmPackageViewModel {
    return {
      name,
      version: '1.0.0',
      description,
      author: '',
      homepage: '',
      license: '',
      keywords: [],
      isInstalled: false,
      installedVersionRange: '',
      dependencyType: '',
      isOutdated: false,
      sourceUrl: ''
    }
  }

  it('should return all results when query is empty', () => {
    const results = [makePkg('zod'), makePkg('express'), makePkg('axios')]
    const filtered = filterAndSortResults(results, '')
    assert.equal(filtered.length, 3)
  })

  it('should sort results alphabetically', () => {
    const results = [makePkg('zod'), makePkg('express'), makePkg('axios')]
    const filtered = filterAndSortResults(results, '')
    assert.deepEqual(
      filtered.map(p => p.name),
      ['axios', 'express', 'zod']
    )
  })

  it('should filter by name match', () => {
    const results = [makePkg('express'), makePkg('axios'), makePkg('express-validator')]
    const filtered = filterAndSortResults(results, 'express')
    assert.equal(filtered.length, 2)
    assert.ok(filtered.every(p => p.name.includes('express')))
  })

  it('should filter by description match', () => {
    const results = [
      makePkg('pkg-a', 'A fast HTTP server'),
      makePkg('pkg-b', 'Database ORM'),
      makePkg('pkg-c', 'HTTP client')
    ]
    const filtered = filterAndSortResults(results, 'HTTP')
    assert.equal(filtered.length, 2)
  })

  it('should be case-insensitive', () => {
    const results = [makePkg('Express'), makePkg('axios')]
    const filtered = filterAndSortResults(results, 'express')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].name, 'Express')
  })

  it('should trim query whitespace', () => {
    const results = [makePkg('express'), makePkg('axios')]
    const filtered = filterAndSortResults(results, '  express  ')
    assert.equal(filtered.length, 1)
  })

  it('should return empty array when nothing matches', () => {
    const results = [makePkg('express'), makePkg('axios')]
    const filtered = filterAndSortResults(results, 'nonexistent')
    assert.deepEqual(filtered, [])
  })

  it('should return empty array for empty input', () => {
    const filtered = filterAndSortResults([], 'test')
    assert.deepEqual(filtered, [])
  })
})
