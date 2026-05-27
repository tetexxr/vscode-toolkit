import { strict as assert } from 'assert'
import {
  applyOutdatedToProject,
  buildInstalledViewModels,
  filterPackages,
  isPinned,
  stripVersionRange
} from '../../../src/features/npm/npm-utils'
import type { InstalledNpmPackage, NpmOverviewProject, NpmPackageViewModel } from '../../../src/features/npm/npm-types'
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

// ── buildInstalledViewModels ─────────────────────────────

describe('buildInstalledViewModels', () => {
  function dep(name: string, range: string, type: 'dependencies' | 'devDependencies' = 'dependencies'): InstalledNpmPackage {
    return { name, versionRange: range, dependencyType: type }
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

  it('should build a view model marked as outdated when the package appears in the outdated map', () => {
    const result = buildInstalledViewModels(
      [dep('lodash', '^4.17.20')],
      outdated({ lodash: { current: '4.17.20', latest: '4.17.21' } }),
      'https://registry.npmjs.org'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'lodash')
    assert.equal(result[0].isOutdated, true)
    assert.equal(result[0].version, '4.17.21') // latest
    assert.equal(result[0].installedVersionRange, '^4.17.20')
    assert.equal(result[0].isInstalled, true)
    assert.equal(result[0].sourceUrl, 'https://registry.npmjs.org')
  })

  it('should build a view model marked as up-to-date when the package is absent from the outdated map', () => {
    const result = buildInstalledViewModels(
      [dep('lodash', '^4.17.21')],
      outdated({}),
      'https://registry.npmjs.org'
    )
    assert.equal(result[0].isOutdated, false)
    // version falls back to stripped range
    assert.equal(result[0].version, '4.17.21')
  })

  it('should preserve dependencyType when building view models', () => {
    const result = buildInstalledViewModels(
      [dep('typescript', '^5.0.0', 'devDependencies'), dep('lodash', '^4.17.21')],
      outdated({}),
      ''
    )
    assert.equal(result[0].dependencyType, 'devDependencies')
    assert.equal(result[1].dependencyType, 'dependencies')
  })

  it('should leave description / author / downloads empty (metadata is filled later)', () => {
    const result = buildInstalledViewModels([dep('lodash', '^4.17.21')], outdated({}), '')
    assert.equal(result[0].description, '')
    assert.equal(result[0].author, '')
    assert.equal(result[0].weeklyDownloads, undefined)
  })

  it('should fall back to the stripped range as installed version when npm outdated has no current', () => {
    const result = buildInstalledViewModels(
      [dep('react', '^17.0.0')],
      outdated({ react: { latest: '18.0.0' } }),
      ''
    )
    assert.equal(result[0].isOutdated, true)
    assert.equal(result[0].version, '18.0.0')
  })
})

// ── filterPackages (npm) ─────────────────────────────────

describe('filterPackages (npm)', () => {
  function vm(name: string, isOutdated = false): NpmPackageViewModel {
    return {
      name,
      version: '1.0.0',
      description: '',
      author: '',
      homepage: '',
      license: '',
      keywords: [],
      isInstalled: true,
      installedVersionRange: '^1.0.0',
      dependencyType: 'dependencies',
      isOutdated,
      sourceUrl: ''
    }
  }

  it('should filter packages by case-insensitive substring match on the name', () => {
    const all = [vm('lodash'), vm('react'), vm('lodash.merge')]
    const result = filterPackages(all, 'lodash', 'installed')
    assert.deepEqual(
      result.map(p => p.name),
      ['lodash', 'lodash.merge']
    )
  })

  it('should keep only outdated packages when category is updates', () => {
    const all = [vm('a', true), vm('b', false), vm('c', true)]
    const result = filterPackages(all, '', 'updates')
    assert.deepEqual(
      result.map(p => p.name),
      ['a', 'c']
    )
  })

  it('should return everything when category is installed and query is empty', () => {
    const all = [vm('a'), vm('b'), vm('c')]
    const result = filterPackages(all, '', 'installed')
    assert.equal(result.length, 3)
  })

  it('should combine text filter and updates category when both are active', () => {
    const all = [vm('lodash', true), vm('lodash.merge', false), vm('react', true)]
    const result = filterPackages(all, 'lodash', 'updates')
    assert.deepEqual(
      result.map(p => p.name),
      ['lodash']
    )
  })

  it('should preserve the original input order', () => {
    const all = [vm('z'), vm('a'), vm('m')]
    const result = filterPackages(all, '', 'installed')
    assert.deepEqual(
      result.map(p => p.name),
      ['z', 'a', 'm']
    )
  })
})
