/**
 * Pure functions for package manager detection and CLI command building.
 * Separated to allow unit testing without VS Code dependencies.
 */

import { existsSync, readFileSync } from 'fs'
import { join, dirname, parse } from 'path'
import { PackageManager } from './npm-types'

/**
 * Detect the package manager by searching up the directory tree.
 * Checks the "packageManager" field in package.json first (most reliable),
 * then falls back to lock file detection.
 */
export function detectPackageManager(directoryPath: string): PackageManager {
  let current = directoryPath

  while (true) {
    const pmField = readPackageManagerField(join(current, 'package.json'))
    if (pmField) {
      return pmField
    }

    if (existsSync(join(current, 'yarn.lock'))) {
      return 'yarn'
    }
    if (existsSync(join(current, 'pnpm-lock.yaml'))) {
      return 'pnpm'
    }
    if (existsSync(join(current, 'package-lock.json'))) {
      return 'npm'
    }

    const parent = dirname(current)
    if (parent === current || parent === parse(current).root) {
      break
    }
    current = parent
  }

  return 'npm'
}

/** Read the "packageManager" field from a package.json file. */
export function readPackageManagerField(packageJsonPath: string): PackageManager | null {
  try {
    const content = readFileSync(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    const field = pkg.packageManager
    if (typeof field !== 'string') {
      return null
    }
    if (field.startsWith('yarn')) {
      return 'yarn'
    }
    if (field.startsWith('pnpm')) {
      return 'pnpm'
    }
    if (field.startsWith('npm')) {
      return 'npm'
    }
    return null
  } catch {
    return null
  }
}

export function buildInstallArgs(
  pm: PackageManager,
  packageName: string,
  version: string,
  devDependency: boolean
): { cmd: string; args: string[] } {
  const spec = `${packageName}@${version}`

  switch (pm) {
    case 'yarn':
      return { cmd: 'yarn', args: ['add', spec, ...(devDependency ? ['--dev'] : [])] }
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', spec, ...(devDependency ? ['--save-dev'] : [])] }
    default:
      return { cmd: 'npm', args: ['install', spec, ...(devDependency ? ['--save-dev'] : [])] }
  }
}

export function buildUninstallArgs(pm: PackageManager, packageName: string): { cmd: string; args: string[] } {
  switch (pm) {
    case 'yarn':
      return { cmd: 'yarn', args: ['remove', packageName] }
    case 'pnpm':
      return { cmd: 'pnpm', args: ['remove', packageName] }
    default:
      return { cmd: 'npm', args: ['uninstall', packageName] }
  }
}
