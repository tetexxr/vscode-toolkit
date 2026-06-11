import * as vscode from 'vscode'
import { findTableBlocks, formatTable, tableBlockAtLine } from './markdown-table-utils'

/**
 * Markdown table formatter — aligns the pipes of the table under the cursor
 * (or every table inside the selection), honoring GFM alignment markers.
 */

async function formatMarkdownTable(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const document = editor.document
  const allLines = Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text)

  // Selection → every table touching it; empty selection → table at cursor.
  let blocks = findTableBlocks(allLines)
  if (editor.selection.isEmpty) {
    const block = tableBlockAtLine(allLines, editor.selection.active.line)
    blocks = block ? [block] : []
  } else {
    const startLine = editor.selection.start.line
    const endLine = editor.selection.end.line
    blocks = blocks.filter(b => b.start <= endLine && b.end >= startLine)
  }

  if (blocks.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no Markdown table found at the cursor or selection.')
    return
  }

  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  await editor.edit(builder => {
    for (const block of blocks) {
      const formatted = formatTable(allLines.slice(block.start, block.end + 1))
      const range = new vscode.Range(block.start, 0, block.end, allLines[block.end].length)
      builder.replace(range, formatted.join(eol))
    }
  })
}

export function registerMarkdownTableCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.markdown.formatTable', () => formatMarkdownTable())
  )
}
