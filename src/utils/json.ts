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
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(json)
  } catch {
    return []
  }

  if (!pkg || typeof pkg !== 'object') {
    return []
  }

  const results: PackageJsonDependency[] = []

  for (const depType of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[depType]
    if (deps && typeof deps === 'object') {
      for (const [name, range] of Object.entries(deps as Record<string, string>)) {
        results.push({ name, versionRange: range || '', dependencyType: depType })
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
  try {
    const pkg = JSON.parse(json)
    return typeof pkg?.name === 'string' ? pkg.name : ''
  } catch {
    return ''
  }
}
