import * as vscode from 'vscode'
import { findTypeOnlyImports, type TypeOnlyImportFinding } from './type-only-imports-utils'

const DIAGNOSTIC_SOURCE = 'toolkit'
const DIAGNOSTIC_CODE = 'type-only-import'
const SUPPORTED_LANGS = ['typescript', 'typescriptreact']

let diagnostics: vscode.DiagnosticCollection
let output: vscode.OutputChannel
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function registerTypeOnlyImportsCommands(context: vscode.ExtensionContext): void {
  try {
    diagnostics = vscode.languages.createDiagnosticCollection('toolkit.typeOnlyImports')
    output = vscode.window.createOutputChannel('Toolkit: Type-Only Imports')
    context.subscriptions.push(diagnostics, output)
  } catch (err) {
    // If even diagnostic/output creation fails, abort silently — don't block activation.
    console.error('[toolkit.typeOnlyImports] failed to bootstrap:', err)
    return
  }

  log(`activated. supported langs: ${SUPPORTED_LANGS.join(', ')}; enabled=${isEnabled()}; severity=${getSeverity()}`)

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => analyzeDocument(doc)),
    vscode.workspace.onDidChangeTextDocument(e => scheduleAnalyze(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnostics.delete(doc.uri)
      clearDebounce(doc.uri.toString())
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('toolkit.typeOnlyImports')) {
        log(`config changed; reanalyzing all open docs`)
        analyzeAllOpen()
      }
    }),
    vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGS, new TypeOnlyImportsCodeActionProvider(), {
      providedCodeActionKinds: TypeOnlyImportsCodeActionProvider.providedCodeActionKinds
    }),
    vscode.commands.registerCommand(
      'toolkit.convertToTypeOnlyImport',
      async (uri: vscode.Uri, edit: { start: number; end: number; text: string }) => {
        const doc = await vscode.workspace.openTextDocument(uri)
        const wsEdit = new vscode.WorkspaceEdit()
        const range = new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end))
        wsEdit.replace(uri, range, edit.text)
        await vscode.workspace.applyEdit(wsEdit)
      }
    ),
    vscode.commands.registerCommand('toolkit.typeOnlyImports.analyzeCurrentFile', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showInformationMessage('No active editor.')
        return
      }
      const doc = editor.document
      log(`manual analyze: ${doc.uri.fsPath} (lang=${doc.languageId})`)
      const findings = analyzeDocument(doc, /* verbose */ true)
      vscode.window.showInformationMessage(
        `Type-only imports: ${findings} finding${findings === 1 ? '' : 's'} (lang=${doc.languageId}, enabled=${isEnabled()}, severity=${vscode.DiagnosticSeverity[getSeverity()]}). See "Toolkit: Type-Only Imports" output channel for details.`
      )
    })
  )

  // Defer initial scan so activate() returns immediately, even if many TS
  // files are already open. Each doc is analyzed on its own microtask.
  setImmediate(() => {
    try {
      analyzeAllOpenDeferred()
    } catch (err) {
      log(`error during deferred initial scan: ${(err as Error).message}`)
    }
  })
}

function analyzeAllOpenDeferred(): void {
  const docs = vscode.workspace.textDocuments.slice()
  log(`deferred initial scan: ${docs.length} open docs`)
  let i = 0
  const tick = (): void => {
    if (i >= docs.length) {
      log(`deferred initial scan: done`)
      return
    }
    const doc = docs[i++]
    try {
      analyzeDocument(doc)
    } catch (err) {
      log(`error analyzing ${doc.uri.fsPath}: ${(err as Error).message}`)
    }
    setImmediate(tick)
  }
  tick()
}

function log(msg: string): void {
  if (output) output.appendLine(`[${new Date().toISOString()}] ${msg}`)
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('toolkit.typeOnlyImports')
}

function isEnabled(): boolean {
  return getConfig().get<boolean>('enabled', true)
}

function getSeverity(): vscode.DiagnosticSeverity {
  const raw = getConfig().get<string>('severity', 'hint')
  switch (raw) {
    case 'error':
      return vscode.DiagnosticSeverity.Error
    case 'warning':
      return vscode.DiagnosticSeverity.Warning
    case 'information':
      return vscode.DiagnosticSeverity.Information
    default:
      return vscode.DiagnosticSeverity.Hint
  }
}

