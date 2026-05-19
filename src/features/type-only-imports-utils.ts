/**
 * Pure analyzer that finds whole-declaration imports that can be rewritten
 * as `import type ...`. No VS Code dependency — testable standalone.
 *
 * Heuristic (syntactic, no TypeChecker):
 *   - For each non-type-only `ImportDeclaration` with at least one binding,
 *     collect all binding local names (default, namespace, named).
 *   - For each binding, find every Identifier in the source file (outside
 *     the declaration itself) whose escapedText matches the binding name.
 *   - Classify each reference as type-only, value, or unknown by walking up
 *     the parent chain.
 *   - If every reference of every binding is type-only AND at least one
 *     reference exists, flag the declaration and produce the rewrite.
 *
 * Conservatively bails on:
 *   - Class `extends X` (X is a value)
 *   - Decorators, JSX, instanceof, call, new, property access, etc.
 *   - Any usage we can't confidently classify.
 *
 * This means we may miss valid conversions (false negatives) but should
 * not produce broken code (no false positives).
 */

import * as ts from 'typescript'
import * as path from 'path'

export interface TypeOnlyImportFinding {
  /** Absolute start offset of the import declaration in the source. */
  start: number
  /** Absolute end offset (exclusive) of the import declaration in the source. */
  end: number
  /** Offset of the `import` keyword (for diagnostic underline). */
  keywordStart: number
  /** End offset of the `import` keyword. */
  keywordEnd: number
  /** Rewritten declaration text (replaces [start, end)). */
  fixedText: string
  /** The original module specifier, useful for messages. */
  moduleSpecifier: string
}

/** Public entry point. */
export function findTypeOnlyImports(sourceText: string, fileName: string): TypeOnlyImportFinding[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    getScriptKind(fileName)
  )

  const findings: TypeOnlyImportFinding[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const clause = statement.importClause
    if (!clause) continue // `import 'side-effect'`
    if (clause.isTypeOnly) continue // already `import type ...`

    const bindings = collectBindingNames(clause)
    if (bindings.length === 0) continue

    const allTypeOnly = bindings.every(name => isOnlyUsedAsType(sourceFile, name, statement))
    if (!allTypeOnly) continue

    const start = statement.getStart(sourceFile)
    const end = statement.getEnd()
    const declText = sourceText.slice(start, end)
    if (!declText.startsWith('import')) continue // safety: parser quirk

    findings.push({
      start,
      end,
      keywordStart: start,
      keywordEnd: start + 'import'.length,
      fixedText: 'import type' + declText.slice('import'.length),
      moduleSpecifier: ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : ''
    })
  }

  return findings
}

/** Map .ts/.tsx/.cts/.mts to the right ScriptKind. */
export function getScriptKind(fileName: string): ts.ScriptKind {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.tsx': return ts.ScriptKind.TSX
    case '.jsx': return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs': return ts.ScriptKind.JS
    default: return ts.ScriptKind.TS
  }
}

function collectBindingNames(clause: ts.ImportClause): string[] {
  const names: string[] = []
  if (clause.name) {
    names.push(clause.name.text)
  }
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      names.push(clause.namedBindings.name.text)
    } else {
      for (const element of clause.namedBindings.elements) {
        // `import { Foo as Bar }` → local name is Bar
        if (element.isTypeOnly) {
          // Per-binding type-only; treat as already-handled (type-only usage)
          // We still need to track that the local name should not influence
          // the "all are type-only" check.
          continue
        }
        names.push(element.name.text)
      }
    }
  }
  return names
}

