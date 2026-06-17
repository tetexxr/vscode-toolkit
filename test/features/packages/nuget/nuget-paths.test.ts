import { strict as assert } from 'assert'
import * as path from 'path'
import { findAuxiliaryFiles, PARENT_AUX_FILES } from '../../../../src/features/packages/nuget/nuget-paths'

describe('findAuxiliaryFiles', () => {
  it('should emit aux-file paths for every parent directory of the project', () => {
    const proj = path.join('/repo', 'src', 'App', 'App.csproj')
    const result = findAuxiliaryFiles(proj)

    // /repo/src/App, /repo/src, /repo → 3 directories × N aux files
    for (const aux of PARENT_AUX_FILES) {
      assert.ok(result.includes(path.join('/repo', 'src', 'App', aux)), `expected /repo/src/App/${aux}`)
      assert.ok(result.includes(path.join('/repo', 'src', aux)), `expected /repo/src/${aux}`)
      assert.ok(result.includes(path.join('/repo', aux)), `expected /repo/${aux}`)
    }
  })

  it('should not walk past the filesystem root', () => {
    const proj = path.join('/repo', 'App.csproj')
    const result = findAuxiliaryFiles(proj)

    // Should include /repo/* but never something at "/" itself.
    for (const aux of PARENT_AUX_FILES) {
      assert.ok(result.includes(path.join('/repo', aux)))
      assert.ok(!result.includes(path.join('/', aux)), `should not include /${aux}`)
    }
  })

  it('should return paths covering both Directory.Packages.props and NuGet.config families', () => {
    const proj = path.join('/repo', 'App.csproj')
    const result = findAuxiliaryFiles(proj)
    const names = new Set(result.map(p => path.basename(p)))
    assert.ok(names.has('Directory.Packages.props'))
    assert.ok(names.has('Directory.Build.props'))
    assert.ok(names.has('Directory.Build.targets'))
    assert.ok(names.has('NuGet.config'))
    assert.ok(names.has('nuget.config'))
  })
})
