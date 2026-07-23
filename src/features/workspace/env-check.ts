import * as vscode from 'vscode'
import * as path from 'node:path'
import {
  DEFAULT_EXAMPLE_NAMES,
  buildMissingLines,
  diffEnv,
  isEnvFamilyFile
} from './env-check-utils'

/**
 * .env checker — keeps .env files and their committed example
 * (.env.example / .env.sample / ...) in sync:
 *  - editing a .env: warns about keys missing vs the example, hints at keys
 *    not declared in it, and offers a quick fix to add the missing ones.
 *  - editing the example: warns about keys present in the sibling .env that
 *    are not declared.
 * Only key NAMES are ever shown — values from a real .env are secrets.
 */

const MISSING_CODE = 'env-missing-keys'

interface EnvConfig {
  enabled: boolean
  exampleNames: string[]
  severity: vscode.DiagnosticSeverity
}

function readConfig(): EnvConfig {
  const config = vscode.workspace.getConfiguration('toolkit.envCheck')
  const severityName = config.get<string>('severity', 'warning')
  const severity =
    severityName === 'error'
      ? vscode.DiagnosticSeverity.Error
      : severityName === 'information'
        ? vscode.DiagnosticSeverity.Information
        : severityName === 'hint'
          ? vscode.DiagnosticSeverity.Hint
          : vscode.DiagnosticSeverity.Warning
  return {
    enabled: config.get<boolean>('enabled', true),
    exampleNames: config.get<string[]>('exampleNames', DEFAULT_EXAMPLE_NAMES),
    severity
  }
}

async function readFileText(uri: vscode.Uri): Promise<string | null> {
  // Prefer the live (possibly dirty) buffer when the file is open.
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
  if (open) {
    return open.getText()
  }
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
  } catch {
    return null
  }
}

async function findSiblingExample(envUri: vscode.Uri, exampleNames: string[]): Promise<vscode.Uri | null> {
  const dir = vscode.Uri.joinPath(envUri, '..')
  for (const name of exampleNames) {
    const candidate = vscode.Uri.joinPath(dir, name)
    try {
      await vscode.workspace.fs.stat(candidate)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

function firstLineRange(document: vscode.TextDocument): vscode.Range {
  const end = document.lineCount > 0 ? document.lineAt(0).range.end : new vscode.Position(0, 0)
  return new vscode.Range(new vscode.Position(0, 0), end)
}

async function analyzeDocument(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const fileName = path.basename(document.uri.fsPath)
  if (document.uri.scheme !== 'file' || !isEnvFamilyFile(fileName)) {
    return
  }
  const config = readConfig()
  if (!config.enabled) {
    diagnostics.delete(document.uri)
    return
  }

  if (config.exampleNames.includes(fileName)) {
    await analyzeExample(document, diagnostics, config)
  } else {
    await analyzeEnv(document, diagnostics, config)
  }
}

async function analyzeEnv(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  config: EnvConfig
): Promise<void> {
  const exampleUri = await findSiblingExample(document.uri, config.exampleNames)
  if (!exampleUri) {
    diagnostics.delete(document.uri)
    return
  }
  const exampleText = await readFileText(exampleUri)
  if (exampleText === null) {
    diagnostics.delete(document.uri)
    return
  }

  const exampleName = path.basename(exampleUri.fsPath)
  const diff = diffEnv(document.getText(), exampleText)
  const result: vscode.Diagnostic[] = []

  if (diff.missing.length > 0) {
    const plural = diff.missing.length === 1 ? 'key' : 'keys'
    const diagnostic = new vscode.Diagnostic(
      firstLineRange(document),
      `Missing ${diff.missing.length} ${plural} from ${exampleName}: ${diff.missing.join(', ')}`,
      config.severity
    )
    diagnostic.source = 'toolkit-env'
    diagnostic.code = MISSING_CODE
    result.push(diagnostic)
  }

  for (const entry of diff.undeclared) {
    const line = document.lineAt(Math.min(entry.line, document.lineCount - 1))
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line.range.start, new vscode.Position(entry.line, entry.key.length)),
      `${entry.key} is not declared in ${exampleName}.`,
      vscode.DiagnosticSeverity.Hint
    )
    diagnostic.source = 'toolkit-env'
    result.push(diagnostic)
  }

  diagnostics.set(document.uri, result)
}

/** Diagnostics for the example file: keys its sibling .env has but it doesn't declare. */
async function analyzeExample(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  config: EnvConfig
): Promise<void> {
  const envUri = vscode.Uri.joinPath(document.uri, '..', '.env')
  const envText = await readFileText(envUri)
  if (envText === null) {
    diagnostics.delete(document.uri)
    return
  }

  // Same diff, reversed roles: what .env has that this example doesn't declare.
  const diff = diffEnv(document.getText(), envText)
  if (diff.missing.length === 0) {
    diagnostics.set(document.uri, [])
    return
  }
  const plural = diff.missing.length === 1 ? 'key is' : 'keys are'
  const diagnostic = new vscode.Diagnostic(
    firstLineRange(document),
    `${diff.missing.length} ${plural} present in .env but not declared here: ${diff.missing.join(', ')}`,
    config.severity
  )
  diagnostic.source = 'toolkit-env'
  diagnostics.set(document.uri, [diagnostic])
}

/** Quick fix: append the missing keys (with the example's placeholder values). */
class EnvCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    if (!context.diagnostics.some(d => d.code === MISSING_CODE)) {
      return []
    }
    const config = readConfig()
    const exampleUri = await findSiblingExample(document.uri, config.exampleNames)
    if (!exampleUri) {
      return []
    }
    const exampleText = await readFileText(exampleUri)
    if (exampleText === null) {
      return []
    }
    const diff = diffEnv(document.getText(), exampleText)
    if (diff.missing.length === 0) {
      return []
    }

    const exampleName = path.basename(exampleUri.fsPath)
    const action = new vscode.CodeAction(
      `Add ${diff.missing.length} missing key${diff.missing.length === 1 ? '' : 's'} from ${exampleName}`,
      vscode.CodeActionKind.QuickFix
    )
    const lines = buildMissingLines(exampleText, diff.missing)
    const endPosition = document.lineAt(document.lineCount - 1).range.end
    const needsNewline = document.lineCount > 0 && document.lineAt(document.lineCount - 1).text.length > 0
    const edit = new vscode.WorkspaceEdit()
    edit.insert(document.uri, endPosition, (needsNewline ? '\n' : '') + lines.join('\n') + '\n')
    action.edit = edit
    action.diagnostics = context.diagnostics.filter(d => d.code === MISSING_CODE)
    return [action]
  }
}

