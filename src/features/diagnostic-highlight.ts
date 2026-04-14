import * as vscode from 'vscode'

const DEFAULT_COLORS: Record<string, { background: string; border: string; ruler: string }> = {
  hint: {
    background: 'rgba(78, 201, 176, 0.12)',
    border: '#4EC9B0',
    ruler: '#4EC9B0'
  },
  info: {
    background: 'rgba(55, 148, 255, 0.12)',
    border: '#3794FF',
    ruler: '#3794FF'
  },
  warning: {
    background: 'rgba(204, 167, 0, 0.12)',
    border: '#CCA700',
    ruler: '#CCA700'
  }
}

let enabled = true
let decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map()
let debounceTimer: ReturnType<typeof setTimeout> | undefined

export function registerDiagnosticHighlightCommands(context: vscode.ExtensionContext): void {
  enabled = getConfig().get<boolean>('enabled', true)

  createDecorationTypes()

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.toggleDiagnosticHighlight', () => {
      enabled = !enabled
      if (enabled) {
        updateAllVisibleEditors()
      } else {
        clearAllDecorations()
      }
      vscode.window.showInformationMessage(`Diagnostic Highlight: ${enabled ? 'ON' : 'OFF'}`)
    }),

    vscode.languages.onDidChangeDiagnostics(() => {
      if (enabled) {
        debounceUpdate()
      }
    }),

    vscode.window.onDidChangeActiveTextEditor(() => {
      if (enabled) {
        debounceUpdate()
      }
    }),

    vscode.window.onDidChangeVisibleTextEditors(() => {
      if (enabled) {
        debounceUpdate()
      }
    }),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('toolkit.diagnosticHighlight')) {
        enabled = getConfig().get<boolean>('enabled', true)
        disposeDecorationTypes()
        createDecorationTypes()
        if (enabled) {
          updateAllVisibleEditors()
        } else {
          clearAllDecorations()
        }
      }
    }),

    { dispose: () => disposeDecorationTypes() }
  )

  // Initial application
  if (enabled) {
    updateAllVisibleEditors()
  }
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('toolkit.diagnosticHighlight')
}

function createDecorationTypes(): void {
  const config = getConfig()

  const styles: Record<string, string> = {
    hint: 'dotted',
    info: 'dashed',
    warning: 'solid'
  }

  for (const severity of ['hint', 'info', 'warning'] as const) {
    const defaults = DEFAULT_COLORS[severity]
    const color = config.get<string>(`${severity}Color`, defaults.border)

    decorationTypes.set(
      severity,
      vscode.window.createTextEditorDecorationType({
        borderWidth: '0 0 2px 0',
        borderStyle: `none none ${styles[severity]} none`,
        borderColor: color,
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Right
      })
    )
  }
}

function disposeDecorationTypes(): void {
  for (const dt of decorationTypes.values()) {
    dt.dispose()
  }
  decorationTypes.clear()
}

function debounceUpdate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => updateAllVisibleEditors(), 200)
}

function updateAllVisibleEditors(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateEditor(editor)
  }
}

function clearAllDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    for (const dt of decorationTypes.values()) {
      editor.setDecorations(dt, [])
    }
  }
}

function updateEditor(editor: vscode.TextEditor): void {
  const config = getConfig()
  const highlightHints = config.get<boolean>('highlightHints', true)
  const highlightInfo = config.get<boolean>('highlightInfo', true)
  const highlightWarnings = config.get<boolean>('highlightWarnings', false)

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)

  const hintDecorations: vscode.DecorationOptions[] = []
  const infoDecorations: vscode.DecorationOptions[] = []
  const warningDecorations: vscode.DecorationOptions[] = []

  for (const diag of diagnostics) {
    const hover = buildHover(diag)
    const lineDecorations = splitRangePerLine(editor, diag.range, hover)

    switch (diag.severity) {
      case vscode.DiagnosticSeverity.Hint:
        if (highlightHints) {
          hintDecorations.push(...lineDecorations)
        }
        break
      case vscode.DiagnosticSeverity.Information:
        if (highlightInfo) {
          infoDecorations.push(...lineDecorations)
        }
        break
      case vscode.DiagnosticSeverity.Warning:
        if (highlightWarnings) {
          warningDecorations.push(...lineDecorations)
        }
        break
    }
  }

  const hintDt = decorationTypes.get('hint')
  const infoDt = decorationTypes.get('info')
  const warningDt = decorationTypes.get('warning')

  if (hintDt) editor.setDecorations(hintDt, hintDecorations)
  if (infoDt) editor.setDecorations(infoDt, infoDecorations)
  if (warningDt) editor.setDecorations(warningDt, warningDecorations)
}

function splitRangePerLine(
  editor: vscode.TextEditor,
  range: vscode.Range,
  hover: vscode.MarkdownString
): vscode.DecorationOptions[] {
  const doc = editor.document
  const startLine = range.start.line
  const endLine = range.end.line

  // Single-line range — use as-is
  if (startLine === endLine) {
    return [{ range, hoverMessage: hover }]
  }

  // Multi-line: create one decoration per line covering only the text
  const decorations: vscode.DecorationOptions[] = []
  for (let line = startLine; line <= endLine; line++) {
    const textLine = doc.lineAt(line)
    if (textLine.isEmptyOrWhitespace) continue

    const lineStart = line === startLine
      ? range.start
      : new vscode.Position(line, textLine.firstNonWhitespaceCharacterIndex)
    const lineEnd = line === endLine
      ? range.end
      : textLine.range.end

    decorations.push({
      range: new vscode.Range(lineStart, lineEnd),
      hoverMessage: hover
    })
  }
  return decorations
}

function buildHover(diag: vscode.Diagnostic): vscode.MarkdownString {
  const md = new vscode.MarkdownString()
  md.isTrusted = true

  const severityLabel = getSeverityLabel(diag.severity)
  const source = diag.source ? ` [${diag.source}]` : ''
  const code = diag.code
    ? typeof diag.code === 'object'
      ? ` (${diag.code.value})`
      : ` (${diag.code})`
    : ''

  md.appendMarkdown(`**${severityLabel}**${source}${code}\n\n`)
  md.appendMarkdown(diag.message)

  return md
}

function getSeverityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Hint: return 'Hint'
    case vscode.DiagnosticSeverity.Information: return 'Information'
    case vscode.DiagnosticSeverity.Warning: return 'Warning'
    case vscode.DiagnosticSeverity.Error: return 'Error'
  }
}
