/**
 * npm registry API client. Runs in the extension host (Node.js) so it has
 * full network access without CORS restrictions.
 *
 * Simpler than the NuGet V3 client — no endpoint discovery needed.
 * Supports search, package metadata, and version retrieval.
 */

import { httpGetJson } from '../../utils/http'
import { compareSemVer, isPrerelease as isSemVerPrerelease } from '../../utils/semver'
import {
  NpmSearchResponse,
  NpmSearchObject,
  NpmPackageMetadata,
  NpmPackageSource,
  NpmPackageViewModel,
  NpmVersionDetail,
  InstalledNpmPackage
} from './npm-types'

// ── Search (Browse mode) ───────────────────────────────────

/** Search for packages using the npm registry search endpoint. */
export async function searchNpmPackages(
  query: string,
  prerelease: boolean,
  source: NpmPackageSource,
  timeout: number,
  skip: number = 0
): Promise<{ packages: NpmPackageViewModel[]; totalHits: number }> {
  const baseUrl = ensureNoTrailingSlash(source.url)
  const headers = authHeaders(source)
  const url = `${baseUrl}/-/v1/search?text=${encodeURIComponent(query)}&size=30&from=${skip}`

  const results = await httpGetJson<NpmSearchResponse>({ url, headers, timeout })

  let packages = results.objects.map(obj => searchResultToViewModel(obj, source.url))

  if (!prerelease) {
    packages = packages.filter(pkg => !isSemVerPrerelease(pkg.version))
  }

  return { packages, totalHits: results.total }
}

/** Map a search result object to a view model. Exported for testing. */
export function searchResultToViewModel(obj: NpmSearchObject, sourceUrl: string): NpmPackageViewModel {
  const pkg = obj.package
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description || '',
    author: pkg.publisher?.username || '',
    homepage: pkg.links?.homepage || '',
    license: pkg.license || '',
    keywords: pkg.keywords || [],
    weeklyDownloads: obj.downloads?.weekly,
    isInstalled: false,
    installedVersionRange: '',
    dependencyType: '',
    isOutdated: false,
    sourceUrl
  }
}

// ── Metadata fetch (Installed / Updates mode) ──────────────

/**
 * Fetch metadata for installed packages from the registry.
 * One request per package, all in parallel via Promise.allSettled.
 */
export async function fetchInstalledNpmPackagesMetadata(
  installedPackages: InstalledNpmPackage[],
  query: string,
  prerelease: boolean,
  source: NpmPackageSource,
  timeout: number
): Promise<NpmPackageViewModel[]> {
  const baseUrl = ensureNoTrailingSlash(source.url)
  const headers = authHeaders(source)

  const results = await Promise.allSettled(
    installedPackages.map(pkg =>
      fetchSinglePackageMetadata(pkg.name, baseUrl, headers, prerelease, source.url, timeout)
    )
  )

  const packages: NpmPackageViewModel[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      packages.push(result.value)
    }
  }

  return filterAndSortResults(packages, query)
}

/** Fetch all version details for a single package (for the details panel). */
export async function fetchNpmPackageVersions(
  packageName: string,
  prerelease: boolean,
  source: NpmPackageSource,
  timeout: number
): Promise<NpmVersionDetail[]> {
  const result = await fetchNpmPackageFullDetails(packageName, prerelease, source, timeout)
  return result.versions
}

/** Fetch full package metadata + version list (for the details panel). */
export async function fetchNpmPackageFullDetails(
  packageName: string,
  prerelease: boolean,
  source: NpmPackageSource,
  timeout: number
): Promise<{ pkg: NpmPackageViewModel; versions: NpmVersionDetail[] }> {
  const baseUrl = ensureNoTrailingSlash(source.url)
  const headers = authHeaders(source)
  const url = `${baseUrl}/${encodePackageName(packageName)}`

  const metadata = await httpGetJson<NpmPackageMetadata>({ url, headers, timeout })
  const versions = extractVersionDetails(metadata, prerelease)

  const latestVersion = versions[0]?.version || metadata['dist-tags']?.latest || ''
  const latestMeta = metadata.versions?.[latestVersion]

  const pkg: NpmPackageViewModel = {
    name: metadata.name,
    version: latestVersion,
    description: metadata.description || '',
    author: resolveAuthor(metadata.author),
    homepage: metadata.homepage || '',
    license: metadata.license || '',
    keywords: metadata.keywords || [],
    isInstalled: false,
    installedVersionRange: '',
    dependencyType: '',
    isOutdated: false,
    sourceUrl: source.url,
    versions,
    deprecated: latestMeta?.deprecated
  }

  return { pkg, versions }
}

