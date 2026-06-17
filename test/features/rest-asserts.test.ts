import { strict as assert } from 'assert'
import { evalJsonPath, evaluateAssertions, parseHttpFile, type ResponseLike } from '../../src/features/rest-client-utils'

function response(overrides: Partial<ResponseLike> = {}): ResponseLike {
  return {
    status: 200,
    statusText: 'OK',
    headers: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
    body: '{"name":"Leanne","id":5,"tags":["a","b"]}',
    durationMs: 1,
    ...overrides
  }
}

describe('parseHttpFile — asserts', () => {
  it('should attach @assert directives placed after the request', () => {
    const text = ['GET https://x.test/users/1', '', '# @assert status == 200', '# @assert body $.name == Leanne'].join('\n')
    const parsed = parseHttpFile(text)
    assert.deepEqual(parsed.requests[0].asserts, ['status == 200', 'body $.name == Leanne'])
  })

  it('should attach directives placed above the request', () => {
    const text = ['# @assert status == 200', 'GET https://x.test/'].join('\n')
    assert.deepEqual(parseHttpFile(text).requests[0].asserts, ['status == 200'])
  })

  it('should support // comment style', () => {
    const text = ['GET https://x.test/', '', '// @assert status == 200'].join('\n')
    assert.deepEqual(parseHttpFile(text).requests[0].asserts, ['status == 200'])
  })

  it('should not leak asserts across the ### separator', () => {
    const text = ['GET https://x.test/a', '# @assert status == 200', '###', 'GET https://x.test/b'].join('\n')
    const parsed = parseHttpFile(text)
    assert.deepEqual(parsed.requests[0].asserts, ['status == 200'])
    assert.deepEqual(parsed.requests[1].asserts, [])
  })

  it('should leave a request without asserts as an empty array', () => {
    assert.deepEqual(parseHttpFile('GET https://x.test/').requests[0].asserts, [])
  })
})

describe('evalJsonPath', () => {
  it('should resolve nested keys and array indices', () => {
    assert.equal(evalJsonPath({ a: { b: [10, 20] } }, '$.a.b[1]'), 20)
  })

  it('should resolve bracket-quoted keys', () => {
    assert.equal(evalJsonPath({ 'a-b': 1 }, '$["a-b"]'), 1)
  })

  it('should return the whole value for $', () => {
    assert.deepEqual(evalJsonPath({ a: 1 }, '$'), { a: 1 })
  })

  it('should return undefined for missing paths', () => {
    assert.equal(evalJsonPath({ a: 1 }, '$.x'), undefined)
    assert.equal(evalJsonPath({ a: 1 }, '$.a.b'), undefined)
  })
})

describe('evaluateAssertions', () => {
  const run = (expr: string, overrides?: Partial<ResponseLike>) => evaluateAssertions([expr], response(overrides))[0]

  it('should evaluate status comparisons', () => {
    assert.equal(run('status == 200').ok, true)
    assert.equal(run('status >= 200').ok, true)
    assert.equal(run('status == 201').ok, false)
    assert.equal(run('status != 500').ok, true)
  })

  it('should evaluate header assertions', () => {
    assert.equal(run('header Content-Type contains application/json').ok, true)
    assert.equal(run('header Content-Type matches charset').ok, true)
    assert.equal(run('header X-Missing == y').ok, false)
  })

  it('should evaluate body JSONPath assertions', () => {
    assert.equal(run('body $.name == Leanne').ok, true)
    assert.equal(run('body $.name == "Leanne"').ok, true)
    assert.equal(run('body $.id == 5').ok, true)
    assert.equal(run('body $.id > 3').ok, true)
    assert.equal(run('body $.tags[0] == a').ok, true)
    assert.equal(run('body $.name == Nope').ok, false)
    assert.equal(run('body $.missing == x').ok, false)
  })

  it('should evaluate whole-body assertions', () => {
    assert.equal(run('body contains Leanne').ok, true)
    assert.equal(run('body matches "Lea.."').ok, true)
  })

  it('should fail body-path assertions when the body is not JSON', () => {
    assert.equal(run('body $.name == x', { body: 'not json' }).ok, false)
  })

  it('should include the actual value in a failure message', () => {
    assert.match(run('status == 404').message, /got 200/)
  })

  it('should flag an unrecognized assertion', () => {
    assert.equal(run('frobnicate the thing').ok, false)
  })
})
