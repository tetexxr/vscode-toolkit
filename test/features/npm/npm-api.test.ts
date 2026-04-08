import { strict as assert } from 'assert'
import { stripVersionRange, encodePackageName, resolveAuthor, searchResultToViewModel } from '../../../src/features/npm/npm-api'
import type { NpmSearchObject } from '../../../src/features/npm/npm-types'

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
})

describe('searchResultToViewModel', () => {
  function makeSearchObject(overrides: Partial<NpmSearchObject['package']> = {}): NpmSearchObject {
    return {
      package: {
        name: 'test-pkg',
        version: '1.0.0',
        description: 'A test package',
        keywords: ['test'],
        date: '2024-01-15',
        publisher: { username: 'testuser', email: 'test@example.com' },
        maintainers: [{ username: 'testuser', email: 'test@example.com' }],
        links: { npm: 'https://npmjs.com/package/test-pkg', homepage: 'https://example.com' },
        ...overrides
      },
      score: { final: 0.9, detail: { quality: 0.9, popularity: 0.8, maintenance: 0.9 } },
      searchScore: 100
    }
  }

  it('should map basic fields correctly', () => {
    const result = searchResultToViewModel(makeSearchObject(), 'https://registry.npmjs.org')
    assert.equal(result.name, 'test-pkg')
    assert.equal(result.version, '1.0.0')
    assert.equal(result.description, 'A test package')
    assert.equal(result.author, 'testuser')
    assert.equal(result.homepage, 'https://example.com')
    assert.equal(result.sourceUrl, 'https://registry.npmjs.org')
  })

  it('should default isInstalled and isOutdated to false', () => {
    const result = searchResultToViewModel(makeSearchObject(), 'https://registry.npmjs.org')
    assert.equal(result.isInstalled, false)
    assert.equal(result.isOutdated, false)
    assert.equal(result.installedVersionRange, '')
    assert.equal(result.dependencyType, '')
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
    const result = searchResultToViewModel(makeSearchObject({ keywords: undefined as unknown as string[] }), 'https://registry.npmjs.org')
    assert.deepEqual(result.keywords, [])
  })

  it('should handle missing publisher', () => {
    const result = searchResultToViewModel(
      makeSearchObject({ publisher: undefined as unknown as { username: string; email: string } }),
      'https://registry.npmjs.org'
    )
    assert.equal(result.author, '')
  })
})
