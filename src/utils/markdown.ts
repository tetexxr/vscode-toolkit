/**
 * Escapes markdown syntax so untrusted text (commit subjects, authors,
 * diagnostic messages...) renders as plain text inside a MarkdownString.
 */
export function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, m => `\\${m}`)
}
