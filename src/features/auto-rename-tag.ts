import * as vscode from 'vscode';
import {
  SELF_CLOSING_TAGS,
  getTagAtOffset,
  findMatchingClosingTag,
  findMatchingOpeningTag,
} from '../utils/tags';

/**
 * Auto Rename Tag — when an opening/closing HTML/XML tag is edited,
 * automatically update the matching pair.
 *
 * Key insight: when the user types in `<div>` changing it to `<divx>`,
 * the document already contains `<divx>` but the closing tag is still `</div>`.
 * We must reconstruct the OLD tag name from the contentChange to find the pair,
 * then replace it with the NEW tag name.
 */

let isUpdating = false;

function isLanguageActive(languageId: string): boolean {
  const config = vscode.workspace.getConfiguration('toolkit.autoRenameTag');
  if (!config.get<boolean>('enabled', true)) { return false; }
  const langs = config.get<string[]>('activationOnLanguage', ['*']);
  return langs.includes('*') || langs.includes(languageId);
}

/**
 * Reconstruct the old tag name by reversing the contentChange within the tag name.
 * The document text already has the NEW content. We undo the change to get the old name.
 */
function getOldTagName(
  tag: { tagNameStart: number; tagNameEnd: number; tagName: string },
  change: { rangeOffset: number; rangeLength: number; text: string },
): string | undefined {
  const changeStart = change.rangeOffset;
  const changeNewEnd = change.rangeOffset + change.text.length;

  // Check if the change overlaps the tag name
  if (changeStart > tag.tagNameEnd || changeNewEnd < tag.tagNameStart) {
    return undefined;
  }

  // Position of the change relative to the tag name start
  const relStart = Math.max(0, changeStart - tag.tagNameStart);
  const relNewEnd = Math.min(tag.tagName.length, changeNewEnd - tag.tagNameStart);

  // old tag name = before the change + (we don't know the old chars, but old length = rangeLength) + after the change
  // Since we don't have the old text, we rebuild it:
  // The old tag name had the same prefix and suffix, but the middle part was `rangeLength` chars
  // that got replaced by `change.text`.
  // We can't know the exact old chars, but we know the old tag name length.
  // For matching purposes, we need to find the paired tag which still has the old name.
  // Strategy: scan the document for the paired tag and return whatever name it has.
  return undefined;
}

export function registerAutoRenameTag(context: vscode.ExtensionContext): void {
  let lastAutoRenameVersion: { fsPath: string; version: number } | undefined;

  const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (isUpdating) { return; }
    if (event.contentChanges.length === 0) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) { return; }
    if (!isLanguageActive(event.document.languageId)) { return; }

    // Skip changes we made ourselves
    if (lastAutoRenameVersion &&
        lastAutoRenameVersion.fsPath === event.document.uri.fsPath &&
        lastAutoRenameVersion.version === event.document.version) {
      return;
    }

    const document = event.document;
    const text = document.getText();

    for (const change of event.contentChanges) {
      const offset = change.rangeOffset + change.text.length;

      // Find the tag at the cursor position (after the edit)
      const tag = getTagAtOffset(text, offset);
      if (!tag) { continue; }

      const newTagName = tag.tagName;

      // Don't rename self-closing HTML tags
      if (!tag.isClosing && SELF_CLOSING_TAGS.has(newTagName.toLowerCase())) {
        continue;
      }

      // Reconstruct the old tag name by undoing the change within the tag name
      const changeRelStart = change.rangeOffset - tag.tagNameStart;
      const beforeChange = newTagName.substring(0, changeRelStart);
      const afterChange = newTagName.substring(changeRelStart + change.text.length);
      // We don't have the old chars, but we know there were `change.rangeLength` of them.
      // The paired tag still has the old name, so we scan for it.

      // Old tag name length
      const oldTagNameLength = newTagName.length - change.text.length + change.rangeLength;
      if (oldTagNameLength <= 0) { continue; }

      let matchRange: { start: number; end: number } | undefined;

      if (tag.isClosing) {
        // We edited a closing tag — the opening tag still has the OLD name.
        // We need to find ANY opening tag that could be our pair.
        // Scan backward looking for an opening tag at depth 0 that is NOT self-closing.
        // The paired opening tag has the old name (which we don't fully know),
        // but it's the nearest unmatched opening tag before us.
        matchRange = findNearestUnmatchedOpeningTag(text, tag.tagNameStart);
      } else {
        // We edited an opening tag — the closing tag still has the OLD name.
        // Find the end of the current opening tag first.
        let tagEnd = tag.tagNameEnd;
        while (tagEnd < text.length && text[tagEnd] !== '>') { tagEnd++; }
        if (tagEnd >= text.length) { continue; }
        if (text[tagEnd - 1] === '/') { continue; } // self-closing

        matchRange = findNearestUnmatchedClosingTag(text, tagEnd + 1);
      }

      if (!matchRange) { continue; }

      // If the matching tag already has the same name, skip
      const matchName = text.substring(matchRange.start, matchRange.end);
      if (matchName === newTagName) { continue; }

      // Apply the rename
      const matchStartPos = document.positionAt(matchRange.start);
      const matchEndPos = document.positionAt(matchRange.end);
      const matchVscRange = new vscode.Range(matchStartPos, matchEndPos);

      isUpdating = true;
      try {
        const success = await editor.edit(
          editBuilder => {
            editBuilder.replace(matchVscRange, newTagName);
          },
          { undoStopBefore: false, undoStopAfter: false }
        );
        if (success) {
          lastAutoRenameVersion = {
            fsPath: document.uri.fsPath,
            version: document.version,
          };
        }
      } finally {
        isUpdating = false;
      }

      break;
    }
  });

  context.subscriptions.push(disposable);
}

