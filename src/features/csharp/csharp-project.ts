import * as fs from 'fs'
import * as path from 'path'
import { ProjectInfo } from './csharp-types'

export function findProjectFile(dir: string): string | null {
  let current = dir
  for (;;) {
    try {
      const entries = fs.readdirSync(current)
      const csproj = entries.find((e) => e.endsWith('.csproj'))
      if (csproj) return path.join(current, csproj)
    } catch {
      return null
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function getProjectInfo(dir: string): ProjectInfo | null {
  const projectPath = findProjectFile(dir)
  if (!projectPath) return null

  let content: string
  try {
    content = fs.readFileSync(projectPath, 'utf-8')
  } catch {
    return null
  }

  const rootNamespace = extractXmlValue(content, 'RootNamespace')
  const targetFramework = extractXmlValue(content, 'TargetFramework')
  const implicitUsingsStr = extractXmlValue(content, 'ImplicitUsings')
  const useImplicitUsings = implicitUsingsStr?.toLowerCase() === 'enable'

  const usingsInclude = extractUsings(content, 'Include')
  const usingsRemove = extractUsings(content, 'Remove')

  let implicitUsings: string[] = []
  if (useImplicitUsings && targetFramework) {
    implicitUsings = readImplicitUsings(path.dirname(projectPath), targetFramework)
  }
  implicitUsings = [...new Set([...implicitUsings, ...usingsInclude])]

  return {
    projectPath,
    rootNamespace,
    targetFramework,
    useImplicitUsings,
    implicitUsings,
    usingsInclude,
    usingsRemove,
  }
}

export function calculateNamespace(dir: string, projectInfo: ProjectInfo | null): string {
  if (!projectInfo) {
    return sanitizeNamespace(path.basename(dir))
  }

  const projectDir = path.dirname(projectInfo.projectPath)
  const rootNamespace = projectInfo.rootNamespace || sanitizeNamespace(path.basename(projectDir))
  const relativePath = path.relative(projectDir, dir)

  if (!relativePath || relativePath === '.') {
    return rootNamespace
  }

  const segments = relativePath.split(path.sep).filter(Boolean).map(sanitizeNamespace)
  return [rootNamespace, ...segments].join('.')
}

export function isNet6Plus(targetFramework: string): boolean {
  const match = targetFramework.match(/^net(\d+)\.(\d+)/)
  return match ? parseInt(match[1], 10) >= 6 : false
}

export function extractXmlValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`)
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

export function extractUsings(xml: string, attr: string): string[] {
  const re = new RegExp(`<Using\\s+${attr}="([^"]+)"\\s*/?>`, 'g')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1])
  }
  return results
}

function readImplicitUsings(projectDir: string, targetFramework: string): string[] {
  const searchDirs = [
    path.join(projectDir, 'obj', 'Debug', targetFramework),
    path.join(projectDir, 'obj', 'Release', targetFramework),
  ]

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const files = fs.readdirSync(dir)
      const globalUsingsFile = files.find((f) => f.endsWith('GlobalUsings.g.cs'))
      if (globalUsingsFile) {
        const content = fs.readFileSync(path.join(dir, globalUsingsFile), 'utf-8')
        return parseGlobalUsings(content)
      }
    } catch {
      // ignore read errors
    }
  }

  return []
}

export function parseGlobalUsings(content: string): string[] {
  const re = /global using global::(.+);/g
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    results.push(m[1].trim())
  }
  return results
}

export function sanitizeNamespace(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1')
}
