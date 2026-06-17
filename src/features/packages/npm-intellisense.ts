import * as vscode from 'vscode'
import { readFile, readdir } from 'fs/promises'
import { statSync } from 'fs'
import { builtinModules } from 'module'
import { join, resolve, dirname } from 'path'
import { shouldProvide, guessVariableName } from './npm-intellisense-utils'
import { logError } from '../../utils/logger'

// --- Config ---

interface NpmIntellisenseConfig {
  scanDevDependencies: boolean
  recursivePackageJsonLookup: boolean
  packageSubfoldersIntellisense: boolean
  showBuiltinModules: boolean
  excludePackages: string[]
  importES6: boolean
  importQuotes: string
  importLinebreak: string
  importDeclarationType: string
}

function getConfig(): NpmIntellisenseConfig {
  const c = vscode.workspace.getConfiguration('toolkit.npmIntellisense')
  return {
    scanDevDependencies: c.get('scanDevDependencies', false),
    recursivePackageJsonLookup: c.get('recursivePackageJsonLookup', true),
    packageSubfoldersIntellisense: c.get('packageSubfoldersIntellisense', false),
    showBuiltinModules: c.get('showBuiltinModules', false),
    excludePackages: c.get<string[]>('excludePackages', []),
    importES6: c.get('importES6', true),
    importQuotes: c.get('importQuotes', "'"),
    importLinebreak: c.get('importLinebreak', ';\n'),
    importDeclarationType: c.get('importDeclarationType', 'const')
  }
}

// --- Caches ---

interface PackageDeps {
  dependencies: string[]
  devDependencies: string[]
}

// Completions fire on every keystroke inside an import string; re-reading and
// re-parsing package.json each time is wasted IO. Raw dependency keys are
// cached per package.json path (config filters are applied per call), and the
// statSync directory walk is cached per (root, dir). Both caches are cleared
// by a lazily created '**/package.json' watcher.
const depsCache = new Map<string, PackageDeps>()
const lookupCache = new Map<string, string>()
let packageJsonWatcher: vscode.FileSystemWatcher | undefined
let extensionContext: vscode.ExtensionContext | undefined

function ensurePackageJsonWatcher(): void {
  if (packageJsonWatcher || !extensionContext) {
    return
  }
  packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json')
  const clear = () => {
    depsCache.clear()
    lookupCache.clear()
  }
  extensionContext.subscriptions.push(
    packageJsonWatcher,
    packageJsonWatcher.onDidChange(clear),
    // Create/delete also invalidate the lookup cache: a new, nearer
    // package.json changes which file a directory resolves to.
    packageJsonWatcher.onDidCreate(clear),
    packageJsonWatcher.onDidDelete(clear)
  )
}

// --- Registration ---

const DEFAULT_LANGUAGES = ['typescript', 'javascript', 'javascriptreact', 'typescriptreact']

export function registerNpmIntellisenseCommands(context: vscode.ExtensionContext): void {
  extensionContext = context
  const provider = new NpmCompletionProvider()
  const c = vscode.workspace.getConfiguration('toolkit.npmIntellisense')
  const languages = c.get<string[]>('languages', DEFAULT_LANGUAGES)
  const selector: vscode.DocumentSelector = languages

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, provider, '"', "'", '/'),
    vscode.commands.registerCommand('toolkit.npmIntellisense.import', onImportCommand)
  )
}

// --- Completion Provider ---

class NpmCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position).text
    const cursor = position.character

    if (!shouldProvide(line, cursor)) {
      return []
    }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!folder) {
      return []
    }

    const config = getConfig()
    let packages = await getNpmPackages(folder.uri.fsPath, dirname(document.fileName), config)

    if (config.packageSubfoldersIntellisense) {
      packages = await resolveSubfolders(packages, line, folder.uri.fsPath)
    }

    return packages.map(name => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module)
      item.insertText = name
      item.range = importStringRange(line, position)
      return item
    })
  }
}

// --- Should Provide (see npm-intellisense-utils.ts) ---

// --- Package Resolution ---

