import * as vscode from 'vscode'
import {
  convertQuote,
  findStringAt,
  nextQuote,
  TemplateInterpolationError,
  type QuoteChar
} from './toggle-quotes-utils'

interface PendingEdit {
  range: vscode.Range
  replacement: string
}

function buildEditsForSelection(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  targetQuote: QuoteChar | undefined
): { edit: PendingEdit | null; warning: string | null } {
  const position = selection.active
  const line = document.lineAt(position.line).text
  const found = findStringAt(line, position.character)
  if (!found) {
    return { edit: null, warning: null }
  }

  const { start, end, quote: from } = found
  const to = targetQuote ?? nextQuote(from)
  if (from === to) {
    return { edit: null, warning: null }
  }

  const content = line.substring(start + 1, end)
  try {
    const converted = convertQuote(content, from, to)
    const range = new vscode.Range(position.line, start, position.line, end + 1)
    return { edit: { range, replacement: to + converted + to }, warning: null }
  } catch (error) {
    if (error instanceof TemplateInterpolationError) {
      return { edit: null, warning: error.message }
    }
    throw error
  }
}

async function applyToggle(targetQuote?: QuoteChar): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const edits: PendingEdit[] = []
  const warnings = new Set<string>()
  for (const selection of editor.selections) {
    const result = buildEditsForSelection(editor.document, selection, targetQuote)
    if (result.edit) {
      edits.push(result.edit)
    }
    if (result.warning) {
      warnings.add(result.warning)
    }
  }

  if (edits.length === 0) {
    if (warnings.size > 0) {
      vscode.window.showWarningMessage('Toolkit: ' + [...warnings].join(' '))
    } else {
      vscode.window.showInformationMessage('Toolkit: no string under cursor.')
    }
    return
  }

  await editor.edit(builder => {
    for (const e of edits) {
      builder.replace(e.range, e.replacement)
    }
  })

  if (warnings.size > 0) {
    vscode.window.showWarningMessage('Toolkit: ' + [...warnings].join(' '))
  }
}

export function registerToggleQuotesCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.toggleQuotes', () => applyToggle()),
    vscode.commands.registerCommand('toolkit.quoteAsSingle', () => applyToggle("'")),
    vscode.commands.registerCommand('toolkit.quoteAsDouble', () => applyToggle('"')),
    vscode.commands.registerCommand('toolkit.quoteAsBacktick', () => applyToggle('`'))
  )
}
