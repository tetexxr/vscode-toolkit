import * as vscode from 'vscode'
import {
  detectInputFormat,
  formatRelative,
  interpretAsEpoch,
  parseTimestamp,
  toIsoLocal,
  toIsoUtc,
  toUnixMillis,
  toUnixSeconds,
  type EpochCandidate
} from './timestamp-utils'

type TargetFormat = 'isoUtc' | 'isoLocal' | 'unixSeconds' | 'unixMillis'

interface FormatDef {
  key: TargetFormat
  label: string
  description: string
  format: (date: Date) => string
}

const FORMATS: FormatDef[] = [
  { key: 'isoUtc', label: 'ISO 8601 (UTC)', description: 'e.g. 2024-03-15T12:34:56.789Z', format: toIsoUtc },
  {
    key: 'isoLocal',
    label: 'ISO 8601 (Local)',
    description: 'e.g. 2024-03-15T13:34:56.789+01:00',
    format: toIsoLocal
  },
  { key: 'unixSeconds', label: 'Unix Seconds', description: 'Integer seconds since 1970', format: toUnixSeconds },
  { key: 'unixMillis', label: 'Unix Milliseconds', description: 'Integer milliseconds since 1970', format: toUnixMillis }
]

function getSelectionsWithText(editor: vscode.TextEditor): Array<{ selection: vscode.Selection; text: string }> {
  return editor.selections
    .filter(s => !s.isEmpty)
    .map(s => ({ selection: s, text: editor.document.getText(s) }))
}

async function convertCommand(target: TargetFormat | null): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const items = getSelectionsWithText(editor)
  if (items.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a timestamp first.')
    return
  }

  // Parse each selection
  const parsed: Array<{ selection: vscode.Selection; date: Date | null; text: string }> = items.map(item => ({
    selection: item.selection,
    text: item.text,
    date: parseTimestamp(item.text)
  }))
  if (parsed.every(p => p.date === null)) {
    vscode.window.showWarningMessage('Toolkit: could not parse the selection as a timestamp.')
    return
  }

  let pickedTarget = target
  if (pickedTarget === null) {
    type Item = vscode.QuickPickItem & { key: TargetFormat }
    const first = parsed.find(p => p.date !== null)!.date!
    const quickItems: Item[] = FORMATS.map(f => ({
      label: f.label,
      description: f.description,
      detail: `→ ${f.format(first)}`,
      key: f.key
    }))
    const picked = await vscode.window.showQuickPick(quickItems, {
      matchOnDescription: true,
      placeHolder: 'Pick a target format'
    })
    if (!picked) {
      return
    }
    pickedTarget = picked.key
  }

  const formatter = FORMATS.find(f => f.key === pickedTarget)!.format
  await editor.edit(builder => {
    for (const p of parsed) {
      if (p.date) {
        builder.replace(p.selection, formatter(p.date))
      }
    }
  })

  const skipped = parsed.filter(p => p.date === null).length
  if (skipped > 0) {
    vscode.window.showWarningMessage(`Toolkit: ${skipped} selection(s) were not recognized timestamps and left unchanged.`)
  }
}

async function showTimestampInfo(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const items = getSelectionsWithText(editor)
  if (items.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a timestamp first.')
    return
  }
  const date = parseTimestamp(items[0].text)
  if (!date) {
    vscode.window.showWarningMessage('Toolkit: could not parse the selection as a timestamp.')
    return
  }

  type Item = vscode.QuickPickItem & { value: string }
  const quickItems: Item[] = [
    { label: 'ISO 8601 (UTC)', description: toIsoUtc(date), value: toIsoUtc(date) },
    { label: 'ISO 8601 (Local)', description: toIsoLocal(date), value: toIsoLocal(date) },
    { label: 'Unix Seconds', description: toUnixSeconds(date), value: toUnixSeconds(date) },
    { label: 'Unix Milliseconds', description: toUnixMillis(date), value: toUnixMillis(date) },
    { label: 'Relative', description: formatRelative(date), value: formatRelative(date) }
  ]
  const picked = await vscode.window.showQuickPick(quickItems, {
    matchOnDescription: true,
    placeHolder: 'Pick a value to copy to the clipboard'
  })
  if (picked) {
    await vscode.env.clipboard.writeText(picked.value)
    vscode.window.showInformationMessage(`Toolkit: copied ${picked.label}.`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Hover provider                                                            */
/* -------------------------------------------------------------------------- */

class TimestampHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const config = vscode.workspace.getConfiguration('toolkit.timestamp.hover')
    if (!config.get<boolean>('enabled', true)) {
      return undefined
    }
    const minYear = config.get<number>('minYear', 1990)
    const maxYear = config.get<number>('maxYear', 2100)

    const range = document.getWordRangeAtPosition(position, /\d{10,16}/)
    if (!range) {
      return undefined
    }
    const digits = document.getText(range)
    const candidates = interpretAsEpoch(digits, { minYear, maxYear })
    if (candidates.length === 0) {
      return undefined
    }

    const lines: string[] = ['**Timestamp**']
    for (const c of candidates) {
      lines.push('', formatCandidate(c))
    }
    const md = new vscode.MarkdownString(lines.join('\n'))
    md.isTrusted = false
    return new vscode.Hover(md, range)
  }
}

function formatCandidate(c: EpochCandidate): string {
  const unit = c.format === 'seconds' ? 'seconds' : c.format === 'millis' ? 'milliseconds' : 'microseconds'
  return [
    `- Interpreted as: **${unit}**`,
    `- ISO (UTC): \`${toIsoUtc(c.date)}\``,
    `- ISO (Local): \`${toIsoLocal(c.date)}\``,
    `- Relative: ${formatRelative(c.date)}`
  ].join('\n')
}

function registerHover(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('toolkit.timestamp.hover')
  const languages = config.get<string[]>('languages', ['*'])
  const provider = new TimestampHoverProvider()
  for (const language of languages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, provider))
  }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerTimestampCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.timestamp.convert', () => convertCommand(null)),
    vscode.commands.registerCommand('toolkit.timestamp.toIsoUtc', () => convertCommand('isoUtc')),
    vscode.commands.registerCommand('toolkit.timestamp.toIsoLocal', () => convertCommand('isoLocal')),
    vscode.commands.registerCommand('toolkit.timestamp.toUnixSeconds', () => convertCommand('unixSeconds')),
    vscode.commands.registerCommand('toolkit.timestamp.toUnixMillis', () => convertCommand('unixMillis')),
    vscode.commands.registerCommand('toolkit.timestamp.showInfo', () => showTimestampInfo())
  )

  registerHover(context)
}

// Re-exported for tests
export { detectInputFormat }
