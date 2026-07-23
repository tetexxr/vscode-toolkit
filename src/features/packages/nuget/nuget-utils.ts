/**
 * Pure helpers extracted from the NuGet handlers. Kept in a vscode-free module
 * so they're directly testable.
 */

import * as path from 'path'
import { classifyBump } from '../../../utils/semver'
import type { DotnetListOutput } from './nuget-cli'
import type { OverviewProject, PackageViewModel, Category } from './nuget-types'

export { classifyBump }

// ── Overview merge ─────────────────────────────────────────

/**
 * Merge two `dotnet list package` results (full installed + outdated subset)
 * back into the OverviewProject list:
 *  - Match projects by fsPath.
 *  - For every installed package, set installedVersion / latestVersion /
 *    isOutdated. When the package isn't in the outdated set we treat it as
 *    up to date (latestVersion = resolvedVersion) so the UI shows "Yes".
 *  - If the JSON reports a package we don't have (e.g. it came from
 *    Directory.Packages.props which the XML loader doesn't see), append it.
 *  - Mark packages with a pinned `[x.y.z]` requested version so the webview
 *    can show the lock icon — and don't set them as outdated.
 */
export function applyListDataToProjects(
  projects: OverviewProject[],
  installed: DotnetListOutput,
  outdated: DotnetListOutput
): void {
  const byPath = new Map<string, OverviewProject>()
  for (const p of projects) {
    byPath.set(normalizePath(p.fsPath), p)
  }

  // (projectPath → packageId → latestVersion) lookup table.
  const outdatedMap = new Map<string, Map<string, string>>()
  for (const dnProject of outdated.projects ?? []) {
    const key = normalizePath(dnProject.path)
    let pkgMap = outdatedMap.get(key)
    if (!pkgMap) {
      pkgMap = new Map<string, string>()
      outdatedMap.set(key, pkgMap)
    }
    for (const fw of dnProject.frameworks ?? []) {
      for (const pkg of fw.topLevelPackages ?? []) {
        if (pkg.latestVersion) {
          pkgMap.set(pkg.id, pkg.latestVersion)
        }
      }
    }
  }

  for (const dnProject of installed.projects ?? []) {
    const projectKey = normalizePath(dnProject.path)
    const project = byPath.get(projectKey)
    if (!project) {
      continue
    }
    const outdatedForProject = outdatedMap.get(projectKey)
    for (const fw of dnProject.frameworks ?? []) {
      for (const pkg of fw.topLevelPackages ?? []) {
        if (isPinned(pkg.requestedVersion)) {
          const entry = project.packages.find(p => p.id === pkg.id)
          if (entry) {
            entry.isPinned = true
          }
          continue
        }
        const latest = outdatedForProject?.get(pkg.id) ?? pkg.resolvedVersion
        upsertPackage(project, pkg.id, pkg.resolvedVersion, latest)
      }
    }
  }
}

export function upsertPackage(project: OverviewProject, id: string, resolved: string, latest: string): void {
  let entry = project.packages.find(p => p.id === id)
  if (!entry) {
    entry = { id, installedVersion: resolved, latestVersion: '', isOutdated: false }
    project.packages.push(entry)
  }
  entry.installedVersion = resolved
  entry.latestVersion = latest
  entry.isOutdated = !!latest && latest !== resolved
  entry.versionBump = entry.isOutdated ? classifyBump(resolved, latest) : undefined
}

export function isPinned(requestedVersion: string | undefined): boolean {
  return !!requestedVersion && requestedVersion.startsWith('[')
}

export function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase()
}

// ── Per-project filtering ──────────────────────────────────

export function filterPackages(all: PackageViewModel[], query: string, category: Category): PackageViewModel[] {
  let packages = all
  const trimmed = query.trim().toLowerCase()
  if (trimmed) {
    packages = packages.filter(p => p.id.toLowerCase().includes(trimmed))
  }
  if (category === 'updates') {
    packages = packages.filter(p => p.isOutdated)
  }
  return packages
}
