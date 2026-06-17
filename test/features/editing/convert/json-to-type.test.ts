import { strict as assert } from 'assert'
import {
  DEFAULT_CS_OPTIONS,
  DEFAULT_TS_OPTIONS,
  generateCSharp,
  generateTypeScript,
  inferSchema,
  isValidIdentifier,
  JsonParseError,
  mergeSchemas,
  parseJson,
  pascalCase,
  singularize
} from '../../../../src/features/editing/convert/json-to-type-utils'

describe('parseJson', () => {
  it('should parse valid JSON', () => {
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 })
  })

  it('should throw JsonParseError on invalid JSON', () => {
    assert.throws(() => parseJson('not json'), JsonParseError)
  })
})

describe('inferSchema', () => {
  it('should infer primitive kinds', () => {
    assert.equal(inferSchema('hello').kind, 'string')
    assert.equal(inferSchema(42).kind, 'number')
    assert.equal(inferSchema(true).kind, 'boolean')
    assert.equal((inferSchema(null) as { kind: string }).kind, 'unknown')
    assert.equal((inferSchema(null) as { nullable: boolean }).nullable, true)
  })

  it('should distinguish integer from float numbers', () => {
    const intSchema = inferSchema(42) as Extract<ReturnType<typeof inferSchema>, { kind: 'number' }>
    assert.equal(intSchema.integer, true)
    assert.equal(intSchema.large, false)
    const floatSchema = inferSchema(3.14) as Extract<ReturnType<typeof inferSchema>, { kind: 'number' }>
    assert.equal(floatSchema.integer, false)
  })

  it('should mark integers exceeding Int32 as large', () => {
    const big = inferSchema(3_000_000_000) as Extract<ReturnType<typeof inferSchema>, { kind: 'number' }>
    assert.equal(big.large, true)
    assert.equal(big.integer, true)
  })

  it('should infer homogeneous arrays', () => {
    const s = inferSchema([1, 2, 3]) as Extract<ReturnType<typeof inferSchema>, { kind: 'array' }>
    assert.equal(s.kind, 'array')
    assert.equal(s.element.kind, 'number')
  })

  it('should merge null elements into nullable arrays', () => {
    const s = inferSchema([1, null, 3]) as Extract<ReturnType<typeof inferSchema>, { kind: 'array' }>
    assert.equal(s.element.kind, 'number')
    assert.equal((s.element as { nullable: boolean }).nullable, true)
  })

  it('should degrade mixed-kind arrays to unknown', () => {
    const s = inferSchema([1, 'a']) as Extract<ReturnType<typeof inferSchema>, { kind: 'array' }>
    assert.equal(s.element.kind, 'unknown')
  })

  it('should infer object fields', () => {
    const s = inferSchema({ a: 1, b: 'x' }) as Extract<ReturnType<typeof inferSchema>, { kind: 'object' }>
    assert.equal(s.kind, 'object')
    assert.equal(s.fields.length, 2)
    assert.equal(s.fields[0].key, 'a')
    assert.equal(s.fields[1].schema.kind, 'string')
  })
})

describe('mergeSchemas for objects', () => {
  it('should mark fields missing from one side as optional', () => {
    const a = inferSchema({ id: 1, name: 'a' })
    const b = inferSchema({ id: 2 })
    const merged = mergeSchemas(a, b) as Extract<ReturnType<typeof inferSchema>, { kind: 'object' }>
    const nameField = merged.fields.find(f => f.key === 'name')!
    assert.equal(nameField.optional, true)
    const idField = merged.fields.find(f => f.key === 'id')!
    assert.equal(idField.optional, false)
  })

  it('should mark fields that are null in one shape as nullable', () => {
    const a = inferSchema({ id: 1, name: 'a' })
    const b = inferSchema({ id: 2, name: null })
    const merged = mergeSchemas(a, b) as Extract<ReturnType<typeof inferSchema>, { kind: 'object' }>
    const nameField = merged.fields.find(f => f.key === 'name')!
    assert.equal(nameField.schema.kind, 'string')
    assert.equal((nameField.schema as { nullable: boolean }).nullable, true)
  })
})

describe('pascalCase / singularize / isValidIdentifier', () => {
  it('should PascalCase various inputs', () => {
    assert.equal(pascalCase('user'), 'User')
    assert.equal(pascalCase('user_name'), 'UserName')
    assert.equal(pascalCase('user-name'), 'UserName')
    assert.equal(pascalCase('camelCase'), 'CamelCase')
  })

  it('should singularize common plurals', () => {
    assert.equal(singularize('users'), 'user')
    assert.equal(singularize('Orders'), 'Order')
    assert.equal(singularize('parties'), 'party')
    assert.equal(singularize('boxes'), 'box')
  })

  it('should keep already-singular nouns intact', () => {
    assert.equal(singularize('user'), 'user')
    assert.equal(singularize('status'), 'status')
    assert.equal(singularize('is'), 'is')
  })

  it('should accept only JS-style identifiers in isValidIdentifier', () => {
    assert.equal(isValidIdentifier('Foo'), true)
    assert.equal(isValidIdentifier('_a'), true)
    assert.equal(isValidIdentifier('1abc'), false)
    assert.equal(isValidIdentifier('with space'), false)
    assert.equal(isValidIdentifier(''), false)
  })
})