/**
 * Finds the nearest unmatched closing tag scanning forward from startOffset.
 * "Unmatched" means it's not paired with an opening tag between startOffset and itself.
 * Uses a stack: opening tags push, closing tags pop. First closing tag at depth 0 wins.
 */
function findNearestUnmatchedClosingTag(
  text: string,
  startOffset: number,
): { start: number; end: number } | undefined {
  const TAG_RE = /^[!:\w$]((?![>/])[\S])*/;
  let pos = startOffset;
  let depth = 0;

  while (pos < text.length) {
    const idx = text.indexOf('<', pos);
    if (idx === -1) { break; }

    if (text[idx + 1] === '/') {
      // Closing tag
      const nameStart = idx + 2;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;
        if (depth === 0) {
          return { start: nameStart, end: nameEnd };
        }
        depth--;
        pos = nameEnd;
        continue;
      }
    } else if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      // Opening tag
      const nameStart = idx + 1;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;
        // Check self-closing
        let j = nameEnd;
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') { break; }
          j++;
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/';
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          depth++;
        }
        pos = nameEnd;
        continue;
      }
    }

    pos = idx + 1;
  }

  return undefined;
}

/**
 * Finds the nearest unmatched opening tag scanning backward from startOffset.
 * Uses a stack: closing tags push, opening tags pop. First opening tag at depth 0 wins.
 */
function findNearestUnmatchedOpeningTag(
  text: string,
  startOffset: number,
): { start: number; end: number } | undefined {
  const TAG_RE = /^[!:\w$]((?![>/])[\S])*/;
  let pos = startOffset;
  let depth = 0;

  while (pos > 0) {
    const idx = text.lastIndexOf('<', pos - 1);
    if (idx === -1) { break; }

    if (text[idx + 1] === '/') {
      // Closing tag — increases depth
      const nameStart = idx + 2;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_RE);
      if (match) {
        depth++;
      }
      pos = idx;
      continue;
    }

    if (text[idx + 1] !== '!' && text[idx + 1] !== '?') {
      // Opening tag
      const nameStart = idx + 1;
      const remaining = text.substring(nameStart);
      const match = remaining.match(TAG_RE);
      if (match) {
        const name = match[0];
        const nameEnd = nameStart + name.length;
        // Check self-closing
        let j = nameEnd;
        while (j < text.length && text[j] !== '>') {
          if (text[j] === '<') { break; }
          j++;
        }
        const isSelfClosing = j < text.length && text[j] === '>' && text[j - 1] === '/';
        if (!isSelfClosing && !SELF_CLOSING_TAGS.has(name.toLowerCase())) {
          if (depth === 0) {
            return { start: nameStart, end: nameEnd };
          }
          depth--;
        }
      }
    }

    pos = idx;
  }

  return undefined;
}
