import { strict as assert } from 'assert'
import { parsePackageJsonDependencies, parsePackageJsonName } from '../../src/utils/json'

describe('parsePackageJsonDependencies', () => {
  it('should parse dependencies only', () => {
    const json = JSON.stringify({
      name: 'my-app',
      dependencies: { express: '^4.18.0', lodash: '~4.17.21' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.deepEqual(result, [
      { name: 'express', versionRange: '^4.18.0', dependencyType: 'dependencies' },
      { name: 'lodash', versionRange: '~4.17.21', dependencyType: 'dependencies' }
    ])
  })

  it('should parse devDependencies only', () => {
    const json = JSON.stringify({
      name: 'my-app',
      devDependencies: { typescript: '^5.0.0', vitest: '~1.0.0' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.deepEqual(result, [
      { name: 'typescript', versionRange: '^5.0.0', dependencyType: 'devDependencies' },
      { name: 'vitest', versionRange: '~1.0.0', dependencyType: 'devDependencies' }
    ])
  })

  it('should parse both dependencies and devDependencies', () => {
    const json = JSON.stringify({
      dependencies: { express: '^4.18.0' },
      devDependencies: { typescript: '^5.0.0' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.equal(result.length, 2)
    assert.deepEqual(result[0], { name: 'express', versionRange: '^4.18.0', dependencyType: 'dependencies' })
    assert.deepEqual(result[1], { name: 'typescript', versionRange: '^5.0.0', dependencyType: 'devDependencies' })
  })

  it('should return empty array for invalid JSON', () => {
    assert.deepEqual(parsePackageJsonDependencies('not json'), [])
  })

  it('should return empty array for empty string', () => {
    assert.deepEqual(parsePackageJsonDependencies(''), [])
  })

  it('should return empty array when no dependencies fields exist', () => {
    const json = JSON.stringify({ name: 'my-app', version: '1.0.0' })
    assert.deepEqual(parsePackageJsonDependencies(json), [])
  })

  it('should handle empty dependencies objects', () => {
    const json = JSON.stringify({ dependencies: {}, devDependencies: {} })
    assert.deepEqual(parsePackageJsonDependencies(json), [])
  })

  it('should handle scoped packages', () => {
    const json = JSON.stringify({
      dependencies: { '@angular/core': '^17.0.0', '@types/node': '^20.0.0' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.equal(result.length, 2)
    assert.equal(result[0].name, '@angular/core')
    assert.equal(result[1].name, '@types/node')
  })

  it('should handle wildcard and range versions', () => {
    const json = JSON.stringify({
      dependencies: { a: '*', b: '>=1.0.0', c: '1.0.0 - 2.0.0' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.equal(result[0].versionRange, '*')
    assert.equal(result[1].versionRange, '>=1.0.0')
    assert.equal(result[2].versionRange, '1.0.0 - 2.0.0')
  })

  it('should handle prerelease versions', () => {
    const json = JSON.stringify({
      dependencies: { pkg: '^1.0.0-beta.1' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.deepEqual(result, [{ name: 'pkg', versionRange: '^1.0.0-beta.1', dependencyType: 'dependencies' }])
  })

  it('should preserve order: dependencies first, then devDependencies', () => {
    const json = JSON.stringify({
      devDependencies: { dev: '1.0.0' },
      dependencies: { prod: '2.0.0' }
    })
    const result = parsePackageJsonDependencies(json)
    assert.equal(result[0].dependencyType, 'dependencies')
    assert.equal(result[1].dependencyType, 'devDependencies')
  })

  it('should handle JSON with non-object root', () => {
    assert.deepEqual(parsePackageJsonDependencies('"string"'), [])
    assert.deepEqual(parsePackageJsonDependencies('null'), [])
    assert.deepEqual(parsePackageJsonDependencies('42'), [])
  })

  it('should handle a realistic full package.json', () => {
    const json = JSON.stringify({
      name: '@myorg/api-server',
      version: '2.1.0',
      description: 'API server',
      main: 'dist/index.js',
      scripts: { build: 'tsc', test: 'vitest' },
      dependencies: {
        express: '^4.18.2',
        zod: '^3.22.0',
        '@prisma/client': '^5.7.0'
      },
      devDependencies: {
        typescript: '^5.3.0',
        vitest: '^1.1.0',
        '@types/express': '^4.17.21'
      }
    })
    const result = parsePackageJsonDependencies(json)
    assert.equal(result.length, 6)
    assert.equal(result.filter((d) => d.dependencyType === 'dependencies').length, 3)
    assert.equal(result.filter((d) => d.dependencyType === 'devDependencies').length, 3)
    assert.equal(result[0].name, 'express')
    assert.equal(result[5].name, '@types/express')
  })
})

describe('parsePackageJsonName', () => {
  it('should extract name from valid package.json', () => {
    assert.equal(parsePackageJsonName('{"name": "my-app"}'), 'my-app')
  })

  it('should extract scoped name', () => {
    assert.equal(parsePackageJsonName('{"name": "@scope/pkg"}'), '@scope/pkg')
  })

  it('should return empty string for missing name', () => {
    assert.equal(parsePackageJsonName('{"version": "1.0.0"}'), '')
  })

  it('should return empty string for non-string name', () => {
    assert.equal(parsePackageJsonName('{"name": 42}'), '')
  })

  it('should return empty string for invalid JSON', () => {
    assert.equal(parsePackageJsonName('not json'), '')
  })

  it('should return empty string for empty string', () => {
    assert.equal(parsePackageJsonName(''), '')
  })
})
