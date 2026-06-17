/**
 * Pure logic for Scratch Files — throwaway files kept outside the workspace.
 * Filesystem- and vscode-free so it can be unit-tested under mocha; the disk
 * I/O and editor wiring live in `scratch.ts`.
 */

export interface CuratedLanguage {
  label: string
  languageId: string
}

/** The short, curated language list shown first when creating a scratch. */
export const CURATED_LANGUAGES: CuratedLanguage[] = [
  { label: 'Markdown', languageId: 'markdown' },
  { label: 'JSON', languageId: 'json' },
  { label: 'JavaScript', languageId: 'javascript' },
  { label: 'TypeScript', languageId: 'typescript' },
  { label: 'SQL', languageId: 'sql' },
  { label: 'HTTP', languageId: 'http' },
  { label: 'YAML', languageId: 'yaml' },
  { label: 'Python', languageId: 'python' },
  { label: 'Shell Script', languageId: 'shellscript' },
  { label: 'Plain Text', languageId: 'plaintext' }
]

/** Best-effort file extension for a language id, used so file icons and language
 * auto-detection match. Falls back to `txt` for anything unmapped. */
export const EXT_BY_LANGUAGE: Record<string, string> = {
  markdown: 'md',
  json: 'json',
  jsonc: 'jsonc',
  javascript: 'js',
  javascriptreact: 'jsx',
  typescript: 'ts',
  typescriptreact: 'tsx',
  sql: 'sql',
  http: 'http',
  yaml: 'yaml',
  python: 'py',
  shellscript: 'sh',
  plaintext: 'txt',
  html: 'html',
  css: 'css',
  scss: 'scss',
  xml: 'xml',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  java: 'java',
  ruby: 'rb',
  php: 'php',
  c: 'c',
  cpp: 'cpp'
}

export function extForLanguage(languageId: string): string {
  return EXT_BY_LANGUAGE[languageId] ?? 'txt'
}

/** Extracts the numeric suffix of an auto-generated `scratch-N.ext` name. */
export function parseScratchIndex(name: string): number | null {
  const match = /^scratch-(\d+)\./.exec(name)
  return match ? parseInt(match[1], 10) : null
}

/** Next free `scratch-N.<ext>` name given the files already present. */
export function nextScratchName(existing: string[], ext: string): string {
  let max = 0
  for (const name of existing) {
    const index = parseScratchIndex(name)
    if (index !== null && index > max) {
      max = index
    }
  }
  return `scratch-${max + 1}.${ext}`
}

/**
 * Orders scratch names newest-first: auto-generated `scratch-N` names by
 * descending number, then any other (renamed) names alphabetically.
 */
export function sortScratchNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = parseScratchIndex(a)
    const ib = parseScratchIndex(b)
    if (ia !== null && ib !== null) {
      return ib - ia
    }
    if (ia !== null) {
      return -1
    }
    if (ib !== null) {
      return 1
    }
    return a.localeCompare(b)
  })
}
