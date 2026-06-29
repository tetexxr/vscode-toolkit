/**
 * Minimal JSON utilities for parsing package.json dependency entries.
 * Counterpart to xml.ts for .NET project files.
 */

/**
 * The package.json sections we surface as dependency "types".
 * `bundledDependencies` is intentionally excluded: it's an array of names, not
 * a name→range map, so it has no version to track.
 */
export type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

const DEPENDENCY_SECTIONS: readonly DependencyType[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
]

export interface PackageJsonDependency {
  name: string
  versionRange: string
  dependencyType: DependencyType
}

/**
 * Extracts all dependency entries from a package.json string, across the
 * `dependencies`, `devDependencies`, `peerDependencies` and
 * `optionalDependencies` sections.
 * Returns empty array if JSON is invalid or has no dependencies.
 */
export function parsePackageJsonDependencies(json: string): PackageJsonDependency[] {
  const pkg = tryParseJson(json)
  if (!isObject(pkg)) return []

  const results: PackageJsonDependency[] = []

  for (const depType of DEPENDENCY_SECTIONS) {
    const deps = pkg[depType]
    if (isObject(deps)) {
      for (const [name, range] of Object.entries(deps)) {
        results.push({
          name,
          versionRange: typeof range === 'string' ? range : '',
          dependencyType: depType
        })
      }
    }
  }

  return results
}

/**
 * Extracts the "name" field from a package.json string.
 * Returns empty string if missing or invalid JSON.
 */
export function parsePackageJsonName(json: string): string {
  const pkg = tryParseJson(json)
  if (!isObject(pkg)) return ''
  return typeof pkg.name === 'string' ? pkg.name : ''
}

function tryParseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
