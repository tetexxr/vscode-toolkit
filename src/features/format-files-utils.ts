export const DEFAULT_EXCLUDED_FOLDERS = [
  'node_modules',
  '.vscode',
  '.git',
  'dist',
  'build',
  '.chrome',
  'bin',
  'obj',
  '.vs'
]

export const DEFAULT_INCLUDE_GLOB = '**/*.{ts,js,json,html,css,md,tsx,jsx,vue,scss,less,yaml,yml,cs,razor,cshtml}'

export type ExcludeMap = Record<string, unknown>

export function collectNativeExcludes(filesExclude: ExcludeMap, searchExclude: ExcludeMap): string[] {
  const patterns: string[] = []
  for (const [glob, enabled] of [...Object.entries(filesExclude), ...Object.entries(searchExclude)]) {
    if (enabled === true) {
      patterns.push(glob)
    }
  }
  return patterns
}

export function buildExcludeGlob(
  excludedFolders: string[],
  filesExclude: ExcludeMap,
  searchExclude: ExcludeMap
): string | undefined {
  const customPatterns = excludedFolders.map(folder => `**/${folder}/**`)
  const nativePatterns = collectNativeExcludes(filesExclude, searchExclude)
  const all = Array.from(new Set([...customPatterns, ...nativePatterns]))

  if (all.length === 0) {
    return undefined
  }
  return `{${all.join(',')}}`
}
