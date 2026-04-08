/**
 * Shared type definitions for the npm package manager feature.
 * Used by both the extension host modules and the webview IPC protocol.
 */

// ── Configuration ──────────────────────────────────────────

export interface NpmPackageSource {
  name: string
  url: string
  authorizationHeader?: string
}

export interface NpmConfig {
  requestTimeout: number
  defaultPrerelease: boolean
}

// ── Project ────────────────────────────────────────────────

export type DependencyType = 'dependencies' | 'devDependencies'

export interface InstalledNpmPackage {
  name: string
  versionRange: string
  dependencyType: DependencyType
}

export interface NpmProject {
  name: string
  fsPath: string
  directoryPath: string
  packages: InstalledNpmPackage[]
}

// ── npm Registry API responses ─────────────────────────────

export interface NpmSearchResponse {
  objects: NpmSearchObject[]
  total: number
  time: string
}

export interface NpmSearchObject {
  package: NpmSearchPackage
  downloads?: { monthly: number; weekly: number }
  score: { final: number; detail: { quality: number; popularity: number; maintenance: number } }
  searchScore: number
}

export interface NpmSearchPackage {
  name: string
  version: string
  description: string
  keywords: string[]
  date: string
  license?: string
  publisher: { username: string; email: string }
  maintainers: Array<{ username: string; email: string }>
  links: { npm?: string; homepage?: string; repository?: string; bugs?: string }
}

export interface NpmPackageMetadata {
  name: string
  description: string
  'dist-tags': Record<string, string>
  versions: Record<string, NpmVersionMetadata>
  time: Record<string, string>
  author?: { name: string; email?: string; url?: string } | string
  license?: string
  homepage?: string
  repository?: { type: string; url: string } | string
  keywords?: string[]
  readme?: string
}

export interface NpmVersionMetadata {
  name: string
  version: string
  description: string
  author?: { name: string; email?: string; url?: string } | string
  license?: string
  homepage?: string
  repository?: { type: string; url: string } | string
  keywords?: string[]
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  deprecated?: string
}

// ── UI view model ──────────────────────────────────────────

export interface NpmPackageViewModel {
  name: string
  version: string
  description: string
  author: string
  homepage: string
  license: string
  keywords: string[]
  weeklyDownloads?: number
  isInstalled: boolean
  installedVersionRange: string
  dependencyType: DependencyType | ''
  isOutdated: boolean
  sourceUrl: string
  versions?: NpmVersionDetail[]
  deprecated?: string
}

export interface NpmVersionDetail {
  version: string
  published: string
  deprecated?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export type NpmCategory = 'browse' | 'installed' | 'updates'

// ── Overview view model ───────────────────────────────────────

export interface NpmOverviewPackage {
  name: string
  installedVersionRange: string
  latestVersion: string
  dependencyType: DependencyType
  isOutdated: boolean
}

export interface NpmOverviewProject {
  name: string
  fsPath: string
  packages: NpmOverviewPackage[]
}

// ── IPC: Webview → Extension ───────────────────────────────

export type NpmWebviewMessage =
  | { command: 'ready' }
  | { command: 'search'; query: string; prerelease: boolean; sourceIndex: number; category: NpmCategory; skip: number }
  | { command: 'select-package'; packageName: string }
  | { command: 'install'; packageName: string; version: string; devDependency: boolean }
  | { command: 'uninstall'; packageName: string }
  | { command: 'update'; packageName: string; version: string; devDependency: boolean }
  | { command: 'update-all'; packages: Array<{ name: string; version: string; devDependency: boolean }> }
  | { command: 'open-settings' }
  | { command: 'open-url'; url: string }

// ── IPC: Extension → Webview ───────────────────────────────

export type NpmExtensionMessage =
  | { type: 'init'; project: NpmProject; sources: NpmPackageSource[]; config: NpmConfig }
  | { type: 'packages'; packages: NpmPackageViewModel[]; category: NpmCategory; totalHits: number; append: boolean }
  | { type: 'package-details'; pkg: NpmPackageViewModel }
  | { type: 'loading'; loading: boolean }
  | { type: 'task-started'; packageName: string; action: string }
  | { type: 'task-finished'; packageName: string; action: string; success: boolean }
  | { type: 'project-updated'; project: NpmProject }
  | { type: 'error'; message: string }

// ── IPC: Overview Webview → Extension ─────────────────────────

export type NpmOverviewWebviewMessage =
  | { command: 'ready' }
  | { command: 'load-versions' }
  | { command: 'update'; projectFsPath: string; packageName: string; version: string; devDependency: boolean }
  | {
      command: 'update-all'
      packages: Array<{ projectFsPath: string; packageName: string; version: string; devDependency: boolean }>
    }
  | { command: 'open-settings' }

// ── IPC: Extension → Overview Webview ─────────────────────────

export type NpmOverviewExtensionMessage =
  | { type: 'overview-data'; projects: NpmOverviewProject[]; loading: boolean }
  | { type: 'overview-error'; message: string }
  | { type: 'task-started'; packageName: string; action: string }
  | { type: 'task-finished'; packageName: string; action: string; success: boolean }
