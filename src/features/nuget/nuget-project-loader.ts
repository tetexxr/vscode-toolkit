/**
 * Project file discovery and parsing for .NET project files.
 * Finds .csproj/.fsproj/.vbproj files and extracts PackageReference entries.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parsePackageReferences } from '../../utils/xml';
import { Project } from './nuget-types';

const PROJECT_GLOB = '**/*.{csproj,fsproj,vbproj}';

/** Find all .NET project files in the workspace. */
export async function discoverProjectFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(PROJECT_GLOB, undefined, 64);
}

/** Show a QuickPick to let the user select a project file. */
export async function pickProjectFile(): Promise<vscode.Uri | undefined> {
  const files = await discoverProjectFiles();

  if (files.length === 0) {
    vscode.window.showWarningMessage('No .csproj, .fsproj, or .vbproj files found in the workspace.');
    return undefined;
  }

  const items = files.map(uri => ({
    label: path.basename(uri.fsPath),
    description: vscode.workspace.asRelativePath(uri),
    uri,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project file',
  });

  return picked?.uri;
}

/** Load a project file: read XML and extract PackageReference entries. */
export async function loadProject(projectFileUri: vscode.Uri): Promise<Project> {
  const content = await vscode.workspace.fs.readFile(projectFileUri);
  const xml = Buffer.from(content).toString('utf-8');
  const packages = parsePackageReferences(xml);

  return {
    name: path.basename(projectFileUri.fsPath),
    fsPath: projectFileUri.fsPath,
    packages,
  };
}

/** Re-read a project file by its filesystem path. */
export async function reloadProject(fsPath: string): Promise<Project> {
  return loadProject(vscode.Uri.file(fsPath));
}
