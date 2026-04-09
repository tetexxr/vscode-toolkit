import { strict as assert } from 'assert'
import { getChangedFileDirectories } from '../../src/utils/git'

describe('getChangedFileDirectories', () => {
  it('should return parent directories of changed files', () => {
    const result = getChangedFileDirectories(['src/utils/git.ts'])
    assert.deepEqual(result, ['src', 'src/utils'])
  })

  it('should return empty array for root-level files', () => {
    const result = getChangedFileDirectories(['README.md'])
    assert.deepEqual(result, [])
  })

  it('should deduplicate shared parent directories', () => {
    const result = getChangedFileDirectories(['src/utils/git.ts', 'src/utils/files.ts'])
    assert.deepEqual(result, ['src', 'src/utils'])
  })

  it('should sort from shallowest to deepest', () => {
    const result = getChangedFileDirectories([
      'src/features/nuget/nuget-api.ts',
      'src/utils/git.ts'
    ])
    assert.deepEqual(result, ['src', 'src/features', 'src/utils', 'src/features/nuget'])
  })

  it('should include all ancestor directories', () => {
    const result = getChangedFileDirectories(['a/b/c/d/file.ts'])
    assert.deepEqual(result, ['a', 'a/b', 'a/b/c', 'a/b/c/d'])
  })

  it('should handle multiple files in different trees', () => {
    const result = getChangedFileDirectories(['src/a.ts', 'lib/b.ts', 'test/c.ts'])
    assert.deepEqual(result, ['lib', 'src', 'test'])
  })

  it('should return empty array for empty input', () => {
    assert.deepEqual(getChangedFileDirectories([]), [])
  })

  it('should handle files with mixed depths', () => {
    const result = getChangedFileDirectories([
      'README.md',
      'src/extension.ts',
      'src/features/expand-changed.ts'
    ])
    assert.deepEqual(result, ['src', 'src/features'])
  })
})
