/**
 * Project file discovery and parsing for Node.js projects.
 * Finds package.json files and extracts dependency entries.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { parsePackageJsonDependencies, parsePackageJsonName } from '../../utils/json'
import { NpmProject } from './npm-types'

const PROJECT_GLOB = '**/package.json'
const EXCLUDE_GLOB = '**/node_modules/**'

/** Find all package.json files in the workspace (excluding node_modules). */
export async function discoverPackageJsonFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(PROJECT_GLOB, EXCLUDE_GLOB, 64)
}

/** Show a QuickPick to let the user select a package.json file. */
export async function pickPackageJsonFile(): Promise<vscode.Uri | undefined> {
  const files = await discoverPackageJsonFiles()

  if (files.length === 0) {
    vscode.window.showWarningMessage('No package.json files found in the workspace.')
    return undefined
  }

  const items = files.map((uri) => ({
    label: path.basename(path.dirname(uri.fsPath)),
    description: vscode.workspace.asRelativePath(uri),
    uri
  }))

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project'
  })

  return picked?.uri
}

/** Load a project: read package.json and extract dependency entries. */
export async function loadNpmProject(packageJsonUri: vscode.Uri): Promise<NpmProject> {
  const content = await vscode.workspace.fs.readFile(packageJsonUri)
  const json = Buffer.from(content).toString('utf-8')
  const packages = parsePackageJsonDependencies(json)
  const projectName = parsePackageJsonName(json) || path.basename(path.dirname(packageJsonUri.fsPath))

  return {
    name: projectName,
    fsPath: packageJsonUri.fsPath,
    directoryPath: path.dirname(packageJsonUri.fsPath),
    packages
  }
}

/** Re-read a project by its filesystem path. */
export async function reloadNpmProject(fsPath: string): Promise<NpmProject> {
  return loadNpmProject(vscode.Uri.file(fsPath))
}
