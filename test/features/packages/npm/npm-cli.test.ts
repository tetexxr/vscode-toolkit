import { strict as assert } from 'assert'
import {
  parseNpmOutdatedOutput,
  parsePnpmOutdatedOutput,
  parseYarnOutdatedOutput,
  parseNcuOutdatedOutput
} from '../../../../src/features/packages/npm/npm-cli'

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

// ── parsePnpmOutdatedOutput ───────────────────────────────

describe('parsePnpmOutdatedOutput', () => {
  it('should parse the JSON object emitted by pnpm outdated', () => {
    const stdout = `{
      "lodash": { "current": "4.17.20", "wanted": "4.17.21", "latest": "4.17.21" },
      "react":  { "wanted": "18.2.0", "latest": "18.2.0" }
    }`
    const result = parsePnpmOutdatedOutput(stdout)
    assert.equal(result.lodash.current, '4.17.20')
    assert.equal(result.lodash.latest, '4.17.21')
    assert.equal(result.react.current, undefined)
    assert.equal(result.react.wanted, '18.2.0')
  })

  it('should default wanted to latest when pnpm omits the field', () => {
    const stdout = '{ "react": { "current": "17.0.0", "latest": "18.0.0" } }'
    const result = parsePnpmOutdatedOutput(stdout)
    assert.equal(result.react.wanted, '18.0.0')
  })

  it('should skip entries that lack a latest version', () => {
    const stdout = '{ "broken": { "current": "1.0.0" } }'
    const result = parsePnpmOutdatedOutput(stdout)
    assert.equal(result.broken, undefined)
  })

  it('should return an empty object for empty stdout', () => {
    assert.deepEqual(parsePnpmOutdatedOutput(''), {})
  })
})

// ── parseYarnOutdatedOutput ───────────────────────────────

describe('parseYarnOutdatedOutput', () => {
  it('should parse the ND-JSON table emitted by yarn v1 outdated', () => {
    const stdout = [
      '{"type":"info","data":"Color legend ..."}',
      '{"type":"table","data":{"head":["Package","Current","Wanted","Latest","Package Type","URL"],"body":[["lodash","4.17.20","4.17.21","4.17.21","dependencies","https://..."],["react","17.0.0","17.0.2","18.0.0","dependencies","https://..."]]}}'
    ].join('\n')
    const result = parseYarnOutdatedOutput(stdout)
    assert.equal(Object.keys(result).length, 2)
    assert.equal(result.lodash.current, '4.17.20')
    assert.equal(result.lodash.latest, '4.17.21')
    assert.equal(result.react.latest, '18.0.0')
  })

  it('should return an empty object when yarn output contains no table', () => {
    const stdout = '{"type":"info","data":"Nothing outdated."}'
    assert.deepEqual(parseYarnOutdatedOutput(stdout), {})
  })

  it('should throw a friendly error when yarn berry reports unknown command', () => {
    const stdout = '{"type":"error","data":"Command \\"outdated\\" not a recognised command"}'
    assert.throws(() => parseYarnOutdatedOutput(stdout), /yarn berry/i)
  })

  it('should ignore lines that are not JSON', () => {
    const stdout = [
      'plain text prologue',
      '{"type":"info","data":"..."}',
      '{"type":"table","data":{"head":["Package","Current","Wanted","Latest"],"body":[["lodash","4.17.20","4.17.21","4.17.21"]]}}'
    ].join('\n')
    const result = parseYarnOutdatedOutput(stdout)
    assert.equal(result.lodash.latest, '4.17.21')
  })

  it('should throw when the table is missing the Latest column', () => {
    const stdout =
      '{"type":"table","data":{"head":["Package","Current","Wanted"],"body":[["lodash","4.17.20","4.17.21"]]}}'
    assert.throws(() => parseYarnOutdatedOutput(stdout), /Latest column/i)
  })
})

// ── parseNcuOutdatedOutput (yarn berry path) ──────────────

describe('parseNcuOutdatedOutput', () => {
  it('should parse the flat name→targetRange map from ncu --jsonUpgraded', () => {
    const stdout = `{
      "@inquirer/prompts": "^8.5.2",
      "axios": "1.18.0",
      "zod": "^4.4.3"
    }`
    const result = parseNcuOutdatedOutput(stdout)
    assert.equal(Object.keys(result).length, 3)
    // The leading operator is stripped so latest is a bare comparable version.
    assert.equal(result['@inquirer/prompts'].latest, '8.5.2')
    assert.equal(result.axios.latest, '1.18.0')
    assert.equal(result.zod.latest, '4.4.3')
    // ncu doesn't report the installed version.
    assert.equal(result.axios.current, undefined)
  })

  it('should default wanted to latest', () => {
    const result = parseNcuOutdatedOutput('{"axios":"^1.18.0"}')
    assert.equal(result.axios.wanted, '1.18.0')
    assert.equal(result.axios.latest, '1.18.0')
  })

  it('should return an empty object when nothing is upgradable', () => {
    assert.deepEqual(parseNcuOutdatedOutput('{}'), {})
  })

  it('should return an empty object for empty stdout', () => {
    assert.deepEqual(parseNcuOutdatedOutput(''), {})
    assert.deepEqual(parseNcuOutdatedOutput('   '), {})
  })

  it('should tolerate leading noise before the JSON body', () => {
    const result = parseNcuOutdatedOutput('Using yarn\n{"axios":"1.18.0"}')
    assert.equal(result.axios.latest, '1.18.0')
  })

  it('should return empty when there is no JSON body at all', () => {
    assert.deepEqual(parseNcuOutdatedOutput('no json here'), {})
  })
})
