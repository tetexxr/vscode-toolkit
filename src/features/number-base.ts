import * as vscode from 'vscode'
import {
  formatBase,
  groupBinary,
  isHoverWorthy,
  NUMBER_TOKEN,
  parseNumber,
  type Base
} from './number-base-utils'

interface BaseDef {
  key: Base
  label: string
}

const BASES: BaseDef[] = [
  { key: 'dec', label: 'Decimal' },
  { key: 'hex', label: 'Hexadecimal' },
  { key: 'bin', label: 'Binary' },
  { key: 'oct', label: 'Octal' }
]

/* -------------------------------------------------------------------------- */
/*  Convert command                                                           */
/* -------------------------------------------------------------------------- */

async function convertCommand(target: Base | null): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const items = editor.selections
    .filter(s => !s.isEmpty)
    .map(selection => ({ selection, parsed: parseNumber(editor.document.getText(selection)) }))
  if (items.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a number first.')
    return
  }
  if (items.every(i => i.parsed === null)) {
    vscode.window.showWarningMessage('Toolkit: could not parse the selection as a number.')
    return
  }

  let pickedTarget = target
  if (pickedTarget === null) {
    const first = items.find(i => i.parsed !== null)!.parsed!
    type Item = vscode.QuickPickItem & { key: Base }
    const quickItems: Item[] = BASES.map(b => ({
      label: b.label,
      detail: `→ ${formatBase(first.value, b.key)}`,
      key: b.key
    }))
    const picked = await vscode.window.showQuickPick(quickItems, { placeHolder: 'Convert number to which base?' })
    if (!picked) {
      return
    }
    pickedTarget = picked.key
  }

  const targetBase = pickedTarget
  await editor.edit(builder => {
    for (const item of items) {
      if (item.parsed) {
        builder.replace(item.selection, formatBase(item.parsed.value, targetBase))
      }
    }
  })

  const skipped = items.filter(i => i.parsed === null).length
  if (skipped > 0) {
    vscode.window.showWarningMessage(`Toolkit: ${skipped} selection(s) were not numbers and left unchanged.`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Hover provider                                                            */
/* -------------------------------------------------------------------------- */

class NumberBaseHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const config = vscode.workspace.getConfiguration('toolkit.numberBase')
    if (!config.get<boolean>('enableHover', true)) {
      return undefined
    }
    const minDecimalDigits = Math.max(1, config.get<number>('hoverMinDecimalDigits', 3))

    const range = document.getWordRangeAtPosition(position, NUMBER_TOKEN)
    if (!range) {
      return undefined
    }
    const parsed = parseNumber(document.getText(range))
    if (!parsed || !isHoverWorthy(parsed, minDecimalDigits)) {
      return undefined
    }

    const lines = [
      '**Number**',
      '',
      `- Decimal: \`${formatBase(parsed.value, 'dec')}\``,
      `- Hex: \`${formatBase(parsed.value, 'hex')}\``,
      `- Octal: \`${formatBase(parsed.value, 'oct')}\``,
      `- Binary: \`${formatBase(parsed.value, 'bin')}\` (${groupBinary(parsed.value.toString(2))})`
    ]
    const md = new vscode.MarkdownString(lines.join('\n'))
    md.isTrusted = false
    return new vscode.Hover(md, range)
  }
}

function registerHover(context: vscode.ExtensionContext): void {
  const languages = vscode.workspace.getConfiguration('toolkit.numberBase').get<string[]>('hoverLanguages', ['*'])
  const provider = new NumberBaseHoverProvider()
  for (const language of languages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, provider))
  }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerNumberBaseCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.numberBase.convert', () => convertCommand(null)),
    vscode.commands.registerCommand('toolkit.numberBase.toDecimal', () => convertCommand('dec')),
    vscode.commands.registerCommand('toolkit.numberBase.toHex', () => convertCommand('hex')),
    vscode.commands.registerCommand('toolkit.numberBase.toBinary', () => convertCommand('bin')),
    vscode.commands.registerCommand('toolkit.numberBase.toOctal', () => convertCommand('oct'))
  )
  registerHover(context)
}
