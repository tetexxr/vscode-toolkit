import * as vscode from 'vscode'
import {
  isoTimestamp,
  randomBase64,
  randomHex,
  ulid,
  unixMillis,
  unixSeconds,
  uuidV4,
  uuidV7
} from './insert-utils'

type Generator = () => string

interface InsertDefinition {
  command: string
  label: string
  description: string
  prepare: () => Generator | null | Promise<Generator | null>
}

function uuidCasingTransform(value: string): string {
  const config = vscode.workspace.getConfiguration('toolkit.insert')
  return config.get<boolean>('uuidUppercase', false) ? value.toUpperCase() : value
}

async function promptForByteLength(
  prompt: string,
  defaultBytes: number,
  outputForBytes: (bytes: number) => string
): Promise<number | null> {
  const input = await vscode.window.showInputBox({
    prompt,
    value: String(defaultBytes),
    validateInput: value => {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 1024) {
        return 'Enter an integer between 1 and 1024.'
      }
      return null
    }
  })
  if (input === undefined) {
    return null
  }
  const bytes = Number(input)
  void outputForBytes // reserved for a future preview
  return bytes
}

const DEFINITIONS: InsertDefinition[] = [
  {
    command: 'toolkit.insert.uuidV4',
    label: 'UUID v4',
    description: 'Random UUID, e.g. f47ac10b-58cc-4372-a567-0e02b2c3d479',
    prepare: () => () => uuidCasingTransform(uuidV4())
  },
  {
    command: 'toolkit.insert.uuidV7',
    label: 'UUID v7',
    description: 'Time-ordered UUID (RFC 9562)',
    prepare: () => () => uuidCasingTransform(uuidV7())
  },
  {
    command: 'toolkit.insert.ulid',
    label: 'ULID',
    description: 'Crockford Base32, time-ordered',
    prepare: () => () => ulid()
  },
  {
    command: 'toolkit.insert.isoTimestamp',
    label: 'ISO Timestamp',
    description: 'Current time in ISO 8601 (UTC, with milliseconds)',
    prepare: () => () => isoTimestamp()
  },
  {
    command: 'toolkit.insert.unixSeconds',
    label: 'Unix Epoch (seconds)',
    description: 'Current time in seconds since 1970',
    prepare: () => () => unixSeconds()
  },
  {
    command: 'toolkit.insert.unixMillis',
    label: 'Unix Epoch (milliseconds)',
    description: 'Current time in ms since 1970',
    prepare: () => () => unixMillis()
  },
  {
    command: 'toolkit.insert.randomHex',
    label: 'Random Hex...',
    description: 'Cryptographically secure random bytes as hex',
    prepare: async () => {
      const config = vscode.workspace.getConfiguration('toolkit.insert')
      const defaultBytes = config.get<number>('randomHexBytes', 16)
      const bytes = await promptForByteLength(
        'Number of random bytes (output will be 2× this many hex chars)',
        defaultBytes,
        n => `${n * 2} chars`
      )
      if (bytes === null) {
        return null
      }
      return () => randomHex(bytes)
    }
  },
  {
    command: 'toolkit.insert.randomBase64',
    label: 'Random Base64...',
    description: 'Cryptographically secure random bytes as URL-safe Base64',
    prepare: async () => {
      const config = vscode.workspace.getConfiguration('toolkit.insert')
      const defaultBytes = config.get<number>('randomBase64Bytes', 16)
      const bytes = await promptForByteLength(
        'Number of random bytes (output will be URL-safe Base64 without padding)',
        defaultBytes,
        n => `~${Math.ceil((n * 4) / 3)} chars`
      )
      if (bytes === null) {
        return null
      }
      return () => randomBase64(bytes)
    }
  }
]

async function applyInsert(generator: Generator): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  await editor.edit(builder => {
    for (const selection of editor.selections) {
      const value = generator()
      if (selection.isEmpty) {
        builder.insert(selection.active, value)
      } else {
        builder.replace(selection, value)
      }
    }
  })
}

async function runDefinition(def: InsertDefinition): Promise<void> {
  const generator = await def.prepare()
  if (!generator) {
    return
  }
  await applyInsert(generator)
}

export function registerInsertCommands(context: vscode.ExtensionContext): void {
  for (const def of DEFINITIONS) {
    context.subscriptions.push(vscode.commands.registerCommand(def.command, () => runDefinition(def)))
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.insert', async () => {
      const items = DEFINITIONS.map(def => ({
        label: def.label,
        description: def.description,
        def
      }))
      const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'Pick a value to insert'
      })
      if (picked) {
        await runDefinition(picked.def)
      }
    })
  )
}
