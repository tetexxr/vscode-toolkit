/**
 * Shared type definitions for the NuGet package manager feature.
 * Used by both the extension host modules and the webview IPC protocol.
 */

// ── Configuration ──────────────────────────────────────────

export interface PackageSource {
  name: string
  url: string
  authorizationHeader?: string
}

export interface NugetConfig {
  requestTimeout: number
  defaultPrerelease: boolean
}

// ── Project ────────────────────────────────────────────────

export interface InstalledPackage {
  id: string
  version: string
}

export interface Project {
  name: string
  fsPath: string
  packages: InstalledPackage[]
}

// ── NuGet V3 API responses ─────────────────────────────────

export interface ApiIndexResponse {
  resources: ApiResource[]
}

export interface ApiResource {
  '@id': string
  '@type': string
}

export interface SearchResults {
  totalHits: number
  data: SearchResultPackage[]
}

export interface SearchResultPackage {
  id: string
  version: string
  description: string
  authors: string | string[]
  iconUrl: string
  totalDownloads?: number
  verified: boolean
  versions?: SearchResultVersion[]
}

export interface SearchResultVersion {
  version: string
  downloads: number
}

export interface RegistrationIndex {
  count: number
  items: RegistrationPage[]
}

export interface RegistrationPage {
  '@id': string
  count: number
  items?: RegistrationLeaf[]
}

export interface RegistrationLeaf {
  '@id': string
  catalogEntry: CatalogEntry
}

export interface CatalogEntry {
  '@id': string
  id: string
  version: string
  description: string
  authors: string | string[]
  iconUrl: string
  licenseUrl: string
  projectUrl: string
  tags: string | string[]
  dependencyGroups?: DependencyGroup[]
  published: string
  listed?: boolean
  vulnerabilities?: Vulnerability[]
}

export interface DependencyGroup {
  targetFramework: string
  dependencies?: Dependency[]
}

export interface Dependency {
  id: string
  range: string
}

export interface Vulnerability {
  advisoryUrl: string
  severity: string
}

// ── UI view model ──────────────────────────────────────────

export interface PackageViewModel {
  id: string
  version: string
  description: string
  authors: string
  iconUrl: string
  totalDownloads?: number
  verified: boolean
  isInstalled: boolean
  installedVersion: string
  isOutdated: boolean
  sourceUrl: string
  versions?: CatalogEntry[]
}

export type Category = 'browse' | 'installed' | 'updates'

// ── Overview view model ───────────────────────────────────────

export interface OverviewPackage {
  id: string
  installedVersion: string
  latestVersion: string
  isOutdated: boolean
}

export interface OverviewProject {
  name: string
  fsPath: string
  packages: OverviewPackage[]
}

// ── IPC: Overview Webview → Extension ─────────────────────────

export type OverviewWebviewMessage =
  | { command: 'ready' }
  | { command: 'load-versions' }
  | { command: 'update'; projectFsPath: string; packageId: string; version: string; sourceUrl: string }
  | { command: 'open-settings' }

// ── IPC: Extension → Overview Webview ─────────────────────────

export type OverviewExtensionMessage =
  | { type: 'overview-data'; projects: OverviewProject[]; loading: boolean }
  | { type: 'overview-error'; message: string }
  | { type: 'task-started'; packageId: string; action: string }
  | { type: 'task-finished'; packageId: string; action: string; success: boolean }

// ── IPC: Webview → Extension ───────────────────────────────

export type WebviewMessage =
  | { command: 'ready' }
  | { command: 'search'; query: string; prerelease: boolean; sourceIndex: number; category: Category; skip: number }
  | { command: 'select-package'; packageId: string }
  | { command: 'install'; packageId: string; version: string; sourceUrl: string }
  | { command: 'uninstall'; packageId: string }
  | { command: 'update'; packageId: string; version: string; sourceUrl: string }
  | { command: 'update-all'; packages: Array<{ id: string; version: string; sourceUrl: string }> }
  | { command: 'open-settings' }
  | { command: 'open-url'; url: string }

// ── IPC: Extension → Webview ───────────────────────────────

export type ExtensionMessage =
  | { type: 'init'; project: Project; sources: PackageSource[]; config: NugetConfig }
  | { type: 'packages'; packages: PackageViewModel[]; category: Category; totalHits: number; append: boolean }
  | { type: 'package-details'; pkg: PackageViewModel }
  | { type: 'loading'; loading: boolean }
  | { type: 'task-started'; packageId: string; action: string }
  | { type: 'task-finished'; packageId: string; action: string; success: boolean }
  | { type: 'project-updated'; project: Project }
  | { type: 'error'; message: string }
