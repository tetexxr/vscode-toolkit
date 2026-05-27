import { strict as assert } from 'assert'
import {
  applyListDataToProjects,
  classifyBump,
  filterPackages,
  isPinned,
  normalizePath,
  upsertPackage
} from '../../../src/features/nuget/nuget-utils'
import type { DotnetListOutput } from '../../../src/features/nuget/nuget-cli'
import type { OverviewProject, PackageViewModel } from '../../../src/features/nuget/nuget-types'

// ── classifyBump ─────────────────────────────────────────

describe('classifyBump', () => {
  it('returns major for a major version bump', () => {
    assert.equal(classifyBump('1.0.0', '2.0.0'), 'major')
    assert.equal(classifyBump('1.2.3', '3.0.0'), 'major')
  })

  it('returns minor when the minor changes but major stays', () => {
    assert.equal(classifyBump('1.0.0', '1.1.0'), 'minor')
    assert.equal(classifyBump('4.16.0', '4.17.0'), 'minor')
  })

  it('returns patch when only patch changes', () => {
    assert.equal(classifyBump('1.0.0', '1.0.1'), 'patch')
    assert.equal(classifyBump('18.5.1', '18.5.99'), 'patch')
  })

  it('treats any prerelease latest as major (unstable API)', () => {
    assert.equal(classifyBump('1.0.0', '1.0.1-beta'), 'major')
    assert.equal(classifyBump('1.0.0', '1.1.0-preview.3'), 'major')
    assert.equal(classifyBump('2.0.0', '2.0.0-rc.1'), 'major')
  })

  it('returns undefined when either version is unparseable', () => {
    assert.equal(classifyBump('not-a-version', '1.0.0'), undefined)
    assert.equal(classifyBump('1.0.0', 'something'), undefined)
    assert.equal(classifyBump('', '1.0.0'), undefined)
  })
})

// ── isPinned ─────────────────────────────────────────────

describe('isPinned', () => {
  it('detects bracket-style pinned versions', () => {
    assert.equal(isPinned('[3.1.12]'), true)
    assert.equal(isPinned('[1.0.0, 2.0.0)'), true)
  })

  it('treats bare versions and unbounded ranges as not pinned', () => {
    assert.equal(isPinned('3.1.12'), false)
    assert.equal(isPinned('(1.0.0, )'), false)
    assert.equal(isPinned(undefined), false)
    assert.equal(isPinned(''), false)
  })
})

// ── normalizePath ────────────────────────────────────────

describe('normalizePath', () => {
  it('lowercases and collapses path segments', () => {
    assert.equal(normalizePath('/Repo/Src/App.csproj'), '/repo/src/app.csproj')
    assert.equal(normalizePath('/repo//src/./App.csproj'), '/repo/src/app.csproj')
  })
})

// ── upsertPackage ────────────────────────────────────────

describe('upsertPackage', () => {
  it('appends a new package when the project has none with that id', () => {
    const project: OverviewProject = { name: 'X', fsPath: '/x', packages: [] }
    upsertPackage(project, 'Serilog', '3.1.1', '4.0.0')
    assert.equal(project.packages.length, 1)
    assert.equal(project.packages[0].id, 'Serilog')
    assert.equal(project.packages[0].installedVersion, '3.1.1')
    assert.equal(project.packages[0].latestVersion, '4.0.0')
    assert.equal(project.packages[0].isOutdated, true)
    assert.equal(project.packages[0].versionBump, 'major')
  })

  it('updates an existing entry in place', () => {
    const project: OverviewProject = {
      name: 'X',
      fsPath: '/x',
      packages: [{ id: 'Serilog', installedVersion: 'placeholder', latestVersion: '', isOutdated: false }]
    }
    upsertPackage(project, 'Serilog', '3.1.1', '3.1.1')
    assert.equal(project.packages.length, 1)
    assert.equal(project.packages[0].installedVersion, '3.1.1')
    assert.equal(project.packages[0].latestVersion, '3.1.1')
    assert.equal(project.packages[0].isOutdated, false)
    assert.equal(project.packages[0].versionBump, undefined)
  })
})

// ── applyListDataToProjects ──────────────────────────────