function getIgnoredModules(): string[] {
  const value = getConfig().get<unknown>('ignoredModules', ['vscode'])
  if (!Array.isArray(value)) return ['vscode']
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function analyzeAllOpen(): void {
  diagnostics.clear()
  if (!isEnabled()) return
  for (const doc of vscode.workspace.textDocuments) {
    analyzeDocument(doc)
  }
}

function scheduleAnalyze(doc: vscode.TextDocument): void {
  const key = doc.uri.toString()
  clearDebounce(key)
  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    analyzeDocument(doc)
  }, 250)
  debounceTimers.set(key, timer)
}

function clearDebounce(key: string): void {
  const existing = debounceTimers.get(key)
  if (existing) {
    clearTimeout(existing)
    debounceTimers.delete(key)
  }
}

function analyzeDocument(doc: vscode.TextDocument, verbose = false): number {
  if (!SUPPORTED_LANGS.includes(doc.languageId)) {
    if (verbose) log(`skip: unsupported language '${doc.languageId}' for ${doc.uri.fsPath}`)
    diagnostics.delete(doc.uri)
    return 0
  }
  if (!isEnabled()) {
    if (verbose) log(`skip: feature disabled`)
    diagnostics.delete(doc.uri)
    return 0
  }

  let findings: TypeOnlyImportFinding[]
  try {
    findings = findTypeOnlyImports(doc.getText(), doc.uri.fsPath, {
      ignoredModules: getIgnoredModules()
    })
  } catch (err) {
    log(`error analyzing ${doc.uri.fsPath}: ${(err as Error).message}`)
    diagnostics.delete(doc.uri)
    return 0
  }

  if (verbose) {
    log(`findings for ${doc.uri.fsPath}: ${findings.length}`)
    for (const f of findings) {
      log(`  → ${f.moduleSpecifier} :: ${JSON.stringify(f.fixedText)}`)
    }
  }

  const severity = getSeverity()
  const out: vscode.Diagnostic[] = findings.map(f => {
    const range = new vscode.Range(doc.positionAt(f.keywordStart), doc.positionAt(f.keywordEnd))
    const diag = new vscode.Diagnostic(range, buildDiagnosticMessage(f), severity)
    diag.source = DIAGNOSTIC_SOURCE
    diag.code = DIAGNOSTIC_CODE
    return diag
  })

  diagnostics.set(doc.uri, out)
  return findings.length
}

function buildDiagnosticMessage(f: TypeOnlyImportFinding): string {
  if (f.kind === 'named-specifier' && f.bindingName) {
    return `\`${f.bindingName}\` is only used as a type. Mark this import with \`type\`.`
  }
  return f.moduleSpecifier
    ? `Import from '${f.moduleSpecifier}' is only used as a type. Convert to \`import type\`.`
    : 'Import is only used as a type. Convert to `import type`.'
}

class TypeOnlyImportsCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const ourDiagnostics = context.diagnostics.filter(d => d.source === DIAGNOSTIC_SOURCE && d.code === DIAGNOSTIC_CODE)
    if (ourDiagnostics.length === 0) return []

    // Re-analyze to recover the rewrites. Cheap enough for a single file on demand.
    let findings: TypeOnlyImportFinding[]
    try {
      findings = findTypeOnlyImports(document.getText(), document.uri.fsPath, {
        ignoredModules: getIgnoredModules()
      })
    } catch {
      return []
    }
    if (findings.length === 0) return []

    const actions: vscode.CodeAction[] = []

    for (const diag of ourDiagnostics) {
      const keywordOffset = document.offsetAt(diag.range.start)
      const finding = findings.find(f => f.keywordStart === keywordOffset)
      if (!finding) continue

      const action = new vscode.CodeAction(buildCodeActionTitle(finding), vscode.CodeActionKind.QuickFix)
      action.edit = new vscode.WorkspaceEdit()
      action.edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(finding.start), document.positionAt(finding.end)),
        finding.fixedText
      )
      action.diagnostics = [diag]
      action.isPreferred = true
      actions.push(action)
    }

    // Bulk fix: convert all
    if (findings.length > 1) {
      const allAction = new vscode.CodeAction(
        `Convert all ${findings.length} type-only imports in file`,
        vscode.CodeActionKind.QuickFix
      )
      allAction.edit = new vscode.WorkspaceEdit()
      // Apply from the END so offsets stay valid.
      const sorted = [...findings].sort((a, b) => b.start - a.start)
      for (const f of sorted) {
        allAction.edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(f.start), document.positionAt(f.end)),
          f.fixedText
        )
      }
      actions.push(allAction)
    }

    return actions
  }
}

function buildCodeActionTitle(f: TypeOnlyImportFinding): string {
  if (f.kind === 'named-specifier' && f.bindingName) {
    return `Mark \`${f.bindingName}\` as type-only import`
  }
  return 'Convert to type-only import'
}