// ── Pure helpers (exported for testing) ────────────────────

/**
 * Strips common range prefixes from a version string.
 *   "^1.2.3" → "1.2.3"
 *   "~1.0.0" → "1.0.0"
 *   ">=1.0.0" → "1.0.0"
 *   "1.0.0" → "1.0.0"
 *   "*" → ""
 */
export function stripVersionRange(range: string): string {
  if (!range || range === '*' || range === 'latest') {
    return ''
  }
  return range.replace(/^[~^>=<]+\s*/, '')
}

/**
 * Encodes a scoped package name for use in registry URLs.
 * "@scope/name" → "@scope%2Fname"
 */
export function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return '@' + encodeURIComponent(name.slice(1))
  }
  return encodeURIComponent(name)
}

/**
 * Resolves the author display string from npm metadata.
 * npm stores author as either a string or an object.
 */
export function resolveAuthor(author: { name: string; email?: string; url?: string } | string | undefined): string {
  if (!author) {
    return ''
  }
  if (typeof author === 'string') {
    return author
  }
  return author.name || ''
}

// ── Internal helpers ───────────────────────────────────────

/** Fetch metadata for a single package from the registry. */
async function fetchSinglePackageMetadata(
  packageName: string,
  baseUrl: string,
  headers: Record<string, string>,
  prerelease: boolean,
  sourceUrl: string,
  timeout: number
): Promise<NpmPackageViewModel | null> {
  const url = `${baseUrl}/${encodePackageName(packageName)}`
  const metadata = await httpGetJson<NpmPackageMetadata>({ url, headers, timeout })

  const latestTag = metadata['dist-tags']?.latest
  if (!latestTag) {
    return null
  }

  // If prerelease not wanted, find the latest non-prerelease version
  let latestVersion = latestTag
  if (!prerelease && isSemVerPrerelease(latestTag)) {
    const versions = Object.keys(metadata.versions || {})
      .filter(v => !isSemVerPrerelease(v))
      .sort((a, b) => compareSemVer(b, a))
    latestVersion = versions[0] || latestTag
  }

  const versionMeta = metadata.versions?.[latestVersion]

  return {
    name: metadata.name,
    version: latestVersion,
    description: metadata.description || '',
    author: resolveAuthor(metadata.author),
    homepage: metadata.homepage || '',
    license: metadata.license || '',
    keywords: metadata.keywords || [],
    isInstalled: false,
    installedVersionRange: '',
    dependencyType: '',
    isOutdated: false,
    sourceUrl,
    deprecated: versionMeta?.deprecated
  }
}

/** Extract version details from full package metadata. */
/** Extract and sort version details from full package metadata. Exported for testing. */
export function extractVersionDetails(metadata: NpmPackageMetadata, prerelease: boolean): NpmVersionDetail[] {
  const versions = Object.keys(metadata.versions || {})
  const timeMap = metadata.time || {}

  let filtered = versions
  if (!prerelease) {
    filtered = filtered.filter(v => !isSemVerPrerelease(v))
  }

  // Sort descending (latest first)
  filtered.sort((a, b) => compareSemVer(b, a))

  return filtered.map(v => {
    const meta = metadata.versions[v]
    return {
      version: v,
      published: timeMap[v] || '',
      deprecated: meta?.deprecated,
      dependencies: meta?.dependencies,
      peerDependencies: meta?.peerDependencies
    }
  })
}

/** Filter by query and sort alphabetically. Exported for testing. */
export function filterAndSortResults(results: NpmPackageViewModel[], query: string): NpmPackageViewModel[] {
  const trimmed = query.trim().toLowerCase()

  const filtered = results.filter(r => {
    if (!trimmed) {
      return true
    }
    return r.name.toLowerCase().includes(trimmed) || r.description.toLowerCase().includes(trimmed)
  })

  filtered.sort((a, b) => a.name.localeCompare(b.name))
  return filtered
}

function authHeaders(source: NpmPackageSource): Record<string, string> {
  if (source.authorizationHeader) {
    return { authorization: source.authorizationHeader }
  }
  return {}
}

function ensureNoTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
