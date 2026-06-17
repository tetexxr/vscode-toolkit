/**
 * Pure helpers for the npm overview. Kept in a vscode-free module so the
 * tests can load them without spinning up the extension host.
 */

import type { NpmOverviewProject, NpmPackageViewModel, NpmCategory, InstalledNpmPackage } from './npm-types'
import type { NpmOutdatedEntry } from './npm-cli'
import { classifyBump } from '../../../utils/semver'

/**
 * Detect a "pinned" version range: one without semver operators. Matches
 * `1.2.3`, `1.2.3-beta`, `1.2.3-rc.1+build.4` — but not `^1.2.3`, `~1.2.3`,
 * `>=1.2.3`, `1.x`, `*` or anything with whitespace / ranges.
 */
export function isPinned(range: string): boolean {
  return /^\d+\.\d+\.\d+(-[A-Za-z0-9.+-]+)?$/.test(range.trim())
}

/**
 * Strip the leading semver operator from a range so the result is a comparable
 * version literal. Mirrors the helper in `npm-api.ts` but lives here so the
 * overview merge stays dependency-free for tests.
 *   "^1.2.3" → "1.2.3"
 *   ">=1.0.0" → "1.0.0"
 *   "*" → ""
 */
export function stripVersionRange(range: string): string {
  if (!range || range === '*' || range === 'latest') {
    return ''
  }
  return range.replace(/^[~^>=<]+\s*/, '')
}

/**
 * Merge an `npm outdated --json` result back into the overview project list:
 *  - Match the dependent project by name.
 *  - For each outdated package, set latestVersion / isOutdated / versionBump.
 *  - For every other package (absent from the outdated map) we assume up-to-
 *    date: latestVersion = stripped(range), isOutdated = false.
 *  - Pinned ranges (`"1.2.3"`) are tagged isPinned and stay non-outdated, so
 *    the user isn't pushed to upgrade something they locked on purpose.
 */
export function applyOutdatedToProject(project: NpmOverviewProject, outdated: Record<string, NpmOutdatedEntry>): void {
  for (const pkg of project.packages) {
    const entry = outdated[pkg.name]
    const pinned = isPinned(pkg.installedVersionRange)
    pkg.isPinned = pinned

    if (entry && !pinned) {
      pkg.latestVersion = entry.latest
      pkg.isOutdated = entry.latest !== (entry.current ?? stripVersionRange(pkg.installedVersionRange))
      pkg.versionBump = pkg.isOutdated
        ? classifyBump(entry.current ?? stripVersionRange(pkg.installedVersionRange), entry.latest)
        : undefined
    } else {
      // Up to date (or pinned): show stripped range as "latest" so the UI
      // renders the green Yes badge instead of a vague dash.
      pkg.latestVersion = stripVersionRange(pkg.installedVersionRange)
      pkg.isOutdated = false
      pkg.versionBump = undefined
    }
  }
}

// ── Per-project panel ─────────────────────────────────────

/**
 * Build view models for the Installed / Updates tabs of the per-project
 * panel from the project's package.json + `npm outdated` output. No
 * description / author / downloads here — that's filled in later via the
 * Search API.
 */
export function buildInstalledViewModels(
  installed: InstalledNpmPackage[],
  outdated: Record<string, NpmOutdatedEntry>,
  sourceUrl: string
): NpmPackageViewModel[] {
  return installed.map(p => {
    const entry = outdated[p.name]
    const pinned = isPinned(p.versionRange)
    const installedVersion = entry?.current ?? stripVersionRange(p.versionRange)
    const latestVersion = entry?.latest ?? installedVersion
    const outdatedFlag = !pinned && !!entry && entry.latest !== (entry.current ?? installedVersion)
    return {
      name: p.name,
      version: latestVersion,
      description: '',
      author: '',
      homepage: '',
      license: '',
      keywords: [],
      weeklyDownloads: undefined,
      isInstalled: true,
      installedVersionRange: p.versionRange,
      dependencyType: p.dependencyType,
      isOutdated: outdatedFlag,
      sourceUrl,
      isPinned: pinned,
      versionBump: outdatedFlag ? classifyBump(installedVersion, latestVersion) : undefined
    }
  })
}

/** Apply the user's text filter and the active tab (installed vs updates) to a view-model list. */
export function filterPackages(all: NpmPackageViewModel[], query: string, category: NpmCategory): NpmPackageViewModel[] {
  let packages = all
  const trimmed = query.trim().toLowerCase()
  if (trimmed) {
    packages = packages.filter(p => p.name.toLowerCase().includes(trimmed))
  }
  if (category === 'updates') {
    packages = packages.filter(p => p.isOutdated)
  }
  return packages
}
