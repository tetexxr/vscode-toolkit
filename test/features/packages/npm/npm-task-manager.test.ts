import { strict as assert } from 'assert'
import { buildInstallArgs, buildUninstallArgs } from '../../../../src/features/packages/npm/npm-commands'

describe('buildInstallArgs', () => {
  it('should build an npm install command when the package is a regular dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'express', '4.18.0', 'dependencies')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'express@4.18.0'])
  })

  it('should build an npm install command when the package is a dev dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'typescript', '5.0.0', 'devDependencies')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'typescript@5.0.0', '--save-dev'])
  })

  it('should build an npm install command when the package is a peer dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'react', '18.0.0', 'peerDependencies')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'react@18.0.0', '--save-peer'])
  })

  it('should build an npm install command when the package is an optional dependency', () => {
    const { cmd, args } = buildInstallArgs('npm', 'fsevents', '2.0.0', 'optionalDependencies')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['install', 'fsevents@2.0.0', '--save-optional'])
  })

  it('should build a yarn add command when the package is a regular dependency', () => {
    const { cmd, args } = buildInstallArgs('yarn', 'express', '4.18.0', 'dependencies')
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['add', 'express@4.18.0'])
  })

  it('should build a yarn add command when the package is a dev dependency', () => {
    const { cmd, args } = buildInstallArgs('yarn', 'typescript', '5.0.0', 'devDependencies')
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['add', 'typescript@5.0.0', '--dev'])
  })

  it('should build a yarn add command when the package is a peer dependency', () => {
    const { args } = buildInstallArgs('yarn', 'react', '18.0.0', 'peerDependencies')
    assert.deepEqual(args, ['add', 'react@18.0.0', '--peer'])
  })

  it('should build a yarn add command when the package is an optional dependency', () => {
    const { args } = buildInstallArgs('yarn', 'fsevents', '2.0.0', 'optionalDependencies')
    assert.deepEqual(args, ['add', 'fsevents@2.0.0', '--optional'])
  })

  it('should build a pnpm add command when the package is a regular dependency', () => {
    const { cmd, args } = buildInstallArgs('pnpm', 'express', '4.18.0', 'dependencies')
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['add', 'express@4.18.0'])
  })

  it('should build a pnpm add command when the package is a dev dependency', () => {
    const { cmd, args } = buildInstallArgs('pnpm', 'typescript', '5.0.0', 'devDependencies')
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['add', 'typescript@5.0.0', '--save-dev'])
  })

  it('should build a pnpm add command when the package is a peer dependency', () => {
    const { args } = buildInstallArgs('pnpm', 'react', '18.0.0', 'peerDependencies')
    assert.deepEqual(args, ['add', 'react@18.0.0', '--save-peer'])
  })

  it('should build a pnpm add command when the package is an optional dependency', () => {
    const { args } = buildInstallArgs('pnpm', 'fsevents', '2.0.0', 'optionalDependencies')
    assert.deepEqual(args, ['add', 'fsevents@2.0.0', '--save-optional'])
  })

  it('should include scoped package name', () => {
    const { args } = buildInstallArgs('npm', '@angular/core', '17.0.0', 'dependencies')
    assert.equal(args[1], '@angular/core@17.0.0')
  })
})

describe('buildInstallArgs version specs', () => {
  it('should build the spec with range characters intact', () => {
    const { args } = buildInstallArgs('npm', 'lodash', '^4.17.21', 'dependencies')
    assert.ok(args.includes('lodash@^4.17.21'))
  })

  it('should build scoped package specs with a version', () => {
    const { args } = buildInstallArgs('yarn', '@scope/pkg', '1.0.0', 'devDependencies')
    assert.deepEqual(args, ['add', '@scope/pkg@1.0.0', '--dev'])
  })
})

describe('buildUninstallArgs', () => {
  it('should build an npm uninstall command when the manager is npm', () => {
    const { cmd, args } = buildUninstallArgs('npm', 'express')
    assert.equal(cmd, 'npm')
    assert.deepEqual(args, ['uninstall', 'express'])
  })

  it('should build a yarn remove command when the manager is yarn', () => {
    const { cmd, args } = buildUninstallArgs('yarn', 'express')
    assert.equal(cmd, 'yarn')
    assert.deepEqual(args, ['remove', 'express'])
  })

  it('should build a pnpm remove command when the manager is pnpm', () => {
    const { cmd, args } = buildUninstallArgs('pnpm', 'express')
    assert.equal(cmd, 'pnpm')
    assert.deepEqual(args, ['remove', 'express'])
  })
})
