import * as vscode from 'vscode'
import {
  DEFAULT_CS_OPTIONS,
  DEFAULT_TS_OPTIONS,
  generateCSharp,
  generateTypeScript,
  inferSchema,
  isValidIdentifier,
  JsonParseError,
  parseJson,
  pascalCase,
  type CSharpCollectionType,
  type CSharpOptions,
  type CSharpRecordStyle,
  type TypeScriptOptions,
  type TypeScriptStyle
} from './json-to-type-utils'

type Target =
  | { kind: 'typescript'; style: TypeScriptStyle }
  | { kind: 'csharp'; outputKind: 'record' | 'class' }

interface TargetDefinition {
  command: string
  label: string
  description: string
  language: 'typescript' | 'csharp'
  target: Target
}

const TARGETS: TargetDefinition[] = [
  {
    command: 'toolkit.jsonToType.typescriptInterface',
    label: 'TypeScript Interface',
    description: 'interface Root { ... }',
    language: 'typescript',
    target: { kind: 'typescript', style: 'interface' }
  },
  {
    command: 'toolkit.jsonToType.typescriptType',
    label: 'TypeScript Type',
    description: 'type Root = { ... }',
    language: 'typescript',
    target: { kind: 'typescript', style: 'type' }
  },
  {
    command: 'toolkit.jsonToType.csharpRecord',
    label: 'C# Record',
    description: 'public record Root(...)',
    language: 'csharp',
    target: { kind: 'csharp', outputKind: 'record' }
  },
  {
    command: 'toolkit.jsonToType.csharpClass',
    label: 'C# Class',
    description: 'public class Root { ... }',
    language: 'csharp',
    target: { kind: 'csharp', outputKind: 'class' }
  }
]

function getTypeScriptOptions(style: TypeScriptStyle): TypeScriptOptions {
  const config = vscode.workspace.getConfiguration('toolkit.jsonToType')
  return {
    style,
    semicolons: config.get<boolean>('typescript.semicolons', DEFAULT_TS_OPTIONS.semicolons),
    extractNestedTypes: config.get<boolean>('extractNestedTypes', DEFAULT_TS_OPTIONS.extractNestedTypes)
  }
}

function getCSharpOptions(outputKind: 'record' | 'class'): CSharpOptions {
  const config = vscode.workspace.getConfiguration('toolkit.jsonToType')
  return {
    outputKind,
    collectionType: config.get<CSharpCollectionType>(
      'csharp.collectionType',
      DEFAULT_CS_OPTIONS.collectionType
    ),
    recordStyle: config.get<CSharpRecordStyle>('csharp.recordStyle', DEFAULT_CS_OPTIONS.recordStyle),
    useNullable: config.get<boolean>('csharp.useNullable', DEFAULT_CS_OPTIONS.useNullable),
    extractNestedTypes: config.get<boolean>('extractNestedTypes', DEFAULT_CS_OPTIONS.extractNestedTypes)
  }
}

function generateFor(target: Target, schema: ReturnType<typeof inferSchema>, rootName: string): string {
  if (target.kind === 'typescript') {
    return generateTypeScript(schema, rootName, getTypeScriptOptions(target.style))
  }
  return generateCSharp(schema, rootName, getCSharpOptions(target.outputKind))
}

async function readSource(): Promise<{ source: 'selection' | 'clipboard'; text: string } | null> {
  const editor = vscode.window.activeTextEditor
  if (editor) {
    const selection = editor.selections.find(s => !s.isEmpty)
    if (selection) {
      return { source: 'selection', text: editor.document.getText(selection) }
    }
  }
  const clipboard = await vscode.env.clipboard.readText()
  if (clipboard.trim().length === 0) {
    vscode.window.showInformationMessage(
      'Toolkit: select JSON in the editor or copy it to the clipboard first.'
    )
    return null
  }
  return { source: 'clipboard', text: clipboard }
}

async function promptForRootName(language: 'typescript' | 'csharp'): Promise<string | null> {
  const input = await vscode.window.showInputBox({
    prompt: 'Name for the root type',
    value: 'Root',
    validateInput: value => {
      const v = value.trim()
      if (v.length === 0) {
        return 'Name cannot be empty.'
      }
      const candidate = isValidIdentifier(v) ? v : pascalCase(v)
      if (!isValidIdentifier(candidate)) {
        return 'Could not derive a valid identifier from this name.'
      }
      void language
      return null
    }
  })
  if (input === undefined) {
    return null
  }
  const v = input.trim()
  return isValidIdentifier(v) ? v : pascalCase(v)
}

async function applyTarget(target: Target): Promise<void> {
  const source = await readSource()
  if (!source) {
    return
  }

  let parsed: unknown
  try {
    parsed = parseJson(source.text)
  } catch (e) {
    if (e instanceof JsonParseError) {
      vscode.window.showWarningMessage(`Toolkit: invalid JSON — ${e.message}`)
      return
    }
    throw e
  }

  const rootName = await promptForRootName(target.kind === 'typescript' ? 'typescript' : 'csharp')
  if (!rootName) {
    return
  }

  const schema = inferSchema(parsed)
  const output = generateFor(target, schema, rootName)

  if (source.source === 'selection') {
    const editor = vscode.window.activeTextEditor!
    const selection = editor.selections.find(s => !s.isEmpty)!
    await editor.edit(builder => builder.replace(selection, output))
    return
  }

  const language = target.kind === 'typescript' ? 'typescript' : 'csharp'
  const doc = await vscode.workspace.openTextDocument({ content: output, language })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export function registerJsonToTypeCommands(context: vscode.ExtensionContext): void {
  for (const def of TARGETS) {
    context.subscriptions.push(vscode.commands.registerCommand(def.command, () => applyTarget(def.target)))
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.jsonToType', async () => {
      const items = TARGETS.map(def => ({
        label: def.label,
        description: def.description,
        def
      }))
      const picked = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        placeHolder: 'Generate types as...'
      })
      if (!picked) {
        return
      }
      await applyTarget(picked.def.target)
    })
  )
}
