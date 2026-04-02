import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { TEMPLATE_MAP, REQUIRED_USINGS, OPTIONAL_USINGS } from './csharp-types'
import { getProjectInfo, calculateNamespace, isNet6Plus } from './csharp-project'
import { buildTemplate } from './csharp-template'
import { CSharpCodeActionProvider } from './csharp-code-actions'

const COMMANDS: [string, string][] = [
  ['createClass', 'Class'],
  ['createInterface', 'Interface'],
  ['createEnum', 'Enum'],
  ['createStruct', 'Struct'],
  ['createRecord', 'Record'],
  ['createRecordStruct', 'RecordStruct'],
  ['createController', 'Controller'],
  ['createApiController', 'ApiController'],
  ['createRazorPage', 'RazorPage'],
  ['createBlazorComponent', 'BlazorComponent'],
  ['createBlazorPage', 'BlazorPage'],
  ['createMinimalApi', 'MinimalApi'],
  ['createMiddleware', 'Middleware'],
  ['createXUnitTest', 'XUnit'],
  ['createNUnitTest', 'NUnit'],
  ['createMSTest', 'MSTest'],
  ['createResx', 'Resx'],
]

const PLACEHOLDERS: Record<string, string> = {
  Interface: 'IMyInterface',
  Controller: 'HomeController',
  ApiController: 'ItemsController',
  RazorPage: 'IndexModel',
  BlazorComponent: 'MyComponent',
  BlazorPage: 'MyPage',
  MinimalApi: 'ItemsEndpoints',
  Middleware: 'MyMiddleware',
  XUnit: 'MyClassTests',
  NUnit: 'MyClassTests',
  MSTest: 'MyClassTests',
  Resx: 'Resources',
}

export function registerCSharpCommands(context: vscode.ExtensionContext) {
  for (const [commandName, templateKey] of COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`toolkit.csharp.${commandName}`, (uri?: vscode.Uri) =>
        createCSharpFile(context.extensionPath, templateKey, uri),
      ),
    )
  }

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('csharp', new CSharpCodeActionProvider(), {
      providedCodeActionKinds: CSharpCodeActionProvider.providedCodeActionKinds,
    }),
  )
}

async function createCSharpFile(extensionPath: string, templateKey: string, uri?: vscode.Uri): Promise<void> {
  // Determine target directory
  const targetDir = resolveTargetDir(uri)
  if (!targetDir) {
    vscode.window.showErrorMessage('No folder selected.')
    return
  }

  // Ask for name
  const placeholder = PLACEHOLDERS[templateKey] || `My${templateKey}`
  const input = await vscode.window.showInputBox({
    prompt: `Enter ${templateKey} name`,
    placeHolder: placeholder,
    validateInput: (value) => {
      if (!value?.trim()) return 'Name is required'
      if (!/^[A-Za-z_]\w*$/.test(value.trim())) return 'Invalid C# identifier'
      return null
    },
  })
  if (!input) return

  const className = input.trim()

  // Get project info and namespace
  const projectInfo = getProjectInfo(targetDir)
  const namespace = calculateNamespace(targetDir, projectInfo)

  // Read settings
  const config = vscode.workspace.getConfiguration('toolkit.csharp')
  const fileConfig = vscode.workspace.getConfiguration('files')
  const editorConfig = vscode.workspace.getConfiguration('editor')

  const tabSize = editorConfig.get<number>('tabSize', 4)
  const eolSetting = fileConfig.get<string>('eol', '\n')
  const eol = eolSetting === '\r\n' ? '\r\n' : '\n'

  const useFileScopedNamespace = config.get<boolean>('useFileScopedNamespace', true)
  const includeUsings = config.get<boolean>('includeUsings', true)
  const filterImplicitUsings = config.get<boolean>('filterImplicitUsings', true)

  // Get template definitions
  const templates = TEMPLATE_MAP[templateKey]
  if (!templates) return

  // Determine if file-scoped namespaces apply
  const isModernFramework = projectInfo?.targetFramework ? isNet6Plus(projectInfo.targetFramework) : true

  // Create each file from template
  let firstFilePath: string | null = null
  let cursorPosition: [number, number] | null = null

  for (const tmpl of templates) {
    const filePath = path.join(targetDir, className + tmpl.extension)

    if (fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`File already exists: ${path.basename(filePath)}`)
      return
    }

    const applyFileScopedNs = useFileScopedNamespace && isModernFramework && tmpl.extension.endsWith('.cs')

    const result = buildTemplate({
      extensionPath,
      templateFile: tmpl.template,
      className,
      namespace,
      requiredUsings: REQUIRED_USINGS[templateKey] || [],
      optionalUsings: includeUsings ? [...OPTIONAL_USINGS] : [],
      useFileScopedNamespace: applyFileScopedNs,
      implicitUsings: filterImplicitUsings && projectInfo ? projectInfo.implicitUsings : [],
      usingsRemove: projectInfo?.usingsRemove || [],
      eol,
      tabSize,
    })

    fs.writeFileSync(filePath, result.content)

    if (!firstFilePath) {
      firstFilePath = filePath
      cursorPosition = result.cursorPosition
    }
  }

  // Open the first file and position cursor
  if (firstFilePath) {
    const doc = await vscode.workspace.openTextDocument(firstFilePath)
    const editor = await vscode.window.showTextDocument(doc)
    if (cursorPosition) {
      const pos = new vscode.Position(cursorPosition[0], cursorPosition[1])
      editor.selection = new vscode.Selection(pos, pos)
      editor.revealRange(new vscode.Range(pos, pos))
    }
  }
}

function resolveTargetDir(uri?: vscode.Uri): string | null {
  if (uri) {
    try {
      const stat = fs.statSync(uri.fsPath)
      return stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath)
    } catch {
      return path.dirname(uri.fsPath)
    }
  }

  const editor = vscode.window.activeTextEditor
  if (editor) {
    return path.dirname(editor.document.uri.fsPath)
  }

  const folders = vscode.workspace.workspaceFolders
  return folders?.[0]?.uri.fsPath ?? null
}
