/**
 * Pure utilities for alias-to-relative import conversion.
 * No VS Code dependency — testable standalone.
 */

import * as path from 'path'
import * as fs from 'fs'

export interface PathMapping {
  prefix: string
  wildcard: boolean
  targets: string[]
}

export interface ResolvedPaths {
  baseUrl: string
  mappings: PathMapping[]
}

export interface ImportMatch {
  /** Byte offset in the source where the module path string starts (inside the quotes) */
  pathStart: number
  /** The original module specifier */
  importPath: string
  /** The computed relative replacement */
  relativePath: string
}

// Matches: from 'path', require('path'), import('path')
export const PATH_RE = /(?:from\s+|require\s*\(\s*|import\s*\(\s*)(['"])([^'"]+)\1/g

export function stripJsonComments(text: string): string {
  return text
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
}

export function buildMappings(pathsObj: Record<string, string[]>): PathMapping[] {
  const mappings: PathMapping[] = []
  for (const [pattern, targets] of Object.entries(pathsObj)) {
    const wildcard = pattern.includes('*')
    mappings.push({
      prefix: wildcard ? pattern.replace('/*', '/').replace('*', '') : pattern,
      wildcard,
      targets
    })
  }
  // Longest prefix first for greedy matching
  mappings.sort((a, b) => b.prefix.length - a.prefix.length)
  return mappings
}

export function resolveAlias(importPath: string, config: ResolvedPaths): string | undefined {
  for (const m of config.mappings) {
    if (m.wildcard && importPath.startsWith(m.prefix)) {
      const rest = importPath.slice(m.prefix.length)
      const target = m.targets[0].replace('*', rest)
      return path.resolve(config.baseUrl, target)
    }
    if (!m.wildcard && importPath === m.prefix) {
      return path.resolve(config.baseUrl, m.targets[0])
    }
  }
  return undefined
}

export function toRelative(fromFile: string, toAbsolute: string): string {
  let rel = path.relative(path.dirname(fromFile), toAbsolute)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel.replace(/\\/g, '/')
}

export function findTsConfig(startDir: string): string | undefined {
  let dir = startDir
  for (;;) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) return p
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function resolveExtendsPath(configDir: string, ext: string): string | undefined {
  if (ext.startsWith('.') || ext.startsWith('/')) {
    let p = path.resolve(configDir, ext)
    if (fs.existsSync(p)) return p
    if (!p.endsWith('.json')) p += '.json'
    return fs.existsSync(p) ? p : undefined
  }
  // Package reference — walk up looking in node_modules
  let dir = configDir
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ext)
    if (fs.existsSync(candidate)) {
      try {
        if (fs.statSync(candidate).isDirectory()) {
          const inner = path.join(candidate, 'tsconfig.json')
          if (fs.existsSync(inner)) return inner
        } else {
          return candidate
        }
      } catch {}
    }
    const withJson = candidate.endsWith('.json') ? candidate : candidate + '.json'
    if (withJson !== candidate && fs.existsSync(withJson)) return withJson
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function loadPathsFromConfig(configPath: string, depth = 0): ResolvedPaths | undefined {
  if (depth > 5) return undefined
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(stripJsonComments(raw))
    const configDir = path.dirname(configPath)
    const opts = config.compilerOptions || {}

    if (opts.paths && Object.keys(opts.paths).length > 0) {
      return {
        baseUrl: path.resolve(configDir, opts.baseUrl || '.'),
        mappings: buildMappings(opts.paths)
      }
    }

    // Follow extends chain
    if (config.extends) {
      const exts = Array.isArray(config.extends) ? config.extends : [config.extends]
      for (const ext of exts) {
        const parentPath = resolveExtendsPath(configDir, ext)
        if (parentPath) {
          const result = loadPathsFromConfig(parentPath, depth + 1)
          if (result) {
            if (opts.baseUrl) {
              result.baseUrl = path.resolve(configDir, opts.baseUrl)
            }
            return result
          }
        }
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Given an absolute path, find the best matching alias for it.
 * Returns the alias import string (e.g. '@server/payments/repository') or undefined.
 */
export function toAlias(absolutePath: string, config: ResolvedPaths): string | undefined {
  for (const m of config.mappings) {
    if (m.wildcard) {
      const target = m.targets[0]
      const targetBase = path.resolve(config.baseUrl, target.replace('*', ''))
      const rel = path.relative(targetBase, absolutePath)
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        return m.prefix + rel.replace(/\\/g, '/')
      }
    } else {
      const target = path.resolve(config.baseUrl, m.targets[0])
      if (absolutePath === target) {
        return m.prefix
      }
    }
  }
  return undefined
}

/**
 * Scan source text for relative imports that could be converted to aliases.
 */
export function findAliasMatches(sourceText: string, filePath: string, config: ResolvedPaths): ImportMatch[] {
  const matches: ImportMatch[] = []
  const re = new RegExp(PATH_RE.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(sourceText)) !== null) {
    const quote = match[1]
    const importPath = match[2]
    if (!importPath.startsWith('.')) continue

    const absolute = path.resolve(path.dirname(filePath), importPath)
    const alias = toAlias(absolute, config)
    if (!alias) continue

    const pathStart = match.index + match[0].indexOf(quote + importPath) + 1
    matches.push({ pathStart, importPath, relativePath: alias })
  }
  return matches
}

/**
 * Scan source text for alias imports and return the edits needed to convert them to relative paths.
 */
export function findImportMatches(sourceText: string, filePath: string, config: ResolvedPaths): ImportMatch[] {
  const matches: ImportMatch[] = []
  const re = new RegExp(PATH_RE.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(sourceText)) !== null) {
    const quote = match[1]
    const importPath = match[2]
    if (importPath.startsWith('.') || importPath.startsWith('/')) continue

    const absolute = resolveAlias(importPath, config)
    if (!absolute) continue

    const relative = toRelative(filePath, absolute)
    const pathStart = match.index + match[0].indexOf(quote + importPath) + 1

    matches.push({ pathStart, importPath, relativePath: relative })
  }
  return matches
}
