import * as vscode from 'vscode'
import { buildTocBlock, findTocBlock, generateToc } from './toc-utils'

/**
 * Generate Table of Contents — builds a nested list of the document's markdown
 * headings (up to a chosen level) and inserts it at the cursor, or regenerates
 * it in place when a `<!-- toc -->` … `<!-- /toc -->` block already exists.
 */

async function pickMaxLevel(): Promise<number | undefined> {
  const items = [1, 2, 3, 4, 5, 6].map(level => ({
    label: `H${level}`,
    description: level === 3 ? 'Include headings up to this level (default)' : `Include headings up to this level`,
    level
  }))
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Deepest heading level to include in the table of contents'
  })
  return pick?.level
}

async function generateTableOfContents(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showInformationMessage('Toolkit: open a Markdown file first.')
    return
  }

  const document = editor.document
  const lines = Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text)
  const existing = findTocBlock(lines)

  const maxLevel = await pickMaxLevel()
  if (maxLevel === undefined) {
    return
  }

  const toc = generateToc(lines, { maxLevel })
  if (!toc) {
    vscode.window.showInformationMessage('Toolkit: no Markdown headings found.')
    return
  }

  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const block = buildTocBlock(toc).split('\n').join(eol)

  await editor.edit(builder => {
    if (existing) {
      const range = new vscode.Range(existing.start, 0, existing.end, lines[existing.end].length)
      builder.replace(range, block)
    } else {
      builder.insert(editor.selection.active, block + eol)
    }
  })
}

export function registerTocCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('toolkit.markdown.generateToc', () => generateTableOfContents()))
}
