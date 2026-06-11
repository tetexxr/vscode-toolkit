import * as assert from 'assert'
import { escapeMd } from '../../src/utils/markdown'

describe('utils/markdown', () => {
  describe('escapeMd', () => {
    it('should escape markdown formatting characters', () => {
      assert.strictEqual(escapeMd('**bold** _italic_ `code`'), '\\*\\*bold\\*\\* \\_italic\\_ \\`code\\`')
    })

    it('should escape link syntax so command links cannot be injected', () => {
      assert.strictEqual(
        escapeMd('[click](command:workbench.action.terminal.sendSequence)'),
        '\\[click\\]\\(command:workbench\\.action\\.terminal\\.sendSequence\\)'
      )
    })

    it('should escape backslashes before other characters', () => {
      assert.strictEqual(escapeMd('a\\*b'), 'a\\\\\\*b')
    })

    it('should return plain text unchanged', () => {
      assert.strictEqual(escapeMd('fix login flow when token expires'), 'fix login flow when token expires')
    })

    it('should return empty string for empty input', () => {
      assert.strictEqual(escapeMd(''), '')
    })
  })
})
