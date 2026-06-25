import * as vscode from 'vscode'
import { alignLines, resolveSpacing } from './align-utils'

interface DelimiterPreset {
  command: string
  delimiter: string
  label: string
  description: string
}

const PRESETS: DelimiterPreset[] = [
  { command: 'toolkit.align.equals', delimiter: '=', label: '=', description: 'Assignment' },
  { command: 'toolkit.align.colon', delimiter: ':', label: ':', description: 'Object key / type annotation' },
  { command: 'toolkit.align.comma', delimiter: ',', label: ',', description: 'Comma' },
  { command: 'toolkit.align.arrow', delimiter: '=>', label: '=>', description: 'Arrow function' },
  { command: 'toolkit.align.lineComment', delimiter: '//', label: '//', description: 'Line comment' },
  { command: 'toolkit.align.hash', delimiter: '#', label: '#', description: 'Hash comment (shell, scripts)' }
]

interface LineBlock {
  range: vscode.Range
  lines: string[]
}

function getLineBlocks(editor: vscode.TextEditor): LineBlock[] {
  const document = editor.document
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
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
    if (endLine === startLine) {
      continue
    }
    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
    const text = document.getText(range)
    blocks.push({ range, lines: text.split(eol) })
  }
  return blocks
}

async function applyAlignment(delimiter: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  if (!delimiter) {
    return
  }

  const blocks = getLineBlocks(editor)
  if (blocks.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select two or more lines to align.')
    return
  }

  const document = editor.document
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'

  const config = vscode.workspace.getConfiguration('toolkit.align')
  const spacesBeforeMap = config.get<Record<string, number>>('spacesBefore')
  const spacesAfterMap = config.get<Record<string, number>>('spacesAfter')
  const spacesBefore = resolveSpacing(spacesBeforeMap, delimiter, 1)
  const spacesAfter = resolveSpacing(spacesAfterMap, delimiter, 1)

  let changed = 0
  await editor.edit(builder => {
    for (const block of blocks) {
      const aligned = alignLines(block.lines, delimiter, { spacesBefore, spacesAfter })
      const replacement = aligned.join(eol)
      const original = block.lines.join(eol)
      if (replacement !== original) {
        builder.replace(block.range, replacement)
        changed++
      }
    }
  })

  if (changed === 0) {
    vscode.window.showInformationMessage(`Toolkit: nothing to align (need two or more lines containing "${delimiter}").`)
  }
}

async function promptForDelimiter(): Promise<string | undefined> {
  type PickItem = vscode.QuickPickItem & { delimiter?: string; isCustom?: boolean }
  const items: PickItem[] = PRESETS.map(p => ({
    label: p.label,
    description: p.description,
    delimiter: p.delimiter
  }))
  items.push({ label: '$(edit) Other...', description: 'Type a custom delimiter', isCustom: true })

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Align by which delimiter?' })
  if (!picked) {
    return undefined
  }
  if (picked.isCustom) {
    return await promptCustomDelimiter()
  }
  return picked.delimiter
}

function promptCustomDelimiter(): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Enter the delimiter to align by',
    placeHolder: 'e.g. =, :, =>, //, |',
    validateInput: value => (value.length === 0 ? 'Delimiter cannot be empty' : null)
  })
}

export function registerAlignCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.align', async () => {
      const delimiter = await promptForDelimiter()
      if (delimiter) {
        await applyAlignment(delimiter)
      }
    })
  )

  for (const preset of PRESETS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(preset.command, async () => {
        await applyAlignment(preset.delimiter)
      })
    )
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.align.custom', async () => {
      const delimiter = await promptCustomDelimiter()
      if (delimiter) {
        await applyAlignment(delimiter)
      }
    })
  )
}
