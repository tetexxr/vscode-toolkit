/**
 * Pure logic for the .env checker.
 * No VS Code dependency — testable standalone.
 *
 * Note: diff results expose KEY NAMES only. Values from a real .env are
 * secrets and must never travel into messages or diagnostics.
 */

export interface EnvEntry {
  key: string
  /** 0-based line number of the declaration. */
  line: number
  /** Raw value text (only ever used when it comes from the example file). */
  value: string
}

const ENTRY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/

export function parseEnv(text: string): EnvEntry[] {
  const entries: EnvEntry[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*#/.test(line)) {
      continue
    }
    const match = ENTRY_RE.exec(line)
    if (match) {
      entries.push({ key: match[1], line: i, value: match[2].trim() })
    }
  }
  return entries
}

export interface EnvDiff {
  /** Keys declared in the example but absent from the env file. */
  missing: string[]
  /** Entries in the env file whose key is not declared in the example. */
  undeclared: EnvEntry[]
}

export function diffEnv(envText: string, exampleText: string): EnvDiff {
  const envEntries = parseEnv(envText)
  const exampleEntries = parseEnv(exampleText)
  const envKeys = new Set(envEntries.map(e => e.key))
  const exampleKeys = new Set(exampleEntries.map(e => e.key))
  const missing: string[] = []
  for (const entry of exampleEntries) {
    if (!envKeys.has(entry.key) && !missing.includes(entry.key)) {
      missing.push(entry.key)
    }
  }
  return {
    missing,
    undeclared: envEntries.filter(e => !exampleKeys.has(e.key))
  }
}

export const DEFAULT_EXAMPLE_NAMES = ['.env.example', '.env.sample', '.env.template', '.env.dist']

/** Whether `fileName` (basename) belongs to the .env family at all. */
export function isEnvFamilyFile(fileName: string): boolean {
  return fileName === '.env' || fileName.startsWith('.env.')
}

/**
 * Lines to append to an env file for its missing keys, copying the example's
 * placeholder values (the example is committed, so its values are public).
 */
export function buildMissingLines(exampleText: string, missing: string[]): string[] {
  const valuesByKey = new Map(parseEnv(exampleText).map(e => [e.key, e.value]))
  return missing.map(key => `${key}=${valuesByKey.get(key) ?? ''}`)
}
