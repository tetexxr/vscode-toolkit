import { strict as assert } from 'assert'
import { parseCheckIgnoreOutput } from '../../src/utils/git-ignore'

describe('parseCheckIgnoreOutput', () => {
  it('should parse null-separated paths', () => {
    const out = parseCheckIgnoreOutput('node_modules/foo.js\0dist/bundle.js\0')
    assert.deepEqual(out, ['node_modules/foo.js', 'dist/bundle.js'])
  })

  it('should return an empty array for empty input', () => {
    assert.deepEqual(parseCheckIgnoreOutput(''), [])
  })

  it('should drop trailing empty fields', () => {
    assert.deepEqual(parseCheckIgnoreOutput('a\0b\0\0'), ['a', 'b'])
  })

  it('should accept absolute paths', () => {
    assert.deepEqual(
      parseCheckIgnoreOutput('/repo/dist/foo.js\0/repo/node_modules/x.js\0'),
      ['/repo/dist/foo.js', '/repo/node_modules/x.js']
    )
  })

  it('should preserve UTF-8 characters in paths', () => {
    assert.deepEqual(parseCheckIgnoreOutput('café/menu.txt\0'), ['café/menu.txt'])
  })
})
