import { strict as assert } from 'assert'
import { findTypeOnlyImports } from '../../src/features/type-only-imports-utils'

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

  describe('named-specifier (per-binding) findings', () => {
    it('should flag a single type-only binding in a mixed declaration', () => {
      const source = [
        `import { foo, Bar } from './mod'`,
        `foo()`,
        `let x: Bar = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].kind, 'named-specifier')
      assert.equal(findings[0].bindingName, 'Bar')
      assert.equal(findings[0].fixedText, 'type Bar')
    })

    it('should flag multiple type-only bindings in a mixed declaration', () => {
      const source = [
        `import { foo, Bar, Baz } from './mod'`,
        `foo()`,
        `let x: Bar = null as any`,
        `let y: Baz = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 2)
      assert.deepEqual(
        findings.map(f => f.bindingName).sort(),
        ['Bar', 'Baz']
      )
      assert.ok(findings.every(f => f.kind === 'named-specifier'))
    })

    it('should preserve the `as Alias` form when fixing', () => {
      const source = [
        `import { foo, Bar as Renamed } from './mod'`,
        `foo()`,
        `let x: Renamed = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].bindingName, 'Renamed')
      assert.equal(findings[0].fixedText, 'type Bar as Renamed')
    })

    it('should flag named bindings when only the default is a value', () => {
      const source = [
        `import Foo, { Bar } from './mod'`,
        `Foo()`,
        `let x: Bar = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].kind, 'named-specifier')
      assert.equal(findings[0].bindingName, 'Bar')
    })

    it('should not flag bindings already marked with `type`', () => {
      const source = [
        `import { foo, type Bar } from './mod'`,
        `foo()`,
        `let x: Bar = null as any`
      ].join('\n')

      assert.equal(run(source).length, 0)
    })

    it('should flag unmarked bindings even when others are already marked', () => {
      const source = [
        `import { foo, type Bar, Baz } from './mod'`,
        `foo()`,
        `let x: Bar = null as any`,
        `let y: Baz = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].kind, 'named-specifier')
      assert.equal(findings[0].bindingName, 'Baz')
      assert.equal(findings[0].fixedText, 'type Baz')
    })

    it('should keep using whole-declaration when the whole import is type-only', () => {
      const source = [
        `import { Bar, Baz } from './mod'`,
        `let x: Bar = null as any`,
        `let y: Baz = null as any`
      ].join('\n')

      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].kind, 'whole-declaration')
    })

    it('should report the binding name range for the diagnostic underline', () => {
      const source = `import { foo, Bar } from './mod'\nfoo()\nlet x: Bar`
      const findings = run(source)
      assert.equal(findings.length, 1)
      assert.equal(source.slice(findings[0].keywordStart, findings[0].keywordEnd), 'Bar')
    })
  })

})