describe('generateTypeScript', () => {
  it('should emit an interface for the root and nested objects', () => {
    const schema = inferSchema({
      id: 1,
      name: 'Alice',
      tags: ['admin', 'user'],
      address: { street: 'Main', zip: 12345 }
    })
    const out = generateTypeScript(schema, 'User', DEFAULT_TS_OPTIONS)
    assert.match(out, /interface User \{/)
    assert.match(out, /interface Address \{/)
    assert.match(out, /id: number;/)
    assert.match(out, /tags: string\[\];/)
    assert.match(out, /address: Address;/)
    assert.match(out, /street: string;/)
  })

  it('should mark merged-missing fields as optional', () => {
    const schema = mergeSchemas(inferSchema({ id: 1, name: 'a' }), inferSchema({ id: 2 }))
    const out = generateTypeScript(schema, 'Item', DEFAULT_TS_OPTIONS)
    assert.match(out, /name\?: string/)
  })

  it('should emit nullable as " | null"', () => {
    const schema = inferSchema({ value: null })
    const out = generateTypeScript(schema, 'Item', DEFAULT_TS_OPTIONS)
    assert.match(out, /value: unknown \| null/)
  })

  it('should support the type-alias style', () => {
    const schema = inferSchema({ id: 1 })
    const out = generateTypeScript(schema, 'Item', { ...DEFAULT_TS_OPTIONS, style: 'type' })
    assert.match(out, /type Item = \{/)
    assert.match(out, /^};?\s*$/m)
  })

  it('should omit semicolons when configured', () => {
    const schema = inferSchema({ id: 1, name: 'a' })
    const out = generateTypeScript(schema, 'Item', { ...DEFAULT_TS_OPTIONS, semicolons: false })
    assert.doesNotMatch(out, /;/)
  })

  it('should quote non-identifier keys', () => {
    const schema = inferSchema({ 'first-name': 'A', 'last-name': 'B' })
    const out = generateTypeScript(schema, 'User', DEFAULT_TS_OPTIONS)
    assert.match(out, /"first-name":/)
    assert.match(out, /"last-name":/)
  })

  it('should singularize nested array item names', () => {
    const schema = inferSchema({ users: [{ id: 1, name: 'a' }] })
    const out = generateTypeScript(schema, 'Root', DEFAULT_TS_OPTIONS)
    assert.match(out, /interface User \{/)
    assert.match(out, /users: User\[\];/)
  })

  it('should treat arrays of unknown as unknown[]', () => {
    const schema = inferSchema({ items: [] })
    const out = generateTypeScript(schema, 'Root', DEFAULT_TS_OPTIONS)
    assert.match(out, /items: unknown\[\]/)
  })

  it('should emit a parenthesized union for nullable element arrays', () => {
    const schema = inferSchema({ values: [1, null, 2] })
    const out = generateTypeScript(schema, 'Root', DEFAULT_TS_OPTIONS)
    assert.match(out, /values: \(number \| null\)\[\]/)
  })
})

describe('generateCSharp', () => {
  it('should emit a positional record for the root and nested objects', () => {
    const schema = inferSchema({
      id: 1,
      name: 'Alice',
      tags: ['admin', 'user'],
      address: { street: 'Main', zip: 12345 }
    })
    const out = generateCSharp(schema, 'User', DEFAULT_CS_OPTIONS)
    assert.match(out, /public record User\(/)
    assert.match(out, /public record Address\(string Street, int Zip\);/)
    assert.match(out, /int Id, string Name/)
    assert.match(out, /IReadOnlyList<string> Tags/)
    assert.match(out, /Address Address/)
  })

  it('should use long for integers exceeding Int32', () => {
    const schema = inferSchema({ id: 3_000_000_000 })
    const out = generateCSharp(schema, 'Big', DEFAULT_CS_OPTIONS)
    assert.match(out, /long Id/)
  })

  it('should use double for floats', () => {
    const schema = inferSchema({ price: 3.14 })
    const out = generateCSharp(schema, 'Item', DEFAULT_CS_OPTIONS)
    assert.match(out, /double Price/)
  })

  it('should mark nullable fields with "?"', () => {
    const schema = inferSchema({ name: null as unknown as string })
    const out = generateCSharp(schema, 'Item', DEFAULT_CS_OPTIONS)
    assert.match(out, /object\? Name/)
  })

  it('should emit a class with auto-properties when output kind is class', () => {
    const schema = inferSchema({ id: 1, name: 'a' })
    const out = generateCSharp(schema, 'Item', { ...DEFAULT_CS_OPTIONS, outputKind: 'class' })
    assert.match(out, /public class Item/)
    assert.match(out, /public int Id \{ get; set; \}/)
    assert.match(out, /public string Name \{ get; set; \}/)
  })

  it('should emit records with declared properties when configured', () => {
    const schema = inferSchema({ id: 1 })
    const out = generateCSharp(schema, 'Item', { ...DEFAULT_CS_OPTIONS, recordStyle: 'withProperties' })
    assert.match(out, /public record Item/)
    assert.match(out, /public int Id \{ get; init; \}/)
  })

  it('should support the List<T> collection wrapper', () => {
    const schema = inferSchema({ tags: ['a', 'b'] })
    const out = generateCSharp(schema, 'Item', { ...DEFAULT_CS_OPTIONS, collectionType: 'List' })
    assert.match(out, /List<string> Tags/)
  })

  it('should support the array collection wrapper', () => {
    const schema = inferSchema({ tags: ['a'] })
    const out = generateCSharp(schema, 'Item', { ...DEFAULT_CS_OPTIONS, collectionType: 'array' })
    assert.match(out, /string\[\] Tags/)
  })

  it('should singularize nested array item names', () => {
    const schema = inferSchema({ users: [{ id: 1 }] })
    const out = generateCSharp(schema, 'Root', DEFAULT_CS_OPTIONS)
    assert.match(out, /public record User\(int Id\);/)
    assert.match(out, /IReadOnlyList<User> Users/)
  })
})
