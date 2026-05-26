import * as vscode from 'vscode'
import {
  base64Decode,
  base64Encode,
  base64UrlDecode,
  base64UrlEncode,
  decodeJwt,
  formatDecodedJwt,
  hash,
  hexDecode,
  hexEncode,
  htmlDecode,
  htmlEncode,
  TransformError,
  urlDecode,
  urlEncode
} from './transform-utils'

type StringTransform = (input: string) => string

interface TransformDefinition {
  command: string
  label: string
  description: string
  fn: StringTransform
}

const TRANSFORMS: TransformDefinition[] = [
  { command: 'toolkit.transform.base64Encode', label: 'Base64 Encode', description: 'UTF-8 → Base64', fn: base64Encode },
  { command: 'toolkit.transform.base64Decode', label: 'Base64 Decode', description: 'Base64 → UTF-8', fn: base64Decode },
  {
    command: 'toolkit.transform.base64UrlEncode',
    label: 'Base64 URL Encode',
    description: 'UTF-8 → URL-safe Base64',
    fn: base64UrlEncode
  },
  {
    command: 'toolkit.transform.base64UrlDecode',
    label: 'Base64 URL Decode',
    description: 'URL-safe Base64 → UTF-8',
    fn: base64UrlDecode
  },
  {
    command: 'toolkit.transform.urlEncode',
    label: 'URL Encode',
    description: 'encodeURIComponent',
    fn: urlEncode
  },
  {
    command: 'toolkit.transform.urlDecode',
    label: 'URL Decode',
    description: 'decodeURIComponent',
    fn: urlDecode
  },
  {
    command: 'toolkit.transform.htmlEncode',
    label: 'HTML Encode',
    description: 'Escape &<>"\' to HTML entities',
    fn: htmlEncode
  },
  {
    command: 'toolkit.transform.htmlDecode',
    label: 'HTML Decode',
    description: 'Decode named and numeric HTML entities',
    fn: htmlDecode
  },
  { command: 'toolkit.transform.hexEncode', label: 'Hex Encode', description: 'UTF-8 → hex', fn: hexEncode },
  { command: 'toolkit.transform.hexDecode', label: 'Hex Decode', description: 'Hex → UTF-8', fn: hexDecode },
  { command: 'toolkit.transform.md5', label: 'MD5', description: 'MD5 hex digest', fn: input => hash(input, 'md5') },
  {
    command: 'toolkit.transform.sha1',
    label: 'SHA-1',
    description: 'SHA-1 hex digest',
    fn: input => hash(input, 'sha1')
  },
  {
    command: 'toolkit.transform.sha256',
    label: 'SHA-256',
    description: 'SHA-256 hex digest',
    fn: input => hash(input, 'sha256')
  },
  {
    command: 'toolkit.transform.sha512',
    label: 'SHA-512',
    description: 'SHA-512 hex digest',
    fn: input => hash(input, 'sha512')
  }
]

function getNonEmptySelections(editor: vscode.TextEditor): vscode.Selection[] {
  return editor.selections.filter(s => !s.isEmpty)
}

async function applyTransform(fn: StringTransform): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const selections = getNonEmptySelections(editor)
  if (selections.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select some text first.')
    return
  }

  const edits: Array<{ range: vscode.Range; replacement: string }> = []
  const errors: string[] = []
  for (const selection of selections) {
    const text = editor.document.getText(selection)
    try {
      edits.push({ range: selection, replacement: fn(text) })
    } catch (error) {
      if (error instanceof TransformError) {
        errors.push(error.message)
      } else {
        throw error
      }
    }
  }

  if (edits.length > 0) {
    await editor.edit(builder => {
      for (const e of edits) {
        builder.replace(e.range, e.replacement)
      }
    })
  }

  if (errors.length > 0) {
    vscode.window.showWarningMessage('Toolkit: ' + [...new Set(errors)].join(' '))
  }
}

async function applyJwtDecode(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const selections = getNonEmptySelections(editor)
  if (selections.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a JWT first.')
    return
  }
  if (selections.length > 1) {
    vscode.window.showInformationMessage('Toolkit: only the first selection is decoded for JWT.')
  }

  const token = editor.document.getText(selections[0])
  let formatted: string
  try {
    formatted = formatDecodedJwt(decodeJwt(token))
  } catch (error) {
    if (error instanceof TransformError) {
      vscode.window.showWarningMessage(`Toolkit: ${error.message}`)
      return
    }
    throw error
  }

  const doc = await vscode.workspace.openTextDocument({ content: formatted, language: 'jsonc' })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export function registerTransformCommands(context: vscode.ExtensionContext): void {
  for (const def of TRANSFORMS) {
    context.subscriptions.push(vscode.commands.registerCommand(def.command, () => applyTransform(def.fn)))
  }
  context.subscriptions.push(vscode.commands.registerCommand('toolkit.transform.jwtDecode', () => applyJwtDecode()))

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.transform', async () => {
      type Item = vscode.QuickPickItem & { fn?: StringTransform; isJwt?: boolean }
      const items: Item[] = TRANSFORMS.map(def => ({
        label: def.label,
        description: def.description,
        fn: def.fn
      }))
      items.push({
        label: 'JWT Decode',
        description: 'Decode header + payload into a new editor',
        isJwt: true
      })
      const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'Pick a transformation'
      })
      if (!picked) {
        return
      }
      if (picked.isJwt) {
        await applyJwtDecode()
      } else if (picked.fn) {
        await applyTransform(picked.fn)
      }
    })
  )
}
