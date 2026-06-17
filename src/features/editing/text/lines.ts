import * as vscode from 'vscode'
import {
  sortLines,
  sortLinesByLength,
  sortLinesNumerically,
  reverseLines,
  shuffleLines,
  removeDuplicateLines,
  removeEmptyLines,
  trimTrailingWhitespace,
  type LineOperation
} from './lines-utils'

interface LineOperationDefinition {
  command: string
  label: string
  description: string
  fn: LineOperation
}

function getOperationDefinitions(): LineOperationDefinition[] {
  const config = vscode.workspace.getConfiguration('toolkit.lines')
  const natural = config.get<boolean>('naturalSort', true)
  const dedupeKeepLast = config.get<boolean>('dedupeKeepLast', false)

  return [
    {
      command: 'toolkit.lines.sortAsc',
      label: 'Sort Ascending',
      description: 'A → Z (case-sensitive)',
      fn: lines => sortLines(lines, { caseSensitive: true, natural, descending: false })
    },
    {
      command: 'toolkit.lines.sortDesc',
      label: 'Sort Descending',
      description: 'Z → A (case-sensitive)',
      fn: lines => sortLines(lines, { caseSensitive: true, natural, descending: true })
    },
    {
      command: 'toolkit.lines.sortAscCaseInsensitive',
      label: 'Sort Ascending (Case-Insensitive)',
      description: 'A → Z ignoring case',
      fn: lines => sortLines(lines, { caseSensitive: false, natural, descending: false })
    },
    {
      command: 'toolkit.lines.sortDescCaseInsensitive',
      label: 'Sort Descending (Case-Insensitive)',
      description: 'Z → A ignoring case',
      fn: lines => sortLines(lines, { caseSensitive: false, natural, descending: true })
    },
    {
      command: 'toolkit.lines.sortByLength',
      label: 'Sort by Length',
      description: 'Shorter → longer',
      fn: lines => sortLinesByLength(lines, false)
    },
    {
      command: 'toolkit.lines.sortByLengthDesc',
      label: 'Sort by Length (Descending)',
      description: 'Longer → shorter',
      fn: lines => sortLinesByLength(lines, true)
    },
    {
      command: 'toolkit.lines.sortNumerically',
      label: 'Sort Numerically',
      description: 'Sort by the first number on each line',
      fn: lines => sortLinesNumerically(lines, false)
    },
    {
      command: 'toolkit.lines.reverse',
      label: 'Reverse',
      description: 'Reverse the line order',
      fn: reverseLines
    },
    {
      command: 'toolkit.lines.shuffle',
      label: 'Shuffle',
      description: 'Randomize the line order',
      fn: lines => shuffleLines(lines)
    },
    {
      command: 'toolkit.lines.removeDuplicates',
      label: 'Remove Duplicate Lines',
      description: 'Keep only the first (or last) occurrence',
      fn: lines => removeDuplicateLines(lines, { keepLast: dedupeKeepLast })
    },
    {
      command: 'toolkit.lines.removeDuplicatesCaseInsensitive',
      label: 'Remove Duplicate Lines (Case-Insensitive)',
      description: 'Dedupe ignoring case',
      fn: lines => removeDuplicateLines(lines, { caseSensitive: false, keepLast: dedupeKeepLast })
    },
    {
      command: 'toolkit.lines.removeEmpty',
      label: 'Remove Empty Lines',
      description: 'Drop blank and whitespace-only lines',
      fn: removeEmptyLines
    },
    {
      command: 'toolkit.lines.trimTrailingWhitespace',
      label: 'Trim Trailing Whitespace',
      description: 'Trim trailing spaces and tabs on each line',
      fn: trimTrailingWhitespace
    }
  ]
}

interface LineBlock {
  range: vscode.Range
  lines: string[]
  trailingNewline: boolean
}

function getLineBlocks(editor: vscode.TextEditor): LineBlock[] {
  const document = editor.document
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const useWholeDocument = editor.selections.every(s => s.isEmpty)

  if (useWholeDocument) {
    const lastLine = document.lineCount - 1
    const fullRange = new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length)
    const text = document.getText(fullRange)
    const trailingNewline = text.endsWith(eol)
    const body = trailingNewline ? text.slice(0, -eol.length) : text
    return [
      {
        range: fullRange,
        lines: body.split(eol),
        trailingNewline
      }
    ]
  }

  const blocks: LineBlock[] = []
  for (const selection of editor.selections) {
    if (selection.isEmpty) {
      continue
    }
    const startLine = selection.start.line
    const endLine =
      selection.end.character === 0 && selection.end.line > selection.start.line
        ? selection.end.line - 1
        : selection.end.line
    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
    const text = document.getText(range)
    blocks.push({
      range,
      lines: text.split(eol),
      trailingNewline: false
    })
  }
  return blocks
}

async function applyOperation(fn: LineOperation): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const document = editor.document
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const blocks = getLineBlocks(editor)

  if (blocks.length === 0 || blocks.every(b => b.lines.length <= 1)) {
    vscode.window.showInformationMessage('Toolkit: nothing to transform (need at least 2 lines).')
    return
  }

  await editor.edit(builder => {
    for (const block of blocks) {
      const transformed = fn(block.lines)
      const replacement = transformed.join(eol) + (block.trailingNewline ? eol : '')
      builder.replace(block.range, replacement)
    }
  })
}

export function registerLinesCommands(context: vscode.ExtensionContext): void {
  // Register each operation as an individual command. Definitions are rebuilt
  // on each invocation so configuration changes take effect immediately.
  const commandIds = getOperationDefinitions().map(def => def.command)
  for (const command of commandIds) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        const def = getOperationDefinitions().find(d => d.command === command)
        if (def) {
          await applyOperation(def.fn)
        }
      })
    )
  }

  // Dispatcher quick pick
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.lines', async () => {
      const definitions = getOperationDefinitions()
      const items = definitions.map(def => ({
        label: def.label,
        description: def.description,
        fn: def.fn
      }))
      const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'Pick a line operation'
      })
      if (picked) {
        await applyOperation(picked.fn)
      }
    })
  )
}