function isOnlyUsedAsType(
  sourceFile: ts.SourceFile,
  bindingName: string,
  declaration: ts.ImportDeclaration
): boolean {
  let referenceCount = 0
  let allTypeOnly = true

  const declStart = declaration.getStart(sourceFile)
  const declEnd = declaration.getEnd()

  const visit = (node: ts.Node): void => {
    // Skip the import declaration itself
    if (node.pos >= declStart && node.end <= declEnd) return

    if (ts.isIdentifier(node) && node.escapedText === bindingName) {
      // Skip binding-declaration identifiers (parameters, type params, etc.)
      // where this identifier is the declared name, not a reference.
      if (isDeclarationName(node)) {
        // Shadowing: don't count, but also bail — we can't trust subsequent
        // usages in the same scope to refer to the import.
        allTypeOnly = false
        return
      }

      referenceCount++
      const classification = classifyReference(node)
      if (classification !== 'type') {
        allTypeOnly = false
      }
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return allTypeOnly && referenceCount > 0
}

/**
 * True if `id` is the *name* of a declaration (param name, variable name,
 * function name, class name, type alias name, etc.), not a reference.
 */
function isDeclarationName(id: ts.Identifier): boolean {
  const parent = id.parent
  if (!parent) return false
  // Common declarations where `.name === id` means declaration site
  type WithName = { name?: ts.Node }
  const named = parent as WithName
  if (named.name === id) {
    return (
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isModuleDeclaration(parent)
    )
  }
  return false
}

type ReferenceKind = 'type' | 'value' | 'unknown'

/**
 * Walk up from an identifier reference and decide whether it is in a
 * type-only position.
 */
function classifyReference(id: ts.Identifier): ReferenceKind {
  let current: ts.Node = id
  let parent: ts.Node | undefined = id.parent

  while (parent) {
    // EntityName chain inside a type reference: `Foo.Bar.Baz` as TypeReference
    if (ts.isQualifiedName(parent)) {
      // The left side is what matters; we just keep walking up.
      current = parent
      parent = parent.parent
      continue
    }

    // `Foo` directly used as a type reference: `: Foo`, `Array<Foo>`, etc.
    if (ts.isTypeReferenceNode(parent)) return 'type'

    // `typeof Foo` used as a TYPE (e.g. `let x: typeof Foo`).
    // TypeQueryNode means it's the type-position `typeof`. Even though the
    // value is used at compile time, runtime never needs the import — so
    // import type is safe.
    if (ts.isTypeQueryNode(parent)) return 'type'

    // `import('mod').Foo` in a type position.
    if (ts.isImportTypeNode(parent)) return 'type'

    // `extends X` / `implements X` heritage clauses.
    if (ts.isExpressionWithTypeArguments(parent)) {
      // The grandparent is HeritageClause; great-grandparent is class or interface.
      const heritage = parent.parent
      if (heritage && ts.isHeritageClause(heritage)) {
        const decl = heritage.parent
        if (decl && ts.isInterfaceDeclaration(decl)) {
          // interface extends X → type
          return 'type'
        }
        if (decl && (ts.isClassDeclaration(decl) || ts.isClassExpression(decl))) {
          // class extends X → VALUE; class implements X → type
          if (heritage.token === ts.SyntaxKind.ImplementsKeyword) return 'type'
          return 'value'
        }
      }
      return 'unknown'
    }

    // Inside any TypeNode subtree
    if (ts.isTypeNode(parent)) return 'type'

    // typeof in an EXPRESSION context: `typeof Foo === 'function'` is value.
    if (ts.isTypeOfExpression(parent)) return 'value'

    // Definite value contexts
    if (
      ts.isCallExpression(parent) ||
      ts.isNewExpression(parent) ||
      ts.isPropertyAccessExpression(parent) ||
      ts.isElementAccessExpression(parent) ||
      ts.isBinaryExpression(parent) ||
      ts.isPrefixUnaryExpression(parent) ||
      ts.isPostfixUnaryExpression(parent) ||
      ts.isConditionalExpression(parent) ||
      ts.isAwaitExpression(parent) ||
      ts.isYieldExpression(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isSpreadAssignment(parent) ||
      ts.isObjectLiteralExpression(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isTaggedTemplateExpression(parent) ||
      ts.isTemplateSpan(parent) ||
      ts.isReturnStatement(parent) ||
      ts.isThrowStatement(parent) ||
      ts.isIfStatement(parent) ||
      ts.isWhileStatement(parent) ||
      ts.isDoStatement(parent) ||
      ts.isForStatement(parent) ||
      ts.isForInStatement(parent) ||
      ts.isForOfStatement(parent) ||
      ts.isSwitchStatement(parent) ||
      ts.isCaseClause(parent) ||
      ts.isExpressionStatement(parent) ||
      ts.isVariableDeclaration(parent) || // initializer
      ts.isPropertyAssignment(parent) || // value side
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isJsxOpeningElement(parent) ||
      ts.isJsxSelfClosingElement(parent) ||
      ts.isJsxClosingElement(parent) ||
      ts.isJsxExpression(parent) ||
      ts.isDecorator(parent)
    ) {
      // For PropertyAccess: the identifier must be the *object* side, not the
      // property name (which is never our concern since it isn't bound).
      if (ts.isPropertyAccessExpression(parent) && parent.name === current) {
        // Property name (rhs of `.`); not a binding reference.
        return 'unknown'
      }
      // PropertyAssignment: only the initializer is a value; the name side
      // doesn't reach here because of isDeclarationName.
      // ShorthandPropertyAssignment: `{ Foo }` — Foo is used as VALUE.
      return 'value'
    }

    // Type assertion / satisfies: the type side is a TypeNode (handled above);
    // the expression side is value.
    if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
      // The TypeNode child is already covered by isTypeNode(parent) for that branch.
      // If we got here, current is the expression side → value.
      return 'value'
    }

    // Step up and continue
    current = parent
    parent = parent.parent
  }

  return 'unknown'
}
