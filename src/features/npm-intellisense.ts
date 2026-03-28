import * as vscode from 'vscode';
import { readFile, readdir } from 'fs/promises';
import { statSync } from 'fs';
import { builtinModules } from 'module';
import { join, resolve, dirname } from 'path';
import { shouldProvide, guessVariableName } from './npm-intellisense-utils';

// --- Config ---

interface NpmIntellisenseConfig {
  scanDevDependencies: boolean;
  recursivePackageJsonLookup: boolean;
  packageSubfoldersIntellisense: boolean;
  showBuiltinModules: boolean;
  importES6: boolean;
  importQuotes: string;
  importLinebreak: string;
  importDeclarationType: string;
}

function getConfig(): NpmIntellisenseConfig {
  const c = vscode.workspace.getConfiguration('toolkit.npmIntellisense');
  return {
    scanDevDependencies: c.get('scanDevDependencies', false),
    recursivePackageJsonLookup: c.get('recursivePackageJsonLookup', true),
    packageSubfoldersIntellisense: c.get('packageSubfoldersIntellisense', false),
    showBuiltinModules: c.get('showBuiltinModules', false),
    importES6: c.get('importES6', true),
    importQuotes: c.get('importQuotes', "'"),
    importLinebreak: c.get('importLinebreak', ';\n'),
    importDeclarationType: c.get('importDeclarationType', 'const'),
  };
}

// --- Registration ---

export function registerNpmIntellisenseCommands(context: vscode.ExtensionContext): void {
  const provider = new NpmCompletionProvider();
  const selector: vscode.DocumentSelector = [
    'typescript', 'javascript', 'javascriptreact', 'typescriptreact',
  ];

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, provider, '"', "'", '/'),
    vscode.commands.registerCommand('toolkit.npmIntellisense.import', onImportCommand),
  );
}

// --- Completion Provider ---

class NpmCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position).text;
    const cursor = position.character;

    if (!shouldProvide(line, cursor)) { return []; }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) { return []; }

    const config = getConfig();
    let packages = await getNpmPackages(folder.uri.fsPath, dirname(document.fileName), config);

    if (config.packageSubfoldersIntellisense) {
      packages = await resolveSubfolders(packages, line, folder.uri.fsPath);
    }

    return packages.map(name => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
      item.textEdit = vscode.TextEdit.replace(importStringRange(line, position), name);
      return item;
    });
  }
}

// --- Should Provide (see npm-intellisense-utils.ts) ---

// --- Package Resolution ---

async function getNpmPackages(
  rootPath: string,
  filePath: string,
  config: NpmIntellisenseConfig,
): Promise<string[]> {
  try {
    const packageJsonPath = config.recursivePackageJsonLookup
      ? nearestPackageJson(rootPath, filePath)
      : join(rootPath, 'package.json');

    const content = await readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    return [
      ...Object.keys(pkg.dependencies || {}),
      ...(config.scanDevDependencies ? Object.keys(pkg.devDependencies || {}) : []),
      ...(config.showBuiltinModules ? getBuiltinModules() : []),
    ];
  } catch {
    return [];
  }
}

function nearestPackageJson(rootPath: string, currentPath: string): string {
  const absCurrent = resolve(currentPath);
  const absRoot = resolve(rootPath);
  const candidate = join(absCurrent, 'package.json');

  if (absCurrent === absRoot || isFile(candidate)) {
    return candidate;
  }

  return nearestPackageJson(rootPath, resolve(absCurrent, '..'));
}

function isFile(filePath: string): boolean {
  try { return statSync(filePath).isFile(); }
  catch { return false; }
}

function getBuiltinModules(): string[] {
  return builtinModules.filter(m => !m.startsWith('_'));
}

async function resolveSubfolders(
  packages: string[],
  line: string,
  rootPath: string,
): Promise<string[]> {
  const match = line.match(/(?:from\s+|require\s*\(\s*)['"]([^'"]*\/)/);
  if (!match) { return packages; }

  const fragment = match[1];
  const parts = fragment.split('/');
  const packageName = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];

  if (!packages.includes(packageName)) { return packages; }

  try {
    const dir = join(rootPath, 'node_modules', ...parts.filter(Boolean));
    const files = await readdir(dir);
    return files.map(file => fragment + file.replace(/\.js$/, ''));
  } catch {
    return packages;
  }
}

// --- Utilities ---

function importStringRange(line: string, position: vscode.Position): vscode.Range {
  const textToPosition = line.substring(0, position.character);
  const quotePos = Math.max(textToPosition.lastIndexOf('"'), textToPosition.lastIndexOf("'"));
  return new vscode.Range(position.line, quotePos + 1, position.line, position.character);
}

// --- Import Command ---

async function onImportCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) { return; }

  const config = getConfig();
  const packages = await getNpmPackages(folder.uri.fsPath, dirname(editor.document.fileName), config);

  if (packages.length === 0) {
    vscode.window.showInformationMessage('No npm packages found.');
    return;
  }

  const items = packages.map(name => ({ label: name, description: 'npm module' }));
  const selection = await vscode.window.showQuickPick(items, { matchOnDescription: true });
  if (!selection) { return; }

  const q = config.importQuotes;
  const lb = config.importLinebreak;
  const statement = config.importES6
    ? `import {} from ${q}${selection.label}${q}${lb}`
    : `${config.importDeclarationType} ${guessVariableName(selection.label)} = require(${q}${selection.label}${q})${lb}`;

  await editor.edit(edit => edit.insert(editor.selection.start, statement));
}
