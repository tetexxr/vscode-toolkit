import * as vscode from 'vscode'
import { DEFAULT_DELIMITERS, detectDelimiter, parseCsvLine } from './csv-rainbow-utils'
import { color } from '../../utils/palette'

// Rainbow palette for CSV/TSV columns. The first seven come from the shared
// One Dark token set; the last three extend it with extra distinct hues.
const DEFAULT_COLORS = [
  color.error,
  color.warning,
  color.success,
  color.cyan,
  color.info,
  color.special,
  color.orange,
  '#ABB2BF',
  '#BE5046',
  '#3E82C0'
]

const SUPPORTED_EXTENSIONS = ['.csv', '.tsv']

let enabled = true
let decorationTypes: vscode.TextEditorDecorationType[] = []
let debounceTimer: ReturnType<typeof setTimeout> | undefined

export function registerCsvRainbowCommands(context: vscode.ExtensionContext): void {
  enabled = getConfig().get<boolean>('enabled', true)
  createDecorationTypes()

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.toggleCsvRainbow', () => {
      enabled = !enabled
      if (enabled) {
        updateAllVisibleEditors()
      } else {
        clearAllDecorations()
      }
      vscode.window.showInformationMessage(`CSV Rainbow: ${enabled ? 'ON' : 'OFF'}`)
    }),

    vscode.window.onDidChangeActiveTextEditor(() => {
      if (enabled) debounceUpdate()
    }),

    vscode.window.onDidChangeVisibleTextEditors(() => {
      if (enabled) debounceUpdate()
    }),

    vscode.workspace.onDidChangeTextDocument(e => {
      if (!enabled) return
      if (!isCsvDocument(e.document)) return
      debounceUpdate()
    }),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('toolkit.csvRainbow')) return
      enabled = getConfig().get<boolean>('enabled', true)
      disposeDecorationTypes()
      createDecorationTypes()
      if (enabled) {
        updateAllVisibleEditors()
      } else {
        clearAllDecorations()
      }
    }),

    {
      dispose: () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        disposeDecorationTypes()
      }
    }
  )

  if (enabled) {
    updateAllVisibleEditors()
  }
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('toolkit.csvRainbow')
}

function createDecorationTypes(): void {
  const colors = getConfig().get<string[]>('colors', DEFAULT_COLORS)
  const palette = colors.length > 0 ? colors : DEFAULT_COLORS
  decorationTypes = palette.map(color => vscode.window.createTextEditorDecorationType({ color }))
}

function disposeDecorationTypes(): void {
  for (const dt of decorationTypes) {
    dt.dispose()
  }
  decorationTypes = []
}

function debounceUpdate(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => updateAllVisibleEditors(), 150)
}

function updateAllVisibleEditors(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateEditor(editor)
  }
}

function clearAllDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    for (const dt of decorationTypes) {
      editor.setDecorations(dt, [])
    }
  }
}

function isCsvDocument(doc: vscode.TextDocument): boolean {
  const path = doc.uri.path.toLowerCase()
  return SUPPORTED_EXTENSIONS.some(ext => path.endsWith(ext))
}

function updateEditor(editor: vscode.TextEditor): void {
  const doc = editor.document
  if (!isCsvDocument(doc)) {
    for (const dt of decorationTypes) {
      editor.setDecorations(dt, [])
    }
    return
  }

  const config = getConfig()
  const maxLines = config.get<number>('maxLines', 5000)
  const customDelimiters = config.get<string[]>('delimiters', DEFAULT_DELIMITERS)
  const delimiters = customDelimiters.length > 0 ? customDelimiters : DEFAULT_DELIMITERS

  const lineCount = Math.min(doc.lineCount, maxLines)
  const sampleEnd = Math.min(doc.lineCount, 20)
  const sample: string[] = []
  for (let i = 0; i < sampleEnd; i++) {
    sample.push(doc.lineAt(i).text)
  }
  const delimiter = doc.uri.path.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(sample.join('\n'), delimiters)

  const headers = parseHeaders(doc, delimiter)

  const buckets: vscode.DecorationOptions[][] = decorationTypes.map(() => [])

  for (let line = 0; line < lineCount; line++) {
    const text = doc.lineAt(line).text
    if (text.length === 0) continue
    const fields = parseCsvLine(text, delimiter)
    for (const field of fields) {
      if (field.start === field.end) continue
      const bucketIndex = field.index % decorationTypes.length
      const range = new vscode.Range(line, field.start, line, field.end)
      buckets[bucketIndex].push({
        range,
        hoverMessage: buildHover(field.index, headers)
      })
    }
  }

  for (let i = 0; i < decorationTypes.length; i++) {
    editor.setDecorations(decorationTypes[i], buckets[i])
  }
}

function parseHeaders(doc: vscode.TextDocument, delimiter: string): string[] {
  if (doc.lineCount === 0) return []
  const firstLine = doc.lineAt(0).text
  if (firstLine.length === 0) return []
  return parseCsvLine(firstLine, delimiter).map(f =>
    firstLine.slice(f.start, f.end).replace(/^"|"$/g, '').replace(/""/g, '"')
  )
}

function buildHover(columnIndex: number, headers: string[]): vscode.MarkdownString {
  const md = new vscode.MarkdownString()
  const header = headers[columnIndex]
  if (header) {
    md.appendMarkdown(`**Column ${columnIndex + 1}**: ${escapeMarkdown(header)}`)
  } else {
    md.appendMarkdown(`**Column ${columnIndex + 1}**`)
  }
  return md
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+\-.!|]/g, m => `\\${m}`)
}
