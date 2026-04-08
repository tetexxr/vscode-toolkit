import { strict as assert } from 'assert'
import { buildInstallArgs, buildUninstallArgs } from '../../../src/features/npm/npm-commands'

describe('buildInstallArgs', () => {
  it('npm: regular dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'express', '4.18.0', false)
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'express@4.18.0'])
  })

  it('npm: dev dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'typescript', '5.0.0', true)
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'typescript@5.0.0', '--save-dev'])
  })

  it('yarn: regular dependency', () => {
    const { cmd, args } = buildInstallArgs('yarn', 'express', '4.18.0', false)
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['add', 'express@4.18.0'])
  })

  it('yarn: dev dependency', () => {
    const { cmd, args } = buildInstallArgs('yarn', 'typescript', '5.0.0', true)
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['add', 'typescript@5.0.0', '--dev'])
  })

  it('pnpm: regular dependency', () => {
    const { cmd, args } = buildInstallArgs('pnpm', 'express', '4.18.0', false)
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['add', 'express@4.18.0'])
  })

  it('pnpm: dev dependency', () => {
    const { cmd, args } = buildInstallArgs('pnpm', 'typescript', '5.0.0', true)
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['add', 'typescript@5.0.0', '--save-dev'])
  })

  it('should include scoped package name', () => {
    const { args } = buildInstallArgs('npm', '@angular/core', '17.0.0', false)
    assert.equal(args[1], '@angular/core@17.0.0')
  })
})

describe('buildUninstallArgs', () => {
  it('npm', () => {
    const { cmd, args } = buildUninstallArgs('npm', 'express')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['uninstall', 'express'])
  })

  it('yarn', () => {
    const { cmd, args } = buildUninstallArgs('yarn', 'express')
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['remove', 'express'])
  })

  it('pnpm', () => {
    const { cmd, args } = buildUninstallArgs('pnpm', 'express')
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['remove', 'express'])
  })
})
