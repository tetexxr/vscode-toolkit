/**
 * Minimal JSON utilities for parsing package.json dependency entries.
 * Counterpart to xml.ts for .NET project files.
 */

export interface PackageJsonDependency {
  name: string
  versionRange: string
  dependencyType: 'dependencies' | 'devDependencies'
}

/**
 * Extracts all dependency entries from a package.json string.
 * Returns entries from both `dependencies` and `devDependencies`.
 * Returns empty array if JSON is invalid or has no dependencies.
 */
export function parsePackageJsonDependencies(json: string): PackageJsonDependency[] {
  const pkg = tryParseJson(json)
  if (!isObject(pkg)) return []

  const results: PackageJsonDependency[] = []

  for (const depType of ['dependencies', 'devDependencies'] as const) {
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
