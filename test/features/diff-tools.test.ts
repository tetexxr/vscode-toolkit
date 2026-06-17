import { strict as assert } from 'assert'
import { compareTitle, resolveDiffExtension } from '../../src/features/diff-tools-utils'

describe('resolveDiffExtension', () => {
  it('should use the file extension when present', () => {
    assert.equal(resolveDiffExtension('src/app.ts', 'typescript'), '.ts')
    assert.equal(resolveDiffExtension('notes.test.tsx', 'typescriptreact'), '.tsx')
  })

  it('should derive from the language id when there is no extension', () => {
    assert.equal(resolveDiffExtension('Untitled-1', 'json'), '.json')
    assert.equal(resolveDiffExtension('', 'python'), '.py')
  })

  it('should fall back to .txt for unknown languages without an extension', () => {
    assert.equal(resolveDiffExtension('scratch', 'something-exotic'), '.txt')
  })
})

describe('compareTitle', () => {
  it('should join both sides with a double arrow', () => {
    assert.equal(compareTitle('Selection', 'Clipboard'), 'Selection ↔ Clipboard')
  })
})
