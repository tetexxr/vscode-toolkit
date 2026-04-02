/**
 * Pure file/folder utilities. No VS Code dependency.
 */

/**
 * Checks if a folder name matches any of the exclude patterns.
 * Supports simple wildcard (*) matching and case-insensitive comparison.
 */
export function isExcluded(name: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i')
      if (regex.test(name)) {
        return true
      }
    } else {
      if (name.toLowerCase() === pattern.toLowerCase()) {
        return true
      }
    }
  }
  return false
}
