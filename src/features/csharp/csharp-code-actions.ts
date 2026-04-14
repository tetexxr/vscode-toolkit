import * as vscode from 'vscode'

// Matches auto-properties including generics, nullable, arrays, and init accessors
const PROPERTY_RE =
  /^\s*(?:public|private|protected|internal)\s+(?:(?:static|virtual|override|abstract|sealed|new|required|readonly)\s+)*(.+?)\s+(\w+)\s*\{\s*get;\s*(?:(?:private|protected|internal)\s+)?(?:set|init)?;?\s*\}/gm

const CLASS_RE = /(?:public|internal|private|protected)\s+(?:(?:static|partial|sealed|abstract)\s+)*class\s+(\w+)/g

export class CSharpCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor]

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const text = document.getText()
    const properties = findProperties(text)
    if (properties.length === 0) return []

    const className = findClassName(text, document.offsetAt(range.start))
    if (!className) return []

    const actions: vscode.CodeAction[] = []

    const ctorAction = new vscode.CodeAction('Generate constructor from properties', vscode.CodeActionKind.Refactor)
    ctorAction.edit = buildConstructorEdit(document, className, properties, false)
    actions.push(ctorAction)

    const exprAction = new vscode.CodeAction(
      'Generate expression-bodied constructor from properties',
      vscode.CodeActionKind.Refactor
    )
    exprAction.edit = buildConstructorEdit(document, className, properties, true)
    actions.push(exprAction)

    return actions
  }
}

interface PropertyInfo {
  type: string
  name: string
  end: number
}

function findProperties(text: string): PropertyInfo[] {
  const props: PropertyInfo[] = []
  PROPERTY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PROPERTY_RE.exec(text)) !== null) {
    props.push({
      type: match[1].trim(),
      name: match[2],
      end: match.index + match[0].length
    })
  }
  return props
}

function findClassName(text: string, offset: number): string | null {
  let lastClass: string | null = null
  CLASS_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CLASS_RE.exec(text)) !== null) {
    if (match.index <= offset) {
      lastClass = match[1]
    }
  }
  return lastClass
}

function buildConstructorEdit(
  document: vscode.TextDocument,
  className: string,
  properties: PropertyInfo[],
  expressionBodied: boolean
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit()
  const text = document.getText()

  const config = vscode.workspace.getConfiguration('toolkit.csharp')
  const useThis = config.get<boolean>('useThisForCtorAssignments', true)
  const prefix = config.get<string>('privateMemberPrefix', '')

  // Detect indentation context
  const isFileScopedNs = /^namespace\s+\S+;/m.test(text)
  const editorConfig = vscode.workspace.getConfiguration('editor', document.uri)
  const tabSize = editorConfig.get<number>('tabSize', 4)
  const indent = ' '.repeat(tabSize)
  const memberIndent = isFileScopedNs ? indent : indent + indent
  const bodyIndent = memberIndent + indent

  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const params = properties.map(p => `${p.type} ${toCamelCase(p.name)}`).join(', ')

  // Insert after the last property
  const lastPropEnd = properties[properties.length - 1].end
  const insertPos = document.positionAt(lastPropEnd)

  let ctor: string
  if (expressionBodied) {
    if (properties.length === 1) {
      const p = properties[0]
      const target = useThis ? `this.${p.name}` : `${prefix}${p.name}`
      ctor =
        `${eol}${eol}${memberIndent}public ${className}(${params})` +
        `${eol}${memberIndent}${indent}=> ${target} = ${toCamelCase(p.name)};`
    } else {
      const targets = properties.map(p => (useThis ? `this.${p.name}` : `${prefix}${p.name}`)).join(', ')
      const values = properties.map(p => toCamelCase(p.name)).join(', ')
      ctor =
        `${eol}${eol}${memberIndent}public ${className}(${params})` +
        `${eol}${memberIndent}${indent}=> (${targets}) = (${values});`
    }
  } else {
    const assignments = properties
      .map(p => {
        const target = useThis ? `this.${p.name}` : `${prefix}${p.name}`
        return `${bodyIndent}${target} = ${toCamelCase(p.name)};`
      })
      .join(eol)
    ctor =
      `${eol}${eol}${memberIndent}public ${className}(${params})` +
      `${eol}${memberIndent}{${eol}${assignments}${eol}${memberIndent}}`
  }

  edit.insert(document.uri, insertPos, ctor)
  return edit
}

function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}
