import { strict as assert } from 'assert'
import { buildRunCommand, parseScripts, quoteScriptName } from '../../../src/features/packages/run-scripts-utils'

describe('parseScripts', () => {
  it('should return each script name with the line of its key', () => {
    const text = ['{', '  "name": "x",', '  "scripts": {', '    "build": "tsc",', '    "test": "mocha"', '  }', '}'].join(
      '\n'
    )
    assert.deepEqual(parseScripts(text), [
      { name: 'build', line: 3 },
      { name: 'test', line: 4 }
    ])
  })

  it('should return an empty array when there is no scripts block', () => {
    assert.deepEqual(parseScripts('{ "name": "x" }'), [])
  })

  it('should return an empty array for an empty scripts block', () => {
    assert.deepEqual(parseScripts('{ "scripts": {} }'), [])
  })

  it('should return an empty array for invalid JSON', () => {
    assert.deepEqual(parseScripts('{ not json'), [])
  })

  it('should not be confused by braces inside script values', () => {
    const text = ['{', '  "scripts": {', '    "echo": "node -e \\"console.log({a:1})\\"",', '    "build": "tsc"', '  }', '}'].join(
      '\n'
    )
    assert.deepEqual(parseScripts(text), [
      { name: 'echo', line: 2 },
      { name: 'build', line: 3 }
    ])
  })

  it('should handle script names with special characters', () => {
    const text = ['{', '  "scripts": {', '    "build:prod": "tsc -p ."', '  }', '}'].join('\n')
    assert.deepEqual(parseScripts(text), [{ name: 'build:prod', line: 2 }])
  })

  it('should not pick up keys outside the scripts block', () => {
    const text = ['{', '  "dependencies": {', '    "build": "1.0.0"', '  },', '  "scripts": {', '    "build": "tsc"', '  }', '}'].join(
      '\n'
    )
    assert.deepEqual(parseScripts(text), [{ name: 'build', line: 5 }])
  })
})

describe('quoteScriptName', () => {
  it('should leave simple names untouched', () => {
    assert.equal(quoteScriptName('build'), 'build')
    assert.equal(quoteScriptName('build:prod'), 'build:prod')
  })

  it('should quote names with spaces or unusual characters', () => {
    assert.equal(quoteScriptName('do thing'), '"do thing"')
  })
})

describe('buildRunCommand', () => {
  it('should use npm run by default', () => {
    assert.equal(buildRunCommand('npm', 'build'), 'npm run build')
  })

  it('should use yarn run for yarn', () => {
    assert.equal(buildRunCommand('yarn', 'test'), 'yarn run test')
  })

  it('should use pnpm run for pnpm', () => {
    assert.equal(buildRunCommand('pnpm', 'lint'), 'pnpm run lint')
  })

  it('should quote unusual script names', () => {
    assert.equal(buildRunCommand('npm', 'do thing'), 'npm run "do thing"')
  })
})
