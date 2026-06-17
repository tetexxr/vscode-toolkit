import * as vscode from 'vscode'

type Direction = 'up' | 'down'

async function getDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  )
  return symbols || []
}

/**
 * Walk the symbol tree and return the path from root to the deepest symbol
 * that contains the given position.
 */
function findSymbolPath(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol[] {
  for (const symbol of symbols) {
    if (symbol.range.contains(position)) {
      const deeper = findSymbolPath(symbol.children, position)
      return [symbol, ...deeper]
    }
  }
  return []
}

async function moveSymbol(direction: Direction): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) return

  const document = editor.document
  const cursorPosition = editor.selection.active

  const allSymbols = await getDocumentSymbols(document)
  if (allSymbols.length === 0) return

  // Find the deepest symbol containing the cursor
  const path = findSymbolPath(allSymbols, cursorPosition)
  if (path.length === 0) return

  const target = path[path.length - 1]
  const siblings = path.length === 1 ? allSymbols : path[path.length - 2].children

  // Sort siblings by position (should already be sorted, but just in case)
  const sorted = [...siblings].sort((a, b) => a.range.start.compareTo(b.range.start))
  const targetIdx = sorted.findIndex(s => s.range.isEqual(target.range))
  if (targetIdx === -1) return

  const adjacentIdx = direction === 'up' ? targetIdx - 1 : targetIdx + 1
  if (adjacentIdx < 0 || adjacentIdx >= sorted.length) return

  const adjacent = sorted[adjacentIdx]

  // Determine which symbol is first (top) and second (bottom) in the document
  const first = direction === 'up' ? adjacent : target
  const second = direction === 'up' ? target : adjacent

  const firstText = document.getText(first.range)
  const secondText = document.getText(second.range)
  const gapText = document.getText(new vscode.Range(first.range.end, second.range.start))

  // Replace the entire region with swapped content, preserving the gap
  const fullRange = new vscode.Range(first.range.start, second.range.end)
  const newText = secondText + gapText + firstText

  // Calculate new cursor position so cursor follows the moved symbol
  const fullRangeStartOffset = document.offsetAt(first.range.start)
  const cursorOffsetInTarget = document.offsetAt(cursorPosition) - document.offsetAt(target.range.start)

  let newCursorOffset: number
  if (direction === 'up') {
    // Target was second, now it's first
    newCursorOffset = fullRangeStartOffset + cursorOffsetInTarget
  } else {
    // Target was first, now it's second
    newCursorOffset = fullRangeStartOffset + secondText.length + gapText.length + cursorOffsetInTarget
  }

  await editor.edit(editBuilder => {
    editBuilder.replace(fullRange, newText)
  })

  // Reposition cursor to follow the moved symbol
  const newCursorPos = document.positionAt(newCursorOffset)
  editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
  editor.revealRange(
    new vscode.Range(newCursorPos, newCursorPos),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  )
}

export function registerMoveSymbolCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.moveSymbolUp', () => moveSymbol('up')),
    vscode.commands.registerCommand('toolkit.moveSymbolDown', () => moveSymbol('down'))
  )
}
