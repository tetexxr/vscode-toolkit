import { strict as assert } from 'assert'
import {
  parseHttpFile,
  interpolate,
  formatResponse,
  inferLanguageFromContentType,
  findHeader,
  findRequestAtLine,
  tryPrettyJson
} from '../../src/features/rest-client-utils'

describe('parseHttpFile — basic', () => {
  it('parses a single request with headers and body', () => {
    const text = [
      'POST https://api.example.com/users',
      'Content-Type: application/json',
      'Authorization: Bearer abc',
      '',
      '{',
      '  "name": "Alice"',
      '}'
    ].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests.length, 1)
    const req = parsed.requests[0]
    assert.equal(req.method, 'POST')
    assert.equal(req.url, 'https://api.example.com/users')
    assert.deepEqual(req.headers, [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: 'Bearer abc' }
    ])
    assert.equal(req.body, '{\n  "name": "Alice"\n}')
  })

  it('splits multiple requests on ### separators and uses the names given', () => {
    const text = [
      '### Get users',
      'GET https://api.example.com/users',
      '',
      '### Create user',
      'POST https://api.example.com/users',
      'Content-Type: application/json',
      '',
      '{}'
    ].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests.length, 2)
    assert.equal(parsed.requests[0].name, 'Get users')
    assert.equal(parsed.requests[1].name, 'Create user')
    assert.equal(parsed.requests[0].method, 'GET')
    assert.equal(parsed.requests[1].body, '{}')
  })

  it('assigns auto-names when the separator has no label', () => {
    const text = '###\nGET https://a\n###\nGET https://b'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].name, 'Request 1')
    assert.equal(parsed.requests[1].name, 'Request 2')
  })

  it('handles a request without a body', () => {
    const text = 'GET https://api.example.com/users\nAccept: application/json'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].body, '')
    assert.deepEqual(parsed.requests[0].headers, [{ name: 'Accept', value: 'application/json' }])
  })

  it('captures file-level variables', () => {
    const text = [
      '@baseUrl = https://api.example.com',
      '@token = abc123',
      '',
      'GET {{baseUrl}}/users'
    ].join('\n')
    const parsed = parseHttpFile(text)
    assert.deepEqual(
      parsed.variables.map(v => ({ name: v.name, value: v.value })),
      [
        { name: 'baseUrl', value: 'https://api.example.com' },
        { name: 'token', value: 'abc123' }
      ]
    )
    assert.equal(parsed.requests[0].url, '{{baseUrl}}/users')
  })

  it('ignores single-# comments outside of body', () => {
    const text = ['# this is a comment', 'GET https://x', '# another'].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests.length, 1)
    assert.equal(parsed.requests[0].method, 'GET')
  })

  it('treats lines after the headers blank line as body, preserving newlines', () => {
    const text = ['POST https://x', 'Content-Type: text/plain', '', 'line 1', 'line 2', ''].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].body, 'line 1\nline 2')
  })

  it('strips HTTP version from the request line', () => {
    const text = 'GET https://x HTTP/1.1'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].url, 'https://x')
  })

  it('tracks line ranges for each request', () => {
    const text = ['GET https://a', 'Accept: */*', '', '### second', 'GET https://b'].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].startLine, 0)
    assert.equal(parsed.requests[0].endLine, 1)
    assert.equal(parsed.requests[1].startLine, 4)
    assert.equal(parsed.requests[1].endLine, 4)
  })

  it('handles CRLF input', () => {
    const text = 'GET https://x\r\nAccept: */*\r\n'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests.length, 1)
    assert.equal(parsed.requests[0].headers[0].value, '*/*')
  })
})

describe('findRequestAtLine', () => {
  const parsed = parseHttpFile(
    ['GET https://a', 'Accept: */*', '', '### second', 'GET https://b', '', '{}'].join('\n')
  )

  it('returns the request whose range contains the line', () => {
    assert.equal(findRequestAtLine(parsed, 0)!.url, 'https://a')
    assert.equal(findRequestAtLine(parsed, 1)!.url, 'https://a')
    assert.equal(findRequestAtLine(parsed, 4)!.url, 'https://b')
    assert.equal(findRequestAtLine(parsed, 6)!.url, 'https://b')
  })

  it('returns undefined when the line is outside any request', () => {
    assert.equal(findRequestAtLine(parsed, 3), undefined)
  })
})

describe('interpolate', () => {
  it('replaces user-defined variables', () => {
    assert.equal(interpolate('hello {{name}}', { name: 'world' }), 'hello world')
  })

  it('leaves unknown variables in place', () => {
    assert.equal(interpolate('hello {{missing}}', {}), 'hello {{missing}}')
  })

  it('resolves $timestamp using the injected now value', () => {
    assert.equal(interpolate('t={{$timestamp}}', {}, { now: 1700000000000 }), 't=1700000000')
  })

  it('resolves $randomUUID using the injected generator (called per occurrence)', () => {
    let i = 0
    const out = interpolate('{{$randomUUID}}-{{$randomUUID}}', {}, { nextUuid: () => `uuid-${++i}` })
    assert.equal(out, 'uuid-1-uuid-2')
  })

  it('resolves $datetime iso8601', () => {
    const now = Date.UTC(2024, 2, 15, 12, 34, 56, 789)
    assert.equal(interpolate('{{$datetime iso8601}}', {}, { now }), '2024-03-15T12:34:56.789Z')
  })

  it('preserves the original text when the template has no placeholders', () => {
    assert.equal(interpolate('static text', { unused: 'x' }), 'static text')
  })
})

describe('inferLanguageFromContentType / findHeader', () => {
  it('infers JSON / XML / HTML / JavaScript', () => {
    assert.equal(inferLanguageFromContentType('application/json'), 'json')
    assert.equal(inferLanguageFromContentType('application/xml'), 'xml')
    assert.equal(inferLanguageFromContentType('text/html; charset=utf-8'), 'html')
    assert.equal(inferLanguageFromContentType('application/javascript'), 'javascript')
  })

  it('falls back to plaintext for unknown / missing content types', () => {
    assert.equal(inferLanguageFromContentType('application/octet-stream'), 'plaintext')
    assert.equal(inferLanguageFromContentType(undefined), 'plaintext')
  })

  it('findHeader is case-insensitive', () => {
    assert.equal(findHeader([{ name: 'Content-Type', value: 'x' }], 'content-type'), 'x')
    assert.equal(findHeader([{ name: 'Content-Type', value: 'x' }], 'CONTENT-TYPE'), 'x')
    assert.equal(findHeader([{ name: 'A', value: 'b' }], 'c'), undefined)
  })
})

describe('formatResponse', () => {
  it('builds an HTTP-style preview with status line, headers, timing and pretty JSON body', () => {
    const body = '{"x":1}'
    const out = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body,
      durationMs: 42
    })
    assert.ok(out.startsWith('HTTP/1.1 200 OK'))
    assert.ok(out.includes('Content-Type: application/json'))
    assert.ok(out.includes('X-Toolkit-Time: 42ms'))
    assert.ok(out.includes('"x": 1'))
  })

  it('leaves non-JSON bodies untouched', () => {
    const out = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: [{ name: 'Content-Type', value: 'text/plain' }],
      body: 'plain text body',
      durationMs: 5
    })
    assert.ok(out.endsWith('plain text body'))
  })
})

describe('tryPrettyJson', () => {
  it('pretty-prints valid JSON with 2-space indent', () => {
    assert.equal(tryPrettyJson('{"a":1,"b":[1,2]}'), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
  })

  it('returns the input unchanged on parse error', () => {
    assert.equal(tryPrettyJson('not json'), 'not json')
  })
})
