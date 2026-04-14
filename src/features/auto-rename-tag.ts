import * as vscode from 'vscode'
import { SELF_CLOSING_TAGS, getTagAtOffset } from '../utils/tags'

/**
 * Auto Rename Tag — when an opening/closing HTML/XML tag is edited,
 * automatically update the matching pair.
 *
 * Key insight: when the user types in `<div>` changing it to `<divx>`,
 * the document already contains `<divx>` but the closing tag is still `</div>`.
 * We find the nearest unmatched paired tag and replace its name with the new one.
 */

const TAG_RE = /^[!:\w$]((?![>/])[\S])*/

/** Languages where VS Code's built-in linked editing handles tag renaming. */
const LINKED_EDITING_LANGUAGES = new Set(['html', 'handlebars'])

let isUpdating = false

function isLanguageActive(languageId: string): boolean {
  const config = vscode.workspace.getConfiguration('toolkit.autoRenameTag')
  if (!config.get<boolean>('enabled', true)) {
    return false
  }

  // If VS Code's native linked editing is active for this language, step aside.
  if (LINKED_EDITING_LANGUAGES.has(languageId)) {
    const editorConfig = vscode.workspace.getConfiguration('editor', { languageId })
    if (editorConfig.get<boolean>('linkedEditing', false)) {
      return false
    }
    // Legacy setting name
    if (editorConfig.get<boolean>('renameOnType', false)) {
      return false
    }
  }

  const langs = config.get<string[]>('activationOnLanguage', ['*'])
  return langs.includes('*') || langs.includes(languageId)
}

/**
 * Checks whether the given offset is inside a <script> or <style> block's content.
 * If so, we should not try to auto-rename tags — the content is code, not markup.
 */
function isInsideScriptOrStyle(text: string, offset: number): boolean {
  // Find the last <script...> or <style...> opening before offset
  const patterns = [
    { open: /<script[\s>]/gi, close: /<\/script\s*>/gi },
    { open: /<style[\s>]/gi, close: /<\/style\s*>/gi }
  ]

  for (const { open, close } of patterns) {
    open.lastIndex = 0
    let lastOpenEnd = -1

    let match: RegExpExecArray | null
    while ((match = open.exec(text)) !== null) {
      if (match.index >= offset) {
        break
      }
      // Find the closing '>' of this opening tag
      const gtIdx = text.indexOf('>', match.index + match[0].length)
      if (gtIdx !== -1 && gtIdx < offset) {
        lastOpenEnd = gtIdx + 1
      }
    }

    if (lastOpenEnd === -1) {
      continue
    }

    // Now find the first </script> or </style> after lastOpenEnd
    close.lastIndex = lastOpenEnd
    const closeMatch = close.exec(text)
    if (!closeMatch || closeMatch.index >= offset) {
      // We're between the opening and closing (or no closing found) — inside the block
      return true
    }
  }

  return false
}

