/**
 * Shared NuGet configuration helpers.
 * Used by both NugetMessageHandler and NugetOverviewHandler.
 */

import * as vscode from 'vscode'
import { PackageSource, NugetConfig } from './nuget-types'

const DEFAULT_SOURCES: PackageSource[] = [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' }]

export function getNugetSources(): PackageSource[] {
  const config = vscode.workspace.getConfiguration('toolkit.nuget')
  return config.get<PackageSource[]>('sources', DEFAULT_SOURCES)
}

export function getNugetConfig(): NugetConfig {
  const config = vscode.workspace.getConfiguration('toolkit.nuget')
  return {
    requestTimeout: config.get<number>('requestTimeout', 10000),
    defaultPrerelease: config.get<boolean>('defaultPrerelease', false)
  }
}
