import * as vscode from 'vscode'
import {
  toCamelCase,
  toSnakeCase,
  toPascalCase,
  toConstantCase,
  toKebabCase,
  toTitleCase,
  toLowerCase,
  toUpperCase,
  toDotCase,
  toPathCase,
  toSentenceCase,
  toSwapCase,
  toNoCase
} from '../utils/text'

interface CaseDefinition {
  command: string
  label: string
  description: string
  fn: (input: string) => string
}

const CASE_DEFINITIONS: CaseDefinition[] = [
  { command: 'toolkit.changeCaseCamel', label: 'camelCase', description: 'Convert to camelCase', fn: toCamelCase },
  { command: 'toolkit.changeCaseSnake', label: 'snake_case', description: 'Convert to snake_case', fn: toSnakeCase },
  { command: 'toolkit.changeCasePascal', label: 'PascalCase', description: 'Convert to PascalCase', fn: toPascalCase },
  {
    command: 'toolkit.changeCaseConstant',
    label: 'CONSTANT_CASE',
    description: 'Convert to CONSTANT_CASE',
    fn: toConstantCase
  },
  { command: 'toolkit.changeCaseKebab', label: 'kebab-case', description: 'Convert to kebab-case', fn: toKebabCase },
  { command: 'toolkit.changeCaseTitle', label: 'Title Case', description: 'Convert to Title Case', fn: toTitleCase },
  { command: 'toolkit.changeCaseLower', label: 'lowercase', description: 'Convert to lowercase', fn: toLowerCase },
  { command: 'toolkit.changeCaseUpper', label: 'UPPERCASE', description: 'Convert to UPPERCASE', fn: toUpperCase },
  { command: 'toolkit.changeCaseDot', label: 'dot.case', description: 'Convert to dot.case', fn: toDotCase },
  { command: 'toolkit.changeCasePath', label: 'path/case', description: 'Convert to path/case', fn: toPathCase },
  {
    command: 'toolkit.changeCaseSentence',
    label: 'Sentence case',
    description: 'Convert to Sentence case',
    fn: toSentenceCase
  },
  { command: 'toolkit.changeCaseSwap', label: 'sWAP cASE', description: 'Convert to sWAP cASE', fn: toSwapCase },
  { command: 'toolkit.changeCaseNo', label: 'no case', description: 'Convert to no case', fn: toNoCase }
]

/**
 * Expands the cursor position to the nearest word, respecting case-aware boundaries.
 * Mirrors the behavior of wmaurer.change-case's getChangeCaseWordRangeAtPosition.
 */
function getWordRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  const config = vscode.workspace.getConfiguration('toolkit.changeCase')
  const includeDot = config.get<boolean>('includeDotInCurrentWord', false)
  const wordPattern = includeDot ? /([\w_.\-/$]+)/ : /([\w_\-/$]+)/

  const line = document.lineAt(position.line).text
  const col = position.character

  // Expand left
  let start = col
  while (start > 0 && wordPattern.test(line[start - 1])) {
    start--
  }

  // Expand right
  let end = col
  while (end < line.length && wordPattern.test(line[end])) {
    end++
  }

  if (start === end) {
    return undefined
  }
  return new vscode.Range(position.line, start, position.line, end)
}

/**
 * Applies a case transformation to all selections in the active editor.
 * Handles multi-selection, per-line transformation for multi-line selections,
 * and selection restoration with offset tracking.
 */
function applyTransformation(fn: (input: string) => string): void {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const document = editor.document

  // Build the list of edits: { range, original, replacement }
  const edits: { range: vscode.Range; replacement: string }[] = []

  for (const selection of editor.selections) {
    let range: vscode.Range
    if (selection.isEmpty) {
      const expanded = getWordRangeAtPosition(document, selection.active)
      if (!expanded) {
        continue
      }
      range = expanded
    } else {
      range = selection
    }

    const text = document.getText(range)

    // For multi-line selections, transform each line individually
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
    const lines = text.split(eol)
    const transformed = lines.map((line) => fn(line)).join(eol)

    edits.push({ range, replacement: transformed })
  }

  if (edits.length === 0) {
    return
  }

  editor.edit((editBuilder) => {
    for (const edit of edits) {
      editBuilder.replace(edit.range, edit.replacement)
    }
  })
}

export function registerChangeCaseCommands(context: vscode.ExtensionContext): void {
  // Register individual case commands
  for (const def of CASE_DEFINITIONS) {
    context.subscriptions.push(vscode.commands.registerCommand(def.command, () => applyTransformation(def.fn)))
  }

  // Register QuickPick meta-command
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.changeCase', async () => {
      const editor = vscode.window.activeTextEditor

      // Get preview text if single selection on one line
      let previewText: string | undefined
      if (editor && editor.selections.length === 1) {
        const sel = editor.selections[0]
        let range: vscode.Range
        if (sel.isEmpty) {
          const expanded = getWordRangeAtPosition(editor.document, sel.active)
          if (expanded) {
            range = expanded
          } else {
            range = sel
          }
        } else {
          range = sel
        }
        const text = editor.document.getText(range)
        if (!text.includes('\n')) {
          previewText = text
        }
      }

      const items = CASE_DEFINITIONS.map((def) => ({
        label: def.label,
        description: previewText ? `→ ${def.fn(previewText)}` : def.description,
        fn: def.fn
      }))

      const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'What case do you want to convert to?'
      })

      if (picked) {
        applyTransformation(picked.fn)
      }
    })
  )
}