export function registerAutoRenameTag(context: vscode.ExtensionContext): void {
  let lastAutoRenameVersion: { fsPath: string; version: number } | undefined

  const disposable = vscode.workspace.onDidChangeTextDocument(async event => {
    if (isUpdating) {
      return
    }
    if (event.contentChanges.length === 0) {
      return
    }

    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document !== event.document) {
      return
    }
    if (!isLanguageActive(event.document.languageId)) {
      return
    }

    // Skip changes we made ourselves
    if (
      lastAutoRenameVersion &&
      lastAutoRenameVersion.fsPath === event.document.uri.fsPath &&
      lastAutoRenameVersion.version === event.document.version
    ) {
      return
    }

    const document = event.document
    const text = document.getText()

    for (const change of event.contentChanges) {
      const offset = change.rangeOffset + change.text.length

      // Don't process edits inside script/style blocks
      if (isInsideScriptOrStyle(text, offset)) {
        continue
      }

      // Find the tag at the cursor position (after the edit)
      const tag = getTagAtOffset(text, offset)
      if (!tag) {
        continue
      }

      const newTagName = tag.tagName

      // Don't rename self-closing HTML tags
      if (!tag.isClosing && SELF_CLOSING_TAGS.has(newTagName.toLowerCase())) {
        continue
      }

      // Old tag name length — if it would be empty, skip
      const oldTagNameLength = newTagName.length - change.text.length + change.rangeLength
      if (oldTagNameLength <= 0) {
        continue
      }

      let matchRange: { start: number; end: number } | undefined

      if (tag.isClosing) {
        matchRange = findNearestUnmatchedOpeningTag(text, tag.tagNameStart)
      } else {
        // Find the end of the current opening tag
        let tagEnd = tag.tagNameEnd
        while (tagEnd < text.length && text[tagEnd] !== '>') {
          tagEnd++
        }
        if (tagEnd >= text.length) {
          continue
        }
        if (text[tagEnd - 1] === '/') {
          continue
        } // self-closing
        matchRange = findNearestUnmatchedClosingTag(text, tagEnd + 1)
      }

      if (!matchRange) {
        continue
      }

      // If the matching tag already has the same name, skip
      const matchName = text.substring(matchRange.start, matchRange.end)
      if (matchName === newTagName) {
        continue
      }

      // Apply the rename
      const matchStartPos = document.positionAt(matchRange.start)
      const matchEndPos = document.positionAt(matchRange.end)
      const matchVscRange = new vscode.Range(matchStartPos, matchEndPos)

      isUpdating = true
      try {
        const success = await editor.edit(
          editBuilder => {
            editBuilder.replace(matchVscRange, newTagName)
          },
          { undoStopBefore: false, undoStopAfter: false }
        )
        if (success) {
          lastAutoRenameVersion = {
            fsPath: document.uri.fsPath,
            version: document.version
          }
        }
      } finally {
        isUpdating = false
      }

      break
    }
  })

  context.subscriptions.push(disposable)
}

/**
 * Finds the nearest unmatched closing tag scanning forward from startOffset.
 * Uses a stack: opening tags push, closing tags pop. First closing tag at depth 0 wins.
 */
function findNearestUnmatchedClosingTag(text: string, startOffset: number): { start: number; end: number } | undefined {
  let pos = startOffset
  let depth = 0

  while (pos < text.length) {
    const idx = text.indexOf('<', pos)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const remaining = text.substring(nameStart)
      const match = remaining.match(TAG_RE)
      if (match) {
        const name = match[0]
        const nameEnd = nameStart + name.length
        if (depth === 0) {
          return { start: nameStart, end: nameEnd }
        }
        depth--
        pos = nameEnd
        continue
      }
    } else if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const remaining = text.substring(nameStart)
      const match = remaining.match(TAG_RE)
      if (match) {
        const name = match[0]
        const nameEnd = nameStart + name.length
        let j = nameEnd
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') {
            break
          }
          j++
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/'
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          depth++
        }
        pos = nameEnd
        continue
      }
    }

    pos = idx + 1
  }

  return undefined
}

/**
 * Finds the nearest unmatched opening tag scanning backward from startOffset.
 * Uses a stack: closing tags push, opening tags pop. First opening tag at depth 0 wins.
 */
function findNearestUnmatchedOpeningTag(text: string, startOffset: number): { start: number; end: number } | undefined {
  let pos = startOffset
  let depth = 0

  while (pos > 0) {
    const idx = text.lastIndexOf('<', pos - 1)
    if (idx === -1) {
      break
    }

    if (text[idx + 1] === '/') {
      const nameStart = idx + 2
      const remaining = text.substring(nameStart)
      const match = remaining.match(TAG_RE)
      if (match) {
        depth++
      }
      pos = idx
      continue
    }

    if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      const nameStart = idx + 1
      const remaining = text.substring(nameStart)
      const match = remaining.match(TAG_RE)
      if (match) {
        const name = match[0]
        const nameEnd = nameStart + name.length
        let j = nameEnd
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') {
            break
          }
          j++
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/'
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          if (depth === 0) {
            return { start: nameStart, end: nameEnd }
          }
          depth--
        }
      }
    }

    pos = idx
  }

  return undefined
}
