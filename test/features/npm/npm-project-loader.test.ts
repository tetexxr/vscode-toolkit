import { strict as assert } from 'assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { detectPackageManager, readPackageManagerField } from '../../../src/features/npm/npm-commands'

describe('detectPackageManager', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'toolkit-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('should detect yarn from yarn.lock', () => {
    writeFileSync(join(root, 'yarn.lock'), '')
    assert.equal(detectPackageManager(root), 'yarn')
  })

  it('should detect pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    assert.equal(detectPackageManager(root), 'pnpm')
  })

  it('should detect npm from package-lock.json', () => {
    writeFileSync(join(root, 'package-lock.json'), '')
    assert.equal(detectPackageManager(root), 'npm')
  })

  it('should default to npm when no lock file exists', () => {
    assert.equal(detectPackageManager(root), 'npm')
  })

  it('should prefer yarn over npm when both lock files exist', () => {
    writeFileSync(join(root, 'yarn.lock'), '')
    writeFileSync(join(root, 'package-lock.json'), '')
    assert.equal(detectPackageManager(root), 'yarn')
  })

  it('should prefer pnpm over npm when both lock files exist', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    writeFileSync(join(root, 'package-lock.json'), '')
    assert.equal(detectPackageManager(root), 'pnpm')
  })

  it('should find yarn.lock in a parent directory', () => {
    writeFileSync(join(root, 'yarn.lock'), '')
    const sub = join(root, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    assert.equal(detectPackageManager(sub), 'yarn')
  })

  it('should find pnpm-lock.yaml in a parent directory', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    const sub = join(root, 'packages', 'api')
    mkdirSync(sub, { recursive: true })
    assert.equal(detectPackageManager(sub), 'pnpm')
  })

  it('should find package-lock.json in a parent directory', () => {
    writeFileSync(join(root, 'package-lock.json'), '')
    const sub = join(root, 'apps', 'web')
    mkdirSync(sub, { recursive: true })
    assert.equal(detectPackageManager(sub), 'npm')
  })

  it('should use the nearest lock file when nested', () => {
    writeFileSync(join(root, 'yarn.lock'), '')
    const sub = join(root, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(root, 'packages', 'pnpm-lock.yaml'), '')
    assert.equal(detectPackageManager(sub), 'pnpm')
  })

  it('should detect from packageManager field in package.json', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.8.7' }))
    assert.equal(detectPackageManager(root), 'yarn')
  })

  it('should detect pnpm from packageManager field', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@8.0.0' }))
    assert.equal(detectPackageManager(root), 'pnpm')
  })

  it('should detect npm from packageManager field', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }))
    assert.equal(detectPackageManager(root), 'npm')
  })

  it('should find packageManager field in parent directory (monorepo)', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.8.7', private: true }))
    const sub = join(root, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, 'package.json'), JSON.stringify({ name: '@myorg/app' }))
    assert.equal(detectPackageManager(sub), 'yarn')
  })

  it('should prioritize packageManager field over lock files', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@8.0.0' }))
    writeFileSync(join(root, 'yarn.lock'), '')
    assert.equal(detectPackageManager(root), 'pnpm')
  })
})

describe('readPackageManagerField', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'toolkit-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('should return yarn for yarn@version', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.8.7' }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), 'yarn')
  })

  it('should return pnpm for pnpm@version', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@8.0.0' }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), 'pnpm')
  })

  it('should return npm for npm@version', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), 'npm')
  })

  it('should return null when field is missing', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), null)
  })

  it('should return null when field is not a string', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 42 }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), null)
  })

  it('should return null for unrecognized package manager', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'bun@1.0.0' }))
    assert.equal(readPackageManagerField(join(root, 'package.json')), null)
  })

  it('should return null when file does not exist', () => {
    assert.equal(readPackageManagerField(join(root, 'nonexistent.json')), null)
  })

  it('should return null for invalid JSON', () => {
    writeFileSync(join(root, 'package.json'), 'not json')
    assert.equal(readPackageManagerField(join(root, 'package.json')), null)
  })
})
