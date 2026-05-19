import { strict as assert } from 'assert'
import {
  findTypeOnlyImports,
  isIgnoredModule
} from '../../src/features/type-only-imports-utils'

function run(source: string, fileName = 'test.ts') {
  return findTypeOnlyImports(source, fileName)
}

describe('findTypeOnlyImports', () => {
  it('should flag a named import used only as a type annotation', () => {
    const source = [
      `import { Foo } from './foo'`,
      `function bar(x: Foo): void {}`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type { Foo } from './foo'`)
    assert.equal(findings[0].moduleSpecifier, './foo')
  })

  it('should flag a named import used only in a generic position', () => {
    const source = [
      `import { Foo } from './foo'`,
      `let xs: Array<Foo> = []`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type { Foo } from './foo'`)
  })

  it('should not flag when the import is also used as a value (call)', () => {
    const source = [
      `import { Foo } from './foo'`,
      `function bar(x: Foo): void { Foo() }`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should not flag when the import is used as `new X()`', () => {
    const source = [
      `import { Foo } from './foo'`,
      `const f = new Foo()`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should not flag when the import is a class used as `extends X`', () => {
    const source = [
      `import { Foo } from './foo'`,
      `class Bar extends Foo {}`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should flag an import used only as `implements X`', () => {
    const source = [
      `import { Foo } from './foo'`,
      `class Bar implements Foo {}`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type { Foo } from './foo'`)
  })

  it('should flag an interface heritage `extends X`', () => {
    const source = [
      `import { Foo } from './foo'`,
      `interface Bar extends Foo {}`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should flag `typeof X` in a type position', () => {
    const source = [
      `import { Foo } from './foo'`,
      `let x: typeof Foo`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should not flag `typeof X` in a value position', () => {
    const source = [
      `import { Foo } from './foo'`,
      `if (typeof Foo === 'function') {}`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should flag a default import used only as a type', () => {
    const source = [
      `import Foo from './foo'`,
      `let x: Foo = null as any`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type Foo from './foo'`)
  })

  it('should flag a namespace import used only as a type', () => {
    const source = [
      `import * as Foo from './foo'`,
      `let x: Foo.Bar = null as any`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type * as Foo from './foo'`)
  })

  it('should not flag mixed default + named where one is a value', () => {
    const source = [
      `import Foo, { Bar } from './foo'`,
      `let x: Foo = null as any`,
      `Bar()`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should flag mixed default + named when both are type-only', () => {
    const source = [
      `import Foo, { Bar } from './foo'`,
      `let x: Foo = null as any`,
      `let y: Bar = null as any`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].fixedText, `import type Foo, { Bar } from './foo'`)
  })

  it('should ignore side-effect imports', () => {
    const source = `import './setup'`
    assert.equal(run(source).length, 0)
  })

  it('should ignore already-`import type` declarations', () => {
    const source = [
      `import type { Foo } from './foo'`,
      `let x: Foo = null as any`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should skip when the import name has no references at all', () => {
    const source = `import { Foo } from './foo'`
    // We could flag this as unused, but the rule is about type-only
    // conversion; with zero references we conservatively skip.
    assert.equal(run(source).length, 0)
  })

  it('should not flag when the binding is shadowed by a local declaration', () => {
    const source = [
      `import { Foo } from './foo'`,
      `function bar(): void {`,
      `  const Foo = 5`,
      `  console.log(Foo)`,
      `}`,
      `let x: Foo = null as any`
    ].join('\n')

    // Conservative: shadowing detected → skip.
    assert.equal(run(source).length, 0)
  })

  it('should flag an `as Type` cast', () => {
    const source = [
      `import { Foo } from './foo'`,
      `const x = (null as unknown) as Foo`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should flag a satisfies / type assertion in expression-only contexts', () => {
    const source = [
      `import { Foo } from './foo'`,
      `const x = {} as Foo`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should report keywordStart/end pointing at `import`', () => {
    const source = `  import { Foo } from './foo'\nlet x: Foo`
    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(source.slice(findings[0].keywordStart, findings[0].keywordEnd), 'import')
  })

  it('should handle multiple imports in the same file independently', () => {
    const source = [
      `import { A } from './a'`,
      `import { B } from './b'`,
      `let x: A = null as any`,
      `B()`
    ].join('\n')

    const findings = run(source)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].moduleSpecifier, './a')
  })

  it('should flag imports used in property/element type positions', () => {
    const source = [
      `import { Foo } from './foo'`,
      `type Bar = { x: Foo; y: Foo[] }`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should not flag a decorator usage', () => {
    const source = [
      `import { Foo } from './foo'`,
      `@Foo`,
      `class Bar {}`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should not flag a JSX element usage', () => {
    const source = [
      `import { Foo } from './foo'`,
      `const x = <Foo />`
    ].join('\n')

    assert.equal(run(source, 'test.tsx').length, 0)
  })

  it('should flag qualified-name type reference `Foo.Bar`', () => {
    const source = [
      `import * as Foo from './foo'`,
      `let x: Foo.Bar = null as any`
    ].join('\n')

    assert.equal(run(source).length, 1)
  })

  it('should not flag a property access value usage `Foo.bar()`', () => {
    const source = [
      `import * as Foo from './foo'`,
      `Foo.bar()`
    ].join('\n')

    assert.equal(run(source).length, 0)
  })

  it('should preserve trailing semicolons / whitespace verbatim', () => {
    const source = `import { Foo } from './foo';\nlet x: Foo`
    const findings = run(source)
    assert.equal(findings.length, 1)
    // The semicolon is part of the rewritten range only if it is part of the
    // ImportDeclaration node. TS treats the semicolon as part of the statement.
    assert.equal(findings[0].fixedText, `import type { Foo } from './foo';`)
  })

  describe('ignoredModules option', () => {
    it('should skip declarations whose specifier matches exactly', () => {
      const source = [
        `import * as vscode from 'vscode'`,
        `let ctx: vscode.ExtensionContext`
      ].join('\n')

      assert.equal(findTypeOnlyImports(source, 'a.ts').length, 1)
      assert.equal(
        findTypeOnlyImports(source, 'a.ts', { ignoredModules: ['vscode'] }).length,
        0
      )
    })

    it('should skip declarations matched by a trailing /* prefix glob', () => {
      const source = [
        `import { Foo } from '@types/node'`,
        `let x: Foo`
      ].join('\n')

      assert.equal(
        findTypeOnlyImports(source, 'a.ts', { ignoredModules: ['@types/*'] }).length,
        0
      )
    })

    it('should still flag specifiers not in the ignore list', () => {
      const source = [
        `import * as vscode from 'vscode'`,
        `import { Bar } from './bar'`,
        `let ctx: vscode.ExtensionContext`,
        `let b: Bar`
      ].join('\n')

      const findings = findTypeOnlyImports(source, 'a.ts', { ignoredModules: ['vscode'] })
      assert.equal(findings.length, 1)
      assert.equal(findings[0].moduleSpecifier, './bar')
    })

    it('should treat an empty ignore list as no exclusions', () => {
      const source = [
        `import * as vscode from 'vscode'`,
        `let ctx: vscode.ExtensionContext`
      ].join('\n')

      assert.equal(findTypeOnlyImports(source, 'a.ts', { ignoredModules: [] }).length, 1)
    })
  })
})

describe('isIgnoredModule', () => {
  it('should match exact specifiers', () => {
    assert.equal(isIgnoredModule('vscode', ['vscode']), true)
    assert.equal(isIgnoredModule('react', ['vscode']), false)
  })

  it('should match trailing /* prefix globs', () => {
    assert.equal(isIgnoredModule('@types/node', ['@types/*']), true)
    assert.equal(isIgnoredModule('@types/node/path', ['@types/*']), true)
    assert.equal(isIgnoredModule('@typesnode', ['@types/*']), false)
    assert.equal(isIgnoredModule('@types', ['@types/*']), false)
  })

  it('should support multiple patterns', () => {
    assert.equal(isIgnoredModule('vscode', ['react', 'vscode']), true)
    assert.equal(isIgnoredModule('lodash', ['react', '@types/*']), false)
  })

  it('should return false for an empty pattern list', () => {
    assert.equal(isIgnoredModule('vscode', []), false)
  })
})