/** Palette command: check every .env / example pair in the workspace. */
async function checkWorkspace(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const config = readConfig()
  const envUris = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**')

  interface Finding {
    envUri: vscode.Uri
    missing: number
    undeclared: number
  }
  const findings: Finding[] = []
  let pairs = 0

  for (const uri of envUris) {
    const fileName = path.basename(uri.fsPath)
    if (!isEnvFamilyFile(fileName) || config.exampleNames.includes(fileName)) {
      continue
    }
    const exampleUri = await findSiblingExample(uri, config.exampleNames)
    if (!exampleUri) {
      continue
    }
    const [envText, exampleText] = await Promise.all([readFileText(uri), readFileText(exampleUri)])
    if (envText === null || exampleText === null) {
      continue
    }
    pairs++
    const diff = diffEnv(envText, exampleText)
    if (diff.missing.length > 0 || diff.undeclared.length > 0) {
      findings.push({ envUri: uri, missing: diff.missing.length, undeclared: diff.undeclared.length })
    }
  }

  if (pairs === 0) {
    vscode.window.showInformationMessage('Toolkit: no .env files with a matching example were found.')
    return
  }
  if (findings.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: all ${pairs} .env file(s) are in sync with their examples.`)
    return
  }

  const items = findings.map(f => ({
    label: vscode.workspace.asRelativePath(f.envUri),
    description: [
      f.missing > 0 ? `${f.missing} missing` : '',
      f.undeclared > 0 ? `${f.undeclared} undeclared` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    envUri: f.envUri
  }))
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${findings.length} .env file(s) out of sync — pick one to open`
  })
  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.envUri)
    await analyzeDocument(doc, diagnostics)
    await vscode.window.showTextDocument(doc)
  }
}

export function registerEnvCheckCommands(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('toolkit-env')

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(doc => void analyzeDocument(doc, diagnostics)),
    vscode.workspace.onDidSaveTextDocument(doc => void analyzeDocument(doc, diagnostics)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file', pattern: '**/.env*' },
      new EnvCodeActionProvider(),
      { providedCodeActionKinds: EnvCodeActionProvider.providedCodeActionKinds }
    ),
    vscode.commands.registerCommand('toolkit.envCheck.checkWorkspace', () => checkWorkspace(diagnostics))
  )

  // Cover documents that were already open when the extension activated.
  for (const doc of vscode.workspace.textDocuments) {
    void analyzeDocument(doc, diagnostics)
  }
}
