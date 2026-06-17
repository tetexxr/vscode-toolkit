import * as vscode from 'vscode'
import * as path from 'node:path'
import { buildRunCommand, parseScripts } from './run-scripts-utils'
import { detectPackageManager } from './npm/npm-commands'
import type { PackageManager } from './npm/npm-types'

const RUN_COMMAND = 'toolkit.runScripts.run'

function isPackageJson(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && path.basename(document.uri.fsPath) === 'package.json'
}

function codeLensEnabled(): boolean {
  return vscode.workspace.getConfiguration('toolkit.runScripts').get<boolean>('enableCodeLens', true)
}

/** Resolves the package manager to use for a directory, honoring the override setting. */
function resolvePackageManager(directory: string): PackageManager {
  const configured = vscode.workspace.getConfiguration('toolkit.runScripts').get<string>('packageManager', 'auto')
  if (configured === 'npm' || configured === 'yarn' || configured === 'pnpm') {
    return configured
  }
  return detectPackageManager(directory)
}

/* -------------------------------------------------------------------------- */
/*  CodeLens                                                                  */
/* -------------------------------------------------------------------------- */

class ScriptCodeLensProvider implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this.emitter.event

  refresh(): void {
    this.emitter.fire()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!codeLensEnabled() || !isPackageJson(document)) {
      return []
    }
    return parseScripts(document.getText()).map(entry => {
      const range = new vscode.Range(entry.line, 0, entry.line, 0)
      return new vscode.CodeLens(range, {
        title: '$(play) Run',
        command: RUN_COMMAND,
        arguments: [document.uri, entry.name]
      })
    })
  }
}

/* -------------------------------------------------------------------------- */
/*  Running                                                                   */
/* -------------------------------------------------------------------------- */

function runScript(packageJsonUri: vscode.Uri, scriptName: string): void {
  const directory = path.dirname(packageJsonUri.fsPath)
  const pm = resolvePackageManager(directory)
  const command = buildRunCommand(pm, scriptName)
  const terminalName = `${pm}: ${scriptName}`

  // Reuse a terminal previously opened for this exact script, so repeated runs
  // don't pile up terminals.
  const existing = vscode.window.terminals.find(t => t.name === terminalName)
  const terminal = existing ?? vscode.window.createTerminal({ name: terminalName, cwd: directory })
  terminal.show()
  terminal.sendText(command)
}

/* -------------------------------------------------------------------------- */
/*  Run Script… quick pick                                                    */
/* -------------------------------------------------------------------------- */

async function pickAndRun(): Promise<void> {
  const active = vscode.window.activeTextEditor?.document
  let packageJsonUri: vscode.Uri | undefined

  if (active && isPackageJson(active)) {
    packageJsonUri = active.uri
  } else {
    const found = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**')
    if (found.length === 0) {
      vscode.window.showInformationMessage('Toolkit: no package.json found in this workspace.')
      return
    }
    if (found.length === 1) {
      packageJsonUri = found[0]
    } else {
      const picked = await vscode.window.showQuickPick(
        found.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
        { placeHolder: 'Which package.json?' }
      )
      if (!picked) {
        return
      }
      packageJsonUri = picked.uri
    }
  }

  let text: string
  try {
    text = Buffer.from(await vscode.workspace.fs.readFile(packageJsonUri)).toString('utf8')
  } catch {
    vscode.window.showWarningMessage('Toolkit: could not read the selected package.json.')
    return
  }
  const scripts = parseScripts(text)
  if (scripts.length === 0) {
    vscode.window.showInformationMessage('Toolkit: this package.json has no scripts.')
    return
  }
  const picked = await vscode.window.showQuickPick(
    scripts.map(s => ({ label: s.name })),
    { placeHolder: 'Run which script?' }
  )
  if (!picked) {
    return
  }
  runScript(packageJsonUri, picked.label)
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerRunScriptsCommands(context: vscode.ExtensionContext): void {
  const provider = new ScriptCodeLensProvider()
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'json', pattern: '**/package.json' }, provider),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('toolkit.runScripts')) {
        provider.refresh()
      }
    }),
    vscode.commands.registerCommand(RUN_COMMAND, (uri: vscode.Uri, name: string) => runScript(uri, name)),
    vscode.commands.registerCommand('toolkit.runScripts.pick', () => pickAndRun())
  )
}
