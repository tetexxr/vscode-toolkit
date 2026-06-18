import { strict as assert } from 'assert'
import { evaluateQuery } from '../../../src/features/workspace/json-playground-utils'

const DATA = JSON.stringify({
  users: [
    { name: 'Alice', age: 34, active: true },
    { name: 'Bob', age: 22, active: false },
    { name: 'Carol', age: 41, active: true }
  ],
  count: 3
})

describe('evaluateQuery', () => {
  it('should report empty when there is no JSON', () => {
    const r = evaluateQuery('   ', '$.foo')
    assert.equal(r.empty, true)
    assert.equal(r.error, null)
  })

  it('should pretty-print the JSON when the query is empty', () => {
    const r = evaluateQuery('{"a":1}', '   ')
    assert.equal(r.error, null)
    assert.equal(r.type, 'object')
    assert.equal(r.count, 1)
    assert.equal(r.output, '{\n  "a": 1\n}')
  })

  it('should report invalid JSON with a message', () => {
    const r = evaluateQuery('{ not json', '$')
    assert.match(r.error ?? '', /^Invalid JSON:/)
    assert.equal(r.output, '')
  })

  it('should evaluate a simple property access', () => {
    const r = evaluateQuery(DATA, '$.count')
    assert.equal(r.error, null)
    assert.equal(r.type, 'number')
    assert.equal(r.output, '3')
  })

  it('should evaluate filter + map and report array length', () => {
    const r = evaluateQuery(DATA, '$.users.filter(u => u.active).map(u => u.name)')
    assert.equal(r.error, null)
    assert.equal(r.type, 'array')
    assert.equal(r.count, 2)
    assert.equal(r.output, '[\n  "Alice",\n  "Carol"\n]')
  })

  it('should expose the data as `data` too', () => {
    assert.equal(evaluateQuery(DATA, 'data.count').output, '3')
  })

  it('should support multi-statement queries with an explicit return', () => {
    const r = evaluateQuery(DATA, 'const ages = $.users.map(u => u.age); return Math.max(...ages)')
    assert.equal(r.error, null)
    assert.equal(r.output, '41')
  })

  it('should report runtime errors with name and message', () => {
    const r = evaluateQuery(DATA, '$.nope.deeper')
    assert.match(r.error ?? '', /TypeError/)
  })

  it('should render undefined results', () => {
    const r = evaluateQuery(DATA, '$.missing')
    assert.equal(r.error, null)
    assert.equal(r.output, 'undefined')
    assert.equal(r.type, 'undefined')
  })

  it('should handle object results with a key count', () => {
    const r = evaluateQuery(DATA, '$.users[0]')
    assert.equal(r.type, 'object')
    assert.equal(r.count, 3)
  })

  it('should survive circular references in the result', () => {
    const r = evaluateQuery('{}', 'const a = {}; a.self = a; return a')
    assert.equal(r.error, null)
    assert.match(r.output, /\[Circular\]/)
  })

  it('should not collapse null into object', () => {
    const r = evaluateQuery('{"x":null}', '$.x')
    assert.equal(r.type, 'null')
    assert.equal(r.output, 'null')
  })
})
