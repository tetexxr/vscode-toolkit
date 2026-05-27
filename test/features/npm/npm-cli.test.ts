import { strict as assert } from 'assert'
import { parseNpmOutdatedOutput } from '../../../src/features/npm/npm-cli'

describe('parseNpmOutdatedOutput', () => {
  it('should parse the JSON object emitted by npm outdated', () => {
    const stdout = `{
      "lodash": { "current": "4.17.20", "wanted": "4.17.21", "latest": "4.17.21", "dependent": "demo" },
      "react":  { "wanted": "18.2.0", "latest": "18.2.0", "dependent": "demo" }
    }`
    const result = parseNpmOutdatedOutput(stdout)
    assert.equal(result.lodash.current, '4.17.20')
    assert.equal(result.lodash.latest, '4.17.21')
    assert.equal(result.react.current, undefined)
    assert.equal(result.react.wanted, '18.2.0')
  })

  it('should return an empty object when stdout is empty', () => {
    assert.deepEqual(parseNpmOutdatedOutput(''), {})
    assert.deepEqual(parseNpmOutdatedOutput('   \n  '), {})
  })

  it('should strip warnings printed before the JSON body', () => {
    const stdout = 'npm warn deprecated foo@1.0.0\n{ "react": { "wanted": "18.2.0", "latest": "18.2.0", "dependent": "x" } }'
    const result = parseNpmOutdatedOutput(stdout)
    assert.equal(result.react.latest, '18.2.0')
  })

  it('should throw when the output has no JSON body at all', () => {
    assert.throws(() => parseNpmOutdatedOutput('error: command not found'), /no JSON body/)
  })
})
