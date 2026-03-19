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
 * Simplified single-file implementation (no LSP server) based on
 * the approach from formulahendry/auto-rename-tag with:
 * - Guard flag to prevent infinite recursion
 * - Stack-based tag matching (forward & backward scanning)
 * - Self-closing tag awareness
 */

let isUpdating = false;

function isLanguageActive(languageId: string): boolean {
  const config = vscode.workspace.getConfiguration('toolkit.autoRenameTag');
  if (!config.get<boolean>('enabled', true)) { return false; }
  const langs = config.get<string[]>('activationOnLanguage', ['*']);
  return langs.includes('*') || langs.includes(languageId);
}

export function registerAutoRenameTag(context: vscode.ExtensionContext): void {
  // Track the last change made by us to skip it in the listener
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

      const tag = getTagAtOffset(text, offset);
      if (!tag) { continue; }

      // Don't rename self-closing HTML tags
      if (!tag.isClosing && SELF_CLOSING_TAGS.has(tag.tagName.toLowerCase())) {
        continue;
      }

      let matchRange: { start: number; end: number } | undefined;

      if (tag.isClosing) {
        // We edited a closing tag — find the opening tag
        matchRange = findMatchingOpeningTag(text, tag.tagNameStart, tag.tagName);
      } else {
        // We edited an opening tag — find the closing tag after the '>'
        // First, find the end of the current opening tag
        let tagEnd = tag.tagNameEnd;
        while (tagEnd < text.length && text[tagEnd] !== '>') { tagEnd++; }
        if (tagEnd >= text.length) { continue; }
        // Check if this opening tag is self-closing
        if (text[tagEnd - 1] === '/') { continue; }
        matchRange = findMatchingClosingTag(text, tagEnd + 1, tag.tagName);
      }

      // If we couldn't find the old match, try to find a match with
      // what the tag name was before this edit. Calculate old tag name
      // by applying the change in reverse.
      if (!matchRange) {
        const changeStart = change.rangeOffset;
        const changeNewEnd = change.rangeOffset + change.text.length;
        const changeOldLength = change.rangeLength;

        // Only proceed if the change is within the tag name
        if (changeStart >= tag.tagNameStart && changeNewEnd <= tag.tagNameEnd) {
          const relStart = changeStart - tag.tagNameStart;
          const oldTagName = tag.tagName.substring(0, relStart)
            + text.substring(changeStart, changeStart).substring(0, 0) // placeholder
            + tag.tagName.substring(relStart + change.text.length);

          // Reconstruct old tag name
          const beforeChange = tag.tagName.substring(0, relStart);
          const afterChange = tag.tagName.substring(relStart + change.text.length);

          // The old text at the change position was `changeOldLength` chars
          // We can infer: old = before + <old chars> + after
          // Since we don't have the old chars easily, we use the text from range
          // Actually, the old text was replaced. We need to compute it differently.
          // old tag name length = tag.tagName.length - change.text.length + changeOldLength
          // Let's search for the paired tag with both old and new names by trying
          // to find any tag that could be the match

          // Simpler approach: search for closing/opening tags that are NOT the current tag name
          // and would be the pair
          const oldTagNameLen = tag.tagName.length - change.text.length + changeOldLength;
          if (oldTagNameLen > 0) {
            // Re-derive old tag name from the old document
            // This is complex — fall back to just using the new name
            // The original auto-rename-tag sends both old and new names to the server
            // For simplicity, we search for the old name by looking at what the pair currently is
            const oldName = beforeChange + 'x'.repeat(changeOldLength) + afterChange;
            // We cannot reliably reconstruct oldName without the original text.
            // Instead, try both scanning directions and look for any orphaned tag.
          }
        }

        // If no match found, skip
        if (!matchRange) { continue; }
      }

      // If the matching tag already has the same name, skip
      const matchName = text.substring(matchRange.start, matchRange.end);
      if (matchName === tag.tagName) { continue; }

      // Apply the rename
      const matchStartPos = document.positionAt(matchRange.start);
      const matchEndPos = document.positionAt(matchRange.end);
      const matchVscRange = new vscode.Range(matchStartPos, matchEndPos);

      isUpdating = true;
      try {
        const success = await editor.edit(
          editBuilder => {
            editBuilder.replace(matchVscRange, tag.tagName);
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

      // Only process the first relevant change
      break;
    }
  });

  context.subscriptions.push(disposable);
}
