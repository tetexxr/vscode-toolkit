/**
 * Shared npm configuration helpers.
 * Used by both NpmMessageHandler and NpmOverviewHandler.
 */

import * as vscode from 'vscode'
import { NpmPackageSource, NpmConfig } from './npm-types'

const DEFAULT_SOURCES: NpmPackageSource[] = [{ name: 'npmjs.org', url: 'https://registry.npmjs.org' }]

export function getNpmSources(): NpmPackageSource[] {
  const config = vscode.workspace.getConfiguration('toolkit.npm')
  return config.get<NpmPackageSource[]>('sources', DEFAULT_SOURCES)
}

export function getNpmConfig(): NpmConfig {
  const config = vscode.workspace.getConfiguration('toolkit.npm')
  return {
    requestTimeout: config.get<number>('requestTimeout', 10000),
    defaultPrerelease: config.get<boolean>('defaultPrerelease', false)
  }
}
