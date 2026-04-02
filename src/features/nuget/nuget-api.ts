/**
 * NuGet V3 API client. Runs in the extension host (Node.js) so it has
 * full network access without CORS restrictions.
 *
 * Supports endpoint discovery via index.json, package search, and
 * version metadata retrieval with filtering and sorting.
 */

import { httpGetJson } from '../../utils/http'
import { compareSemVer, isPrerelease as isSemVerPrerelease } from '../../utils/semver'
import {
  ApiIndexResponse,
  ApiResource,
  SearchResults,
  SearchResultPackage,
  RegistrationIndex,
  RegistrationPage,
  RegistrationLeaf,
  CatalogEntry,
  PackageSource,
  PackageViewModel,
  InstalledPackage,
} from './nuget-types'

// ── Endpoint discovery ─────────────────────────────────────

/** Preferred endpoint types in priority order. */
const SEARCH_ENDPOINTS = ['SearchQueryService/Versioned', 'SearchQueryService/3.5.0', 'SearchQueryService']

const REGISTRATION_ENDPOINTS = ['RegistrationsBaseUrl/Versioned', 'RegistrationsBaseUrl/3.6.0', 'RegistrationsBaseUrl']

interface ResolvedEndpoints {
  search: string
  registration: string
}

/** Cache of resolved endpoints per source URL. */
const endpointCache = new Map<string, ResolvedEndpoints>()

/** Clear the endpoint cache (e.g. when configuration changes). */
export function clearEndpointCache(): void {
  endpointCache.clear()
}

/** Resolve SearchQueryService and RegistrationsBaseUrl from a source's index.json. */
async function resolveEndpoints(source: PackageSource, timeout: number): Promise<ResolvedEndpoints> {
  const cached = endpointCache.get(source.url)
  if (cached) {
    return cached
  }

  const headers = authHeaders(source)
  const index = await httpGetJson<ApiIndexResponse>({ url: source.url, headers, timeout })

  const search = findEndpoint(index.resources, SEARCH_ENDPOINTS)
  const registration = findEndpoint(index.resources, REGISTRATION_ENDPOINTS)

  if (!search || !registration) {
    throw new Error(`Could not resolve NuGet API endpoints from ${source.url}`)
  }

  const resolved = { search, registration }
  endpointCache.set(source.url, resolved)
  return resolved
}

function findEndpoint(resources: ApiResource[], preferred: string[]): string | undefined {
  for (const type of preferred) {
    const found = resources.find((r) => r['@type'].startsWith(type))
    if (found) {
      return found['@id']
    }
  }
  return undefined
}

// ── Search (Browse mode) ───────────────────────────────────

/** Search for packages using the SearchQueryService endpoint. */
export async function searchPackages(
  query: string,
  prerelease: boolean,
  source: PackageSource,
  timeout: number,
  skip: number = 0,
): Promise<{ packages: PackageViewModel[]; totalHits: number }> {
  const endpoints = await resolveEndpoints(source, timeout)
  const headers = authHeaders(source)

  const separator = endpoints.search.includes('?') ? '&' : '?'
  const url = `${endpoints.search}${separator}q=${encodeURIComponent(query)}&prerelease=${prerelease}&semVerLevel=2.0.0&skip=${skip}&take=30`

  const results = await httpGetJson<SearchResults>({ url, headers, timeout })
  return {
    packages: results.data.map((pkg) => searchResultToViewModel(pkg, source.url)),
    totalHits: results.totalHits,
  }
}

function searchResultToViewModel(pkg: SearchResultPackage, sourceUrl: string): PackageViewModel {
  return {
    id: pkg.id,
    version: pkg.version,
    description: pkg.description || '',
    authors: Array.isArray(pkg.authors) ? pkg.authors.join(', ') : pkg.authors || '',
    iconUrl: pkg.iconUrl || '',
    totalDownloads: pkg.totalDownloads,
    verified: pkg.verified || false,
    isInstalled: false,
    installedVersion: '',
    isOutdated: false,
    sourceUrl,
  }
}

// ── Metadata fetch (Installed / Updates mode) ──────────────

/**
 * Fetch metadata for installed packages using the Registration API.
 * Same approach as visual-nuget: one registration request per package,
 * all in parallel, extracting metadata from the latest catalog entry.
 */
