import { strict as assert } from 'assert'
import { applyOutdatedToProject, isPinned, stripVersionRange } from '../../../src/features/npm/npm-utils'
import type { NpmOverviewProject } from '../../../src/features/npm/npm-types'
import type { NpmOutdatedEntry } from '../../../src/features/npm/npm-cli'

// ── isPinned ─────────────────────────────────────────────

describe('isPinned (npm)', () => {
  it('should return true when the range is a bare semver version', () => {
    assert.equal(isPinned('1.0.0'), true)
    assert.equal(isPinned('1.2.3-beta'), true)
    assert.equal(isPinned('1.2.3-rc.1+build.4'), true)
  })

  it('should return false when the range uses any semver operator', () => {
    assert.equal(isPinned('^1.0.0'), false)
    assert.equal(isPinned('~1.0.0'), false)
    assert.equal(isPinned('>=1.0.0'), false)
    assert.equal(isPinned('1.x'), false)
    assert.equal(isPinned('*'), false)
  })

  it('should ignore leading/trailing whitespace before deciding', () => {
    assert.equal(isPinned('  1.0.0  '), true)
    assert.equal(isPinned('  ^1.0.0'), false)
  })
})

// ── stripVersionRange ────────────────────────────────────

describe('stripVersionRange', () => {
  it('should strip caret, tilde and comparison operators', () => {
    assert.equal(stripVersionRange('^1.0.0'), '1.0.0')
    assert.equal(stripVersionRange('~1.0.0'), '1.0.0')
    assert.equal(stripVersionRange('>=1.0.0'), '1.0.0')
  })

  it('should pass through a bare version unchanged', () => {
    assert.equal(stripVersionRange('1.0.0'), '1.0.0')
  })

  it('should return empty for wildcards and the latest tag', () => {
    assert.equal(stripVersionRange('*'), '')
    assert.equal(stripVersionRange('latest'), '')
    assert.equal(stripVersionRange(''), '')
  })
})

// ── applyOutdatedToProject ───────────────────────────────

describe('applyOutdatedToProject', () => {
  function project(packages: { name: string; range: string }[]): NpmOverviewProject {
    return {
      name: 'demo',
      fsPath: '/repo/package.json',
      packages: packages.map(p => ({
        name: p.name,
        installedVersionRange: p.range,
        latestVersion: '',
        dependencyType: 'dependencies',
        isOutdated: false
      }))
    }
  }

  function outdated(map: Record<string, Partial<NpmOutdatedEntry>>): Record<string, NpmOutdatedEntry> {
    const result: Record<string, NpmOutdatedEntry> = {}
    for (const [name, entry] of Object.entries(map)) {
      result[name] = {
        current: entry.current,
        wanted: entry.wanted ?? entry.latest ?? '',
        latest: entry.latest ?? '',
        dependent: entry.dependent ?? 'demo'
      }
    }
    return result
  }

  it('should mark a package as outdated when npm outdated reports a higher latest', () => {
    const proj = project([{ name: 'lodash', range: '^4.17.20' }])
    applyOutdatedToProject(proj, outdated({ lodash: { current: '4.17.20', latest: '4.17.21' } }))
    const pkg = proj.packages[0]
    assert.equal(pkg.latestVersion, '4.17.21')
    assert.equal(pkg.isOutdated, true)
    assert.equal(pkg.versionBump, 'patch')
  })

  it('should treat a package absent from the outdated map as up-to-date', () => {
    const proj = project([{ name: 'lodash', range: '^4.17.21' }])
    applyOutdatedToProject(proj, outdated({}))
    const pkg = proj.packages[0]
    assert.equal(pkg.latestVersion, '4.17.21') // stripped range
    assert.equal(pkg.isOutdated, false)
    assert.equal(pkg.versionBump, undefined)
  })

  it('should set isPinned and never flag a pinned package as outdated even when latest differs', () => {
    const proj = project([{ name: 'lodash', range: '4.17.20' }])
    applyOutdatedToProject(proj, outdated({ lodash: { current: '4.17.20', latest: '4.17.21' } }))
    const pkg = proj.packages[0]
    assert.equal(pkg.isPinned, true)
    assert.equal(pkg.isOutdated, false)
    assert.equal(pkg.versionBump, undefined)
  })

  it('should classify a major version bump correctly', () => {
    const proj = project([{ name: 'react', range: '^17.0.0' }])
    applyOutdatedToProject(proj, outdated({ react: { current: '17.0.0', latest: '18.0.0' } }))
    assert.equal(proj.packages[0].versionBump, 'major')
  })

  it('should fall back to the stripped range when current is missing from npm outdated', () => {
    const proj = project([{ name: 'react', range: '^17.0.0' }])
    applyOutdatedToProject(proj, outdated({ react: { latest: '18.0.0' } }))
    const pkg = proj.packages[0]
    assert.equal(pkg.isOutdated, true)
    assert.equal(pkg.versionBump, 'major')
  })
})
