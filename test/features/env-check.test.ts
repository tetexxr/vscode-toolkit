import { strict as assert } from 'assert'
import {
  buildMissingLines,
  DEFAULT_EXAMPLE_NAMES,
  diffEnv,
  isEnvFamilyFile,
  parseEnv
} from '../../src/features/env-check-utils'

describe('parseEnv', () => {
  it('should parse KEY=VALUE lines with line numbers', () => {
    const entries = parseEnv('A=1\nB=two\n')
    assert.deepEqual(entries, [
      { key: 'A', line: 0, value: '1' },
      { key: 'B', line: 1, value: 'two' }
    ])
  })

  it('should support export prefixes and trim values', () => {
    const entries = parseEnv('export DB_URL = postgres://localhost ')
    assert.deepEqual(entries, [{ key: 'DB_URL', line: 0, value: 'postgres://localhost' }])
  })

  it('should skip comments and blank lines', () => {
    const entries = parseEnv('# comment\n\nA=1\n  # indented comment\n')
    assert.deepEqual(
      entries.map(e => e.key),
      ['A']
    )
  })

  it('should keep values containing equals signs intact', () => {
    const entries = parseEnv('TOKEN=abc==')
    assert.equal(entries[0].value, 'abc==')
  })

  it('should ignore lines that are not assignments', () => {
    assert.deepEqual(parseEnv('not an assignment\n123=x'), [])
  })
})

describe('diffEnv', () => {
  const example = 'API_URL=https://example.test\nAPI_KEY=changeme\nREDIS_URL=redis://localhost'

  it('should report keys missing from the env file', () => {
    const diff = diffEnv('API_URL=real', example)
    assert.deepEqual(diff.missing, ['API_KEY', 'REDIS_URL'])
  })

  it('should report keys not declared in the example', () => {
    const diff = diffEnv('API_URL=x\nAPI_KEY=y\nREDIS_URL=z\nSECRET_EXTRA=s', example)
    assert.deepEqual(
      diff.undeclared.map(e => e.key),
      ['SECRET_EXTRA']
    )
  })

  it('should report nothing when both are in sync', () => {
    const diff = diffEnv(example, example)
    assert.deepEqual(diff, { missing: [], undeclared: [] })
  })

  it('should not duplicate missing keys declared twice in the example', () => {
    const diff = diffEnv('', 'A=1\nA=2')
    assert.deepEqual(diff.missing, ['A'])
  })
})

describe('buildMissingLines', () => {
  it('should copy the example placeholder values', () => {
    const lines = buildMissingLines('A=1\nB=placeholder\nC=', ['B', 'C'])
    assert.deepEqual(lines, ['B=placeholder', 'C='])
  })
})

describe('isEnvFamilyFile', () => {
  it('should accept .env and dotted variants', () => {
    assert.equal(isEnvFamilyFile('.env'), true)
    assert.equal(isEnvFamilyFile('.env.local'), true)
    assert.equal(isEnvFamilyFile('.env.example'), true)
  })

  it('should reject unrelated files', () => {
    assert.equal(isEnvFamilyFile('env'), false)
    assert.equal(isEnvFamilyFile('environment.ts'), false)
    assert.equal(isEnvFamilyFile('settings.env.json'), false)
  })

  it('should expose the default example names in lookup order', () => {
    assert.deepEqual(DEFAULT_EXAMPLE_NAMES, ['.env.example', '.env.sample', '.env.template', '.env.dist'])
  })
})