export async function fetchInstalledPackagesMetadata(
  installedPackages: InstalledPackage[],
  query: string,
  prerelease: boolean,
  source: PackageSource,
  timeout: number,
): Promise<PackageViewModel[]> {
  const endpoints = await resolveEndpoints(source, timeout)
  const headers = authHeaders(source)

  const results = await Promise.allSettled(
    installedPackages.map((pkg) =>
      fetchSinglePackageMetadata(pkg.id, endpoints.registration, headers, prerelease, source.url, timeout),
    ),
  )

  const packages: PackageViewModel[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      packages.push(result.value)
    }
  }

  return filterAndSortResults(packages, query)
}

/** Fetch all version metadata for a single package (for the details panel). */
export async function fetchPackageVersions(
  packageId: string,
  prerelease: boolean,
  source: PackageSource,
  timeout: number,
): Promise<CatalogEntry[]> {
  const endpoints = await resolveEndpoints(source, timeout)
  const headers = authHeaders(source)

  const registrationUrl = ensureTrailingSlash(endpoints.registration) + `${packageId.toLowerCase()}/index.json`
  const index = await httpGetJson<RegistrationIndex>({ url: registrationUrl, headers, timeout })
  const leafs = await fetchAllLeafs(index, headers, timeout)

  return filterAndSortEntries(leafs, prerelease)
}

// ── Internal helpers ───────────────────────────────────────

/** Fetch metadata for a single package from its registration index. */
async function fetchSinglePackageMetadata(
  packageId: string,
  registrationBase: string,
  headers: Record<string, string>,
  prerelease: boolean,
  sourceUrl: string,
  timeout: number,
): Promise<PackageViewModel | null> {
  const url = ensureTrailingSlash(registrationBase) + `${packageId.toLowerCase()}/index.json`
  const index = await httpGetJson<RegistrationIndex>({ url, headers, timeout })
  const leafs = await fetchAllLeafs(index, headers, timeout)
  const entries = filterAndSortEntries(leafs, prerelease)

  if (entries.length === 0) {
    return null
  }

  const latest = entries[0]
  return {
    id: packageId,
    version: latest.version,
    description: latest.description || '',
    authors: Array.isArray(latest.authors) ? latest.authors.join(', ') : latest.authors || '',
    iconUrl: latest.iconUrl || '',
    totalDownloads: undefined,
    verified: false,
    isInstalled: false,
    installedVersion: '',
    isOutdated: false,
    sourceUrl,
  }
}

/**
 * Fetch all registration leafs from a RegistrationIndex.
 * Pages may have inline items, or may require additional HTTP calls.
 * Uses Promise.allSettled to fetch pages in parallel while tolerating
 * individual page failures.
 */
async function fetchAllLeafs(
  index: RegistrationIndex,
  headers: Record<string, string>,
  timeout: number,
): Promise<RegistrationLeaf[]> {
  const results = await Promise.allSettled(
    index.items.map((page) => {
      if (page.items) {
        return Promise.resolve(page.items)
      }
      return httpGetJson<RegistrationPage>({ url: page['@id'], headers, timeout }).then((p) => p.items || [])
    }),
  )

  const leafs: RegistrationLeaf[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      leafs.push(...result.value)
    }
  }
  return leafs
}

/** Filter out prerelease/unlisted, sort descending by version. */
function filterAndSortEntries(leafs: RegistrationLeaf[], includePrerelease: boolean): CatalogEntry[] {
  let filtered = leafs

  if (!includePrerelease) {
    filtered = filtered.filter((l) => !isSemVerPrerelease(l.catalogEntry.version))
  }

  // Filter out unlisted (listed !== false; undefined means listed)
  filtered = filtered.filter((l) => l.catalogEntry.listed !== false)

  const entries = filtered.map((l) => l.catalogEntry)

  // Sort descending (latest first)
  entries.sort((a, b) => compareSemVer(b.version, a.version))

  return entries
}

function filterAndSortResults(results: (PackageViewModel | null)[], query: string): PackageViewModel[] {
  const trimmed = query.trim().toLowerCase()

  const filtered = results.filter((r): r is PackageViewModel => {
    if (!r) {
      return false
    }
    if (!trimmed) {
      return true
    }
    return r.id.toLowerCase().includes(trimmed) || r.description.toLowerCase().includes(trimmed)
  })

  filtered.sort((a, b) => a.id.localeCompare(b.id))
  return filtered
}

function authHeaders(source: PackageSource): Record<string, string> {
  if (source.authorizationHeader) {
    return { authorization: source.authorizationHeader }
  }
  return {}
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}
