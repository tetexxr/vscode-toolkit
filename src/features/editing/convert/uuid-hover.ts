import * as vscode from 'vscode'
import { analyzeUlid, analyzeUuid, ULID_WORD_RE, UUID_WORD_RE, type IdInfo } from './uuid-hover-utils'
import { formatRelative, toIsoLocal, toIsoUtc } from './timestamp-utils'

/**
 * UUID / ULID hover — hover an identifier anywhere to see its kind and, for
 * time-ordered formats (UUID v1/v6/v7, ULID), the embedded creation time.
 * Mirrors the timestamp hover.
 */

class UuidHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const config = vscode.workspace.getConfiguration('toolkit.uuidHover')
    if (!config.get<boolean>('enabled', true)) {
      return undefined
    }

    let range = document.getWordRangeAtPosition(position, UUID_WORD_RE)
    let info: IdInfo | null = null
    if (range && isStandalone(document, range)) {
      info = analyzeUuid(document.getText(range))
    }
    if (!info) {
      range = document.getWordRangeAtPosition(position, ULID_WORD_RE)
      if (range && isStandalone(document, range)) {
        info = analyzeUlid(document.getText(range))
      }
    }
    if (!info || !range) {
      return undefined
    }

    const lines = [`**${info.label}** — ${info.trait}`]
    if (info.timestampMs !== undefined) {
      const date = new Date(info.timestampMs)
      lines.push(
        '',
        `- Created (UTC): \`${toIsoUtc(date)}\``,
        `- Created (Local): \`${toIsoLocal(date)}\``,
        `- Relative: ${formatRelative(date)}`
      )
    } else if (info.label !== 'UUID') {
      lines.push('', '_No embedded timestamp._')
    }

    const md = new vscode.MarkdownString(lines.join('\n'))
    md.isTrusted = false
    return new vscode.Hover(md, range)
  }
}

/** The matched range must not sit inside a longer identifier or number. */
function isStandalone(document: vscode.TextDocument, range: vscode.Range): boolean {
  const line = document.lineAt(range.start.line).text
  const before = range.start.character > 0 ? line[range.start.character - 1] : ''
  const after = range.end.character < line.length ? line[range.end.character] : ''
  const wordChar = /[0-9A-Za-z-]/
  return !wordChar.test(before) && !wordChar.test(after)
}

export function registerUuidHover(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('toolkit.uuidHover')
  const languages = config.get<string[]>('languages', ['*'])
  const provider = new UuidHoverProvider()
  for (const language of languages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, provider))
  }
}
