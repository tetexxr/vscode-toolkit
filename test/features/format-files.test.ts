import { strict as assert } from 'assert'
import {
  DEFAULT_EXCLUDED_FOLDERS,
  DEFAULT_INCLUDE_GLOB,
  buildExcludeGlob,
  collectNativeExcludes
} from '../../src/features/format-files-utils'

describe('collectNativeExcludes', () => {
  it('should include only entries where the value is true', () => {
    const files = { '**/.git': true, '**/.DS_Store': true, '**/disabled': false }
    const search = { '**/node_modules': true }
    const result = collectNativeExcludes(files, search)
    assert.deepEqual(result.sort(), ['**/.DS_Store', '**/.git', '**/node_modules'])
  })

  it('should skip entries with { when: ... } objects', () => {
    const files = { '**/*.js': { when: '$(basename).ts' }, '**/.git': true }
    const result = collectNativeExcludes(files, {})
    assert.deepEqual(result, ['**/.git'])
  })

  it('should return an empty array when everything is disabled', () => {
    const files = { '**/x': false }
    const result = collectNativeExcludes(files, {})
    assert.deepEqual(result, [])
  })

  it('should merge files.exclude and search.exclude', () => {
    const files = { '**/a': true }
    const search = { '**/b': true }
    const result = collectNativeExcludes(files, search)
    assert.deepEqual(result.sort(), ['**/a', '**/b'])
  })
})

describe('buildExcludeGlob', () => {
  it('should wrap each excluded folder with **/<folder>/**', () => {
    const result = buildExcludeGlob(['bin', 'obj'], {}, {})
    assert.equal(result, '{**/bin/**,**/obj/**}')
  })

  it('should merge custom folders with native excludes', () => {
    const result = buildExcludeGlob(['bin'], { '**/.git': true }, { '**/node_modules': true })
    assert.equal(result, '{**/bin/**,**/.git,**/node_modules}')
  })

  it('should deduplicate identical patterns', () => {
    const result = buildExcludeGlob(['node_modules'], { '**/node_modules/**': true }, {})
    assert.equal(result, '{**/node_modules/**}')
  })

  it('should return undefined when nothing to exclude', () => {
    const result = buildExcludeGlob([], {}, {})
    assert.equal(result, undefined)
  })

  it('should return undefined when all native excludes are disabled and no custom ones', () => {
    const result = buildExcludeGlob([], { '**/x': false }, { '**/y': false })
    assert.equal(result, undefined)
  })

  it('should ignore disabled native excludes while keeping custom ones', () => {
    const result = buildExcludeGlob(['bin'], { '**/.git': false }, {})
    assert.equal(result, '{**/bin/**}')
  })
})

describe('defaults', () => {
  it('should include common .NET and web folders in DEFAULT_EXCLUDED_FOLDERS', () => {
    for (const folder of ['node_modules', '.git', 'bin', 'obj', '.vs']) {
      assert.ok(DEFAULT_EXCLUDED_FOLDERS.includes(folder), `Expected DEFAULT_EXCLUDED_FOLDERS to include ${folder}`)
    }
  })

  it('should include .NET and common web extensions in DEFAULT_INCLUDE_GLOB', () => {
    for (const ext of ['ts', 'js', 'json', 'cs', 'razor', 'cshtml']) {
      assert.ok(DEFAULT_INCLUDE_GLOB.includes(ext), `Expected DEFAULT_INCLUDE_GLOB to include ${ext}`)
    }
  })
})