describe('applyListDataToProjects', () => {
  function makeProject(fsPath: string, packages: { id: string; version: string }[] = []): OverviewProject {
    return {
      name: fsPath.split('/').pop()!,
      fsPath,
      packages: packages.map(p => ({
        id: p.id,
        installedVersion: p.version,
        latestVersion: '',
        isOutdated: false
      }))
    }
  }

  function listOutput(projectPath: string, pkgs: { id: string; requested?: string; resolved: string; latest?: string }[]): DotnetListOutput {
    return {
      version: 1,
      parameters: '',
      projects: [
        {
          path: projectPath,
          frameworks: [
            {
              framework: 'net8.0',
              topLevelPackages: pkgs.map(p => ({
                id: p.id,
                requestedVersion: p.requested ?? p.resolved,
                resolvedVersion: p.resolved,
                latestVersion: p.latest
              }))
            }
          ]
        }
      ]
    }
  }

  it('marks outdated packages and sets versionBump', () => {
    const projects = [makeProject('/repo/App.csproj', [{ id: 'Serilog', version: 'placeholder' }])]
    const installed = listOutput('/repo/App.csproj', [{ id: 'Serilog', resolved: '3.1.1' }])
    const outdated = listOutput('/repo/App.csproj', [{ id: 'Serilog', resolved: '3.1.1', latest: '4.0.0' }])

    applyListDataToProjects(projects, installed, outdated)

    const pkg = projects[0].packages[0]
    assert.equal(pkg.installedVersion, '3.1.1')
    assert.equal(pkg.latestVersion, '4.0.0')
    assert.equal(pkg.isOutdated, true)
    assert.equal(pkg.versionBump, 'major')
  })

  it('marks up-to-date packages with latestVersion = resolvedVersion and isOutdated = false', () => {
    const projects = [makeProject('/repo/App.csproj', [{ id: 'Serilog', version: 'placeholder' }])]
    const installed = listOutput('/repo/App.csproj', [{ id: 'Serilog', resolved: '3.1.1' }])
    // No outdated entry for this package → up-to-date.
    const outdated: DotnetListOutput = { version: 1, parameters: '', projects: [] }

    applyListDataToProjects(projects, installed, outdated)

    const pkg = projects[0].packages[0]
    assert.equal(pkg.installedVersion, '3.1.1')
    assert.equal(pkg.latestVersion, '3.1.1')
    assert.equal(pkg.isOutdated, false)
    assert.equal(pkg.versionBump, undefined)
  })

  it('flags packages with bracket-pinned versions as isPinned without changing isOutdated', () => {
    const projects = [
      makeProject('/repo/App.csproj', [{ id: 'SixLabors.ImageSharp', version: '[3.1.12]' }])
    ]
    const installed = listOutput('/repo/App.csproj', [
      { id: 'SixLabors.ImageSharp', requested: '[3.1.12]', resolved: '3.1.12' }
    ])
    const outdated = listOutput('/repo/App.csproj', [
      { id: 'SixLabors.ImageSharp', requested: '[3.1.12]', resolved: '3.1.12', latest: '4.0.0' }
    ])

    applyListDataToProjects(projects, installed, outdated)

    const pkg = projects[0].packages.find(p => p.id === 'SixLabors.ImageSharp')!
    assert.equal(pkg.isPinned, true)
    assert.equal(pkg.isOutdated, false)
    assert.equal(pkg.installedVersion, '[3.1.12]')
    assert.equal(pkg.latestVersion, '')
  })

  it('appends packages reported by dotnet list that the XML first paint missed (CPM case)', () => {
    const projects = [makeProject('/repo/App.csproj', [])]
    const installed = listOutput('/repo/App.csproj', [{ id: 'Newtonsoft.Json', resolved: '13.0.3' }])
    const outdated = listOutput('/repo/App.csproj', [
      { id: 'Newtonsoft.Json', resolved: '13.0.3', latest: '13.0.4' }
    ])

    applyListDataToProjects(projects, installed, outdated)

    assert.equal(projects[0].packages.length, 1)
    assert.equal(projects[0].packages[0].id, 'Newtonsoft.Json')
    assert.equal(projects[0].packages[0].latestVersion, '13.0.4')
    assert.equal(projects[0].packages[0].versionBump, 'patch')
  })

  it('matches projects case-insensitively across path normalisations', () => {
    const projects = [makeProject('/Repo/App.csproj', [{ id: 'Serilog', version: 'placeholder' }])]
    const installed = listOutput('/repo/App.csproj', [{ id: 'Serilog', resolved: '3.1.1' }])
    const outdated: DotnetListOutput = { version: 1, parameters: '', projects: [] }

    applyListDataToProjects(projects, installed, outdated)

    assert.equal(projects[0].packages[0].installedVersion, '3.1.1')
  })

  it('silently skips dotnet list projects not present in the OverviewProject list', () => {
    const projects = [makeProject('/repo/A.csproj', [{ id: 'X', version: '1.0.0' }])]
    const installed = listOutput('/repo/B.csproj', [{ id: 'X', resolved: '2.0.0' }])
    const outdated: DotnetListOutput = { version: 1, parameters: '', projects: [] }

    // Should not throw and should not touch /repo/A.csproj's packages.
    applyListDataToProjects(projects, installed, outdated)

    assert.equal(projects[0].packages[0].installedVersion, '1.0.0')
  })
})

// ── filterPackages ───────────────────────────────────────

describe('filterPackages', () => {
  function vm(id: string, isOutdated = false): PackageViewModel {
    return {
      id,
      version: '1.0.0',
      description: '',
      authors: '',
      iconUrl: '',
      verified: false,
      isInstalled: true,
      installedVersion: '1.0.0',
      isOutdated,
      sourceUrl: ''
    }
  }

  it('filters by case-insensitive substring on the package id', () => {
    const all = [vm('Newtonsoft.Json'), vm('Serilog'), vm('Polly')]
    const result = filterPackages(all, 'json', 'installed')
    assert.deepEqual(
      result.map(p => p.id),
      ['Newtonsoft.Json']
    )
  })

  it('limits the updates tab to outdated packages only', () => {
    const all = [vm('A', true), vm('B', false), vm('C', true)]
    const result = filterPackages(all, '', 'updates')
    assert.deepEqual(
      result.map(p => p.id),
      ['A', 'C']
    )
  })

  it('returns everything when category is installed and query is empty', () => {
    const all = [vm('A'), vm('B'), vm('C')]
    const result = filterPackages(all, '', 'installed')
    assert.equal(result.length, 3)
  })

  it('combines text filter and updates category', () => {
    const all = [vm('Serilog', true), vm('Serilog.Sinks.Console', false), vm('Newtonsoft.Json', true)]
    const result = filterPackages(all, 'serilog', 'updates')
    assert.deepEqual(
      result.map(p => p.id),
      ['Serilog']
    )
  })

  it('returns the original ordering of inputs', () => {
    const all = [vm('Z'), vm('A'), vm('M')]
    const result = filterPackages(all, '', 'installed')
    assert.deepEqual(
      result.map(p => p.id),
      ['Z', 'A', 'M']
    )
  })
})