async function getNpmPackages(rootPath: string, filePath: string, config: NpmIntellisenseConfig): Promise<string[]> {
  try {
    ensurePackageJsonWatcher()
    const packageJsonPath = config.recursivePackageJsonLookup
      ? cachedNearestPackageJson(rootPath, filePath)
      : join(rootPath, 'package.json')

    const deps = await readDeps(packageJsonPath)

    const exclude = new Set(config.excludePackages)
    return [
      ...deps.dependencies,
      ...(config.scanDevDependencies ? deps.devDependencies : []),
      ...(config.showBuiltinModules ? getBuiltinModules() : [])
    ].filter(name => !exclude.has(name))
  } catch (err) {
    // Missing or malformed package.json is the typical cause — we keep
    // completions empty rather than surfacing an error per keystroke.
    logError('npm-intellisense', err)
    return []
  }
}

async function readDeps(packageJsonPath: string): Promise<PackageDeps> {
  const cached = depsCache.get(packageJsonPath)
  if (cached) {
    return cached
  }
  const content = await readFile(packageJsonPath, 'utf-8')
  const pkg = JSON.parse(content) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const entry: PackageDeps = {
    dependencies: Object.keys(pkg.dependencies ?? {}),
    devDependencies: Object.keys(pkg.devDependencies ?? {})
  }
  depsCache.set(packageJsonPath, entry)
  return entry
}

function cachedNearestPackageJson(rootPath: string, currentPath: string): string {
  const key = `${rootPath}\0${currentPath}`
  const cached = lookupCache.get(key)
  if (cached) {
    return cached
  }
  const result = nearestPackageJson(rootPath, currentPath)
  lookupCache.set(key, result)
  return result
}

function nearestPackageJson(rootPath: string, currentPath: string): string {
  const absCurrent = resolve(currentPath)
  const absRoot = resolve(rootPath)
  const candidate = join(absCurrent, 'package.json')

  if (absCurrent === absRoot || isFile(candidate)) {
    return candidate
  }

  const parent = resolve(absCurrent, '..')
  if (parent === absCurrent) {
    // Filesystem root: the file is not under rootPath (symlinks, drive-letter
    // casing) — stop instead of recursing forever.
    return candidate
  }

  return nearestPackageJson(rootPath, parent)
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function getBuiltinModules(): string[] {
  return builtinModules.filter(m => !m.startsWith('_'))
}

async function resolveSubfolders(packages: string[], line: string, rootPath: string): Promise<string[]> {
  const match = line.match(/(?:from\s+|require\s*\(\s*)['"]([^'"]*\/)/)
  if (!match) {
    return packages
  }

  const fragment = match[1]
  const parts = fragment.split('/')
  const packageName = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]

  if (!packages.includes(packageName)) {
    return packages
  }

  try {
    const dir = join(rootPath, 'node_modules', ...parts.filter(Boolean))
    const files = await readdir(dir)
    return files.map(file => fragment + file.replace(/\.js$/, ''))
  } catch (err) {
    logError('npm-intellisense.subfolders', err)
    return packages
  }
}

// --- Utilities ---

function importStringRange(line: string, position: vscode.Position): vscode.Range {
  const textToPosition = line.substring(0, position.character)
  const quotePos = Math.max(textToPosition.lastIndexOf('"'), textToPosition.lastIndexOf("'"))
  return new vscode.Range(position.line, quotePos + 1, position.line, position.character)
}

// --- Import Command ---

async function onImportCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  if (!folder) {
    return
  }

  const config = getConfig()
  const packages = await getNpmPackages(folder.uri.fsPath, dirname(editor.document.fileName), config)

  if (packages.length === 0) {
    vscode.window.showInformationMessage('No npm packages found.')
    return
  }

  const items = packages.map(name => ({ label: name, description: 'npm module' }))
  const selection = await vscode.window.showQuickPick(items, { matchOnDescription: true })
  if (!selection) {
    return
  }

  const q = config.importQuotes
  const lb = config.importLinebreak
  const statement = config.importES6
    ? `import {} from ${q}${selection.label}${q}${lb}`
    : `${config.importDeclarationType} ${guessVariableName(selection.label)} = require(${q}${selection.label}${q})${lb}`

  await editor.edit(edit => edit.insert(editor.selection.start, statement))
}
