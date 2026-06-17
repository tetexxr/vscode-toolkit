import { strict as assert } from 'assert'
import { jsonToYaml, parseYaml, yamlToJson } from '../../../../src/features/editing/convert/yaml-utils'
import { TransformError } from '../../../../src/features/editing/convert/transform-utils'

describe('jsonToYaml', () => {
  it('should convert a flat object', () => {
    const yaml = jsonToYaml('{"name": "alice", "age": 30, "admin": true, "nick": null}')
    assert.equal(yaml, ['name: alice', 'age: 30', 'admin: true', 'nick: null'].join('\n'))
  })

  it('should nest objects with 2-space indentation', () => {
    const yaml = jsonToYaml('{"server": {"host": "localhost", "port": 8080}}')
    assert.equal(yaml, ['server:', '  host: localhost', '  port: 8080'].join('\n'))
  })

  it('should convert arrays of scalars', () => {
    const yaml = jsonToYaml('{"tags": ["a", "b"]}')
    assert.equal(yaml, ['tags:', '  - a', '  - b'].join('\n'))
  })

  it('should use compact notation for arrays of objects', () => {
    const yaml = jsonToYaml('{"users": [{"id": 1, "name": "ana"}, {"id": 2}]}')
    assert.equal(yaml, ['users:', '  - id: 1', '    name: ana', '  - id: 2'].join('\n'))
  })

  it('should emit empty collections inline', () => {
    assert.equal(jsonToYaml('{"a": [], "b": {}}'), ['a: []', 'b: {}'].join('\n'))
  })

  it('should quote strings that would parse as other YAML types', () => {
    const yaml = jsonToYaml('{"a": "true", "b": "null", "c": "123", "d": "yes"}')
    assert.equal(yaml, ["a: 'true'", "b: 'null'", "c: '123'", "d: 'yes'"].join('\n'))
  })

  it('should quote strings with special characters', () => {
    assert.equal(jsonToYaml('{"a": "hello: world"}'), "a: 'hello: world'")
    assert.equal(jsonToYaml('{"a": "it\'s"}'), "a: 'it''s'")
  })

  it('should JSON-quote strings with newlines', () => {
    assert.equal(jsonToYaml('{"a": "line1\\nline2"}'), 'a: "line1\\nline2"')
  })

  it('should handle top-level arrays and scalars', () => {
    assert.equal(jsonToYaml('[1, 2]'), '- 1\n- 2')
    assert.equal(jsonToYaml('"hello"'), 'hello')
    assert.equal(jsonToYaml('42'), '42')
  })

  it('should throw a TransformError for invalid JSON', () => {
    assert.throws(() => jsonToYaml('not json'), TransformError)
  })
})

describe('parseYaml / yamlToJson', () => {
  it('should parse a flat mapping with typed scalars', () => {
    assert.deepEqual(parseYaml('name: alice\nage: 30\nadmin: true\nnick: null\nscore: 1.5'), {
      name: 'alice',
      age: 30,
      admin: true,
      nick: null,
      score: 1.5
    })
  })

  it('should parse nested mappings by indentation', () => {
    assert.deepEqual(parseYaml('server:\n  host: localhost\n  port: 8080'), {
      server: { host: 'localhost', port: 8080 }
    })
  })

  it('should parse block sequences', () => {
    assert.deepEqual(parseYaml('tags:\n  - a\n  - b'), { tags: ['a', 'b'] })
  })

  it('should parse sequences at the same indent as their key', () => {
    assert.deepEqual(parseYaml('tags:\n- a\n- b'), { tags: ['a', 'b'] })
  })

  it('should parse compact mappings inside sequences', () => {
    assert.deepEqual(parseYaml('users:\n  - id: 1\n    name: ana\n  - id: 2'), {
      users: [{ id: 1, name: 'ana' }, { id: 2 }]
    })
  })

  it('should parse quoted strings and keys', () => {
    assert.deepEqual(parseYaml(`'my key': 'it''s'\nother: "a\\nb"`), {
      'my key': "it's",
      other: 'a\nb'
    })
  })

  it('should parse flow collections', () => {
    assert.deepEqual(parseYaml('list: [1, two, true]\nmap: {a: 1, b: x}'), {
      list: [1, 'two', true],
      map: { a: 1, b: 'x' }
    })
  })

  it('should skip comments and blank lines', () => {
    assert.deepEqual(parseYaml('# header\n\na: 1 # inline\n# trailing'), { a: 1 })
  })

  it('should treat empty values and ~ as null', () => {
    assert.deepEqual(parseYaml('a:\nb: ~\nc: null'), { a: null, b: null, c: null })
  })

  it('should accept a single leading document marker', () => {
    assert.deepEqual(parseYaml('---\na: 1'), { a: 1 })
  })

  it('should return null for empty input', () => {
    assert.equal(parseYaml(''), null)
    assert.equal(parseYaml('# just a comment'), null)
  })

  it('should reject unsupported constructs with clear errors', () => {
    assert.throws(() => parseYaml('a: |\n  block'), /Block scalars/)
    assert.throws(() => parseYaml('a: &anchor x'), /anchors/)
    assert.throws(() => parseYaml('a: !!str x'), /tags/)
    assert.throws(() => parseYaml('---\na: 1\n---\nb: 2'), /Multiple YAML documents/)
    assert.throws(() => parseYaml('a:\n\tb: 1'), /Tabs/)
  })

  it('should emit pretty JSON from yamlToJson', () => {
    assert.equal(yamlToJson('a: 1\nb:\n  - x'), JSON.stringify({ a: 1, b: ['x'] }, null, 2))
  })
})

describe('JSON ⇄ YAML round-trips', () => {
  const SAMPLES = [
    '{"name":"alice","age":30,"admin":true,"nick":null}',
    '{"server":{"host":"localhost","ports":[80,443],"tls":{"enabled":true}}}',
    '{"users":[{"id":1,"tags":["a","b"]},{"id":2,"tags":[]}]}',
    '{"weird":{"true":"false","key with spaces":"it\'s: tricky","multi":"a\\nb"}}',
    '[1,"two",{"three":3},[4]]',
    '{"empty_obj":{},"empty_arr":[],"zero":0,"neg":-1.5}'
  ]

  for (const sample of SAMPLES) {
    it(`should round-trip ${sample.slice(0, 40)}…`, () => {
      const value: unknown = JSON.parse(sample)
      assert.deepEqual(parseYaml(jsonToYaml(sample)), value)
    })
  }
})
