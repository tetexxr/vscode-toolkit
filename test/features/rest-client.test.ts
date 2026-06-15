import { strict as assert } from 'assert'
import {
  buildCurl,
  environmentNames,
  mergeEnvironmentVariables,
  parseEnvironmentFile,
  shellQuote,
  parseHttpFile,
  interpolate,
  formatResponse,
  inferLanguageFromContentType,
  findHeader,
  findRequestAtLine,
  tryPrettyJson,
  parseBodyFileRef,
  parseDotenv,
  addHistoryEntry,
  truncateForHistory,
  describeHistoryEntry,
  groupHistoryByRequest,
  historyStatusKind,
  formatBytes,
  summarizeGroupStatuses,
  escapeHtml,
  embedJsonInScript,
  buildResponseDetailHtml,
  type ResponseHistoryEntry
} from '../../src/features/rest-client-utils'

describe('parseHttpFile — basic', () => {
  it('should parse a single request with headers and body', () => {
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

  it('should split multiple requests on ### separators and use the names given', () => {
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

  it('should assign auto-names when the separator has no label', () => {
    const text = '###\nGET https://a\n###\nGET https://b'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].name, 'Request 1')
    assert.equal(parsed.requests[1].name, 'Request 2')
  })

  it('should handle a request without a body', () => {
    const text = 'GET https://api.example.com/users\nAccept: application/json'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].body, '')
    assert.deepEqual(parsed.requests[0].headers, [{ name: 'Accept', value: 'application/json' }])
  })

  it('should capture file-level variables', () => {
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

  it('should ignore single-# comments outside of a body', () => {
    const text = ['# this is a comment', 'GET https://x', '# another'].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests.length, 1)
    assert.equal(parsed.requests[0].method, 'GET')
  })

  it('should treat lines after the headers blank line as body and preserve newlines', () => {
    const text = ['POST https://x', 'Content-Type: text/plain', '', 'line 1', 'line 2', ''].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].body, 'line 1\nline 2')
  })

  it('should strip the HTTP version from the request line', () => {
    const text = 'GET https://x HTTP/1.1'
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].url, 'https://x')
  })

  it('should track line ranges for each request', () => {
    const text = ['GET https://a', 'Accept: */*', '', '### second', 'GET https://b'].join('\n')
    const parsed = parseHttpFile(text)
    assert.equal(parsed.requests[0].startLine, 0)
    assert.equal(parsed.requests[0].endLine, 1)
    assert.equal(parsed.requests[1].startLine, 4)
    assert.equal(parsed.requests[1].endLine, 4)
  })

  it('should handle CRLF input', () => {
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

  it('should return the request whose range contains the line', () => {
    assert.equal(findRequestAtLine(parsed, 0)!.url, 'https://a')
    assert.equal(findRequestAtLine(parsed, 1)!.url, 'https://a')
    assert.equal(findRequestAtLine(parsed, 4)!.url, 'https://b')
    assert.equal(findRequestAtLine(parsed, 6)!.url, 'https://b')
  })

  it('should return undefined when the line is outside any request', () => {
    assert.equal(findRequestAtLine(parsed, 3), undefined)
  })
})

describe('interpolate', () => {
  it('should replace user-defined variables', () => {
    assert.equal(interpolate('hello {{name}}', { name: 'world' }), 'hello world')
  })

  it('should leave unknown variables in place', () => {
    assert.equal(interpolate('hello {{missing}}', {}), 'hello {{missing}}')
  })

  it('should resolve $timestamp using the injected now value', () => {
    assert.equal(interpolate('t={{$timestamp}}', {}, { now: 1700000000000 }), 't=1700000000')
  })

  it('should resolve $randomUUID using the injected generator on every occurrence', () => {
    let i = 0
    const out = interpolate('{{$randomUUID}}-{{$randomUUID}}', {}, { nextUuid: () => `uuid-${++i}` })
    assert.equal(out, 'uuid-1-uuid-2')
  })

  it('should resolve $datetime iso8601', () => {
    const now = Date.UTC(2024, 2, 15, 12, 34, 56, 789)
    assert.equal(interpolate('{{$datetime iso8601}}', {}, { now }), '2024-03-15T12:34:56.789Z')
  })

  it('should preserve the original text when the template has no placeholders', () => {
    assert.equal(interpolate('static text', { unused: 'x' }), 'static text')
  })

  it('should resolve $randomInt within the requested range using the injected random', () => {
    assert.equal(interpolate('{{$randomInt 10 20}}', {}, { random: () => 0 }), '10')
    assert.equal(interpolate('{{$randomInt 10 20}}', {}, { random: () => 0.999999 }), '20')
    assert.equal(interpolate('{{$randomInt 10 20}}', {}, { random: () => 0.5 }), '15')
  })

  it('should clamp $randomInt when max < min', () => {
    assert.equal(interpolate('{{$randomInt 20 10}}', {}, { random: () => 0.5 }), '20')
  })

  it('should resolve $processEnv from the injected environment', () => {
    assert.equal(interpolate('{{$processEnv API_HOST}}', {}, { processEnv: { API_HOST: 'h' } }), 'h')
    assert.equal(interpolate('{{$processEnv MISSING}}', {}, { processEnv: {} }), '')
  })

  it('should resolve $dotenv from the injected map', () => {
    assert.equal(interpolate('{{$dotenv TOKEN}}', {}, { dotenv: { TOKEN: 'secret' } }), 'secret')
    assert.equal(interpolate('{{$dotenv MISSING}}', {}, { dotenv: {} }), '')
  })

  it('should resolve $datetime rfc1123 and unix', () => {
    const now = Date.UTC(2024, 2, 15, 12, 34, 56, 789)
    assert.equal(interpolate('{{$datetime rfc1123}}', {}, { now }), 'Fri, 15 Mar 2024 12:34:56 GMT')
    assert.equal(interpolate('{{$datetime unix}}', {}, { now }), String(Math.floor(now / 1000)))
  })

  it('should apply offsets to $timestamp and $datetime', () => {
    const now = Date.UTC(2024, 2, 15, 12, 0, 0, 0)
    assert.equal(interpolate('{{$timestamp -1 d}}', {}, { now }), String(Math.floor(now / 1000) - 86400))
    assert.equal(interpolate('{{$timestamp 2 h}}', {}, { now }), String(Math.floor(now / 1000) + 7200))
    assert.equal(interpolate('{{$datetime iso8601 1 d}}', {}, { now }), '2024-03-16T12:00:00.000Z')
  })
})

describe('parseBodyFileRef', () => {
  it('should recognize a raw < file directive', () => {
    assert.deepEqual(parseBodyFileRef('< ./body.json'), {
      path: './body.json',
      interpolateVariables: false,
      encoding: 'utf-8'
    })
  })

  it('should recognize an interpolated <@ file directive', () => {
    assert.deepEqual(parseBodyFileRef('<@ ./body.json'), {
      path: './body.json',
      interpolateVariables: true,
      encoding: 'utf-8'
    })
  })

  it('should honor an explicit encoding on <@', () => {
    assert.deepEqual(parseBodyFileRef('<@latin1 data.txt'), {
      path: 'data.txt',
      interpolateVariables: true,
      encoding: 'latin1'
    })
  })

  it('should fall back to utf-8 for an unknown encoding', () => {
    assert.equal(parseBodyFileRef('<@bogus data.txt')?.encoding, 'utf-8')
  })

  it('should not treat inline JSON or XML bodies as file refs', () => {
    assert.equal(parseBodyFileRef('{"a":1}'), null)
    assert.equal(parseBodyFileRef('<?xml version="1.0"?>\n<root/>'), null)
    assert.equal(parseBodyFileRef('<root>hi</root>'), null)
  })

  it('should reject a directive with no path', () => {
    assert.equal(parseBodyFileRef('<   '), null)
  })
})

describe('parseDotenv', () => {
  it('should parse KEY=value lines, comments, export, and quotes', () => {
    const env = parseDotenv(
      ['# comment', 'TOKEN=abc123', 'export HOST="example.com"', "NAME='Alice'", '', 'EMPTY=', 'bad line'].join('\n')
    )
    assert.deepEqual(env, {
      TOKEN: 'abc123',
      HOST: 'example.com',
      NAME: 'Alice',
      EMPTY: ''
    })
  })
})

describe('inferLanguageFromContentType / findHeader', () => {
  it('should infer JSON / XML / HTML / JavaScript', () => {
    assert.equal(inferLanguageFromContentType('application/json'), 'json')
    assert.equal(inferLanguageFromContentType('application/xml'), 'xml')
    assert.equal(inferLanguageFromContentType('text/html; charset=utf-8'), 'html')
    assert.equal(inferLanguageFromContentType('application/javascript'), 'javascript')
  })

  it('should fall back to plaintext for unknown or missing content types', () => {
    assert.equal(inferLanguageFromContentType('application/octet-stream'), 'plaintext')
    assert.equal(inferLanguageFromContentType(undefined), 'plaintext')
  })

  it('should match headers case-insensitively in findHeader', () => {
    assert.equal(findHeader([{ name: 'Content-Type', value: 'x' }], 'content-type'), 'x')
    assert.equal(findHeader([{ name: 'Content-Type', value: 'x' }], 'CONTENT-TYPE'), 'x')
    assert.equal(findHeader([{ name: 'A', value: 'b' }], 'c'), undefined)
  })
})

describe('formatResponse', () => {
  it('should build an HTTP-style preview with status line, headers, timing and pretty JSON body', () => {
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

  it('should leave non-JSON bodies untouched', () => {
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
  it('should pretty-print valid JSON with a 2-space indent', () => {
    assert.equal(tryPrettyJson('{"a":1,"b":[1,2]}'), '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
  })

  it('should return the input unchanged on parse error', () => {
    assert.equal(tryPrettyJson('not json'), 'not json')
  })
})

describe('parseEnvironmentFile', () => {
  it('should parse environments with string, number, and boolean values', () => {
    const parsed = parseEnvironmentFile(
      JSON.stringify({ dev: { baseUrl: 'http://localhost', port: 3000, debug: true } })
    )
    assert.deepEqual(parsed, { dev: { baseUrl: 'http://localhost', port: '3000', debug: 'true' } })
  })

  it('should skip non-object environments and non-scalar values', () => {
    const parsed = parseEnvironmentFile(
      JSON.stringify({ dev: { ok: 'yes', nested: { no: 1 } }, broken: 'not an object', list: [1] })
    )
    assert.deepEqual(parsed, { dev: { ok: 'yes' } })
  })

  it('should return null for invalid or non-object JSON', () => {
    assert.equal(parseEnvironmentFile('not json'), null)
    assert.equal(parseEnvironmentFile('[1,2]'), null)
    assert.equal(parseEnvironmentFile('"str"'), null)
  })
})

describe('environmentNames / mergeEnvironmentVariables', () => {
  const pub = { dev: { a: '1', b: '2' }, prod: { a: '9' } }
  const priv = { dev: { b: 'secret', c: '3' }, local: { x: '1' } }

  it('should union names with public order first', () => {
    assert.deepEqual(environmentNames(pub, priv), ['dev', 'prod', 'local'])
    assert.deepEqual(environmentNames(null, priv), ['dev', 'local'])
    assert.deepEqual(environmentNames(null, null), [])
  })

  it('should merge with the private file overriding key by key', () => {
    assert.deepEqual(mergeEnvironmentVariables(pub, priv, 'dev'), { a: '1', b: 'secret', c: '3' })
    assert.deepEqual(mergeEnvironmentVariables(pub, priv, 'prod'), { a: '9' })
    assert.deepEqual(mergeEnvironmentVariables(pub, priv, 'missing'), {})
  })
})

describe('buildCurl / shellQuote', () => {
  it('should build a GET without -X', () => {
    assert.equal(buildCurl({ method: 'GET', url: 'https://api.test/users', headers: [], body: '' }), "curl 'https://api.test/users'")
  })

  it('should include method, headers, and body', () => {
    const curl = buildCurl({
      method: 'POST',
      url: 'https://api.test/users',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: 'Bearer tok' }
      ],
      body: '{"name":"Alice"}'
    })
    assert.equal(
      curl,
      [
        "curl -X POST 'https://api.test/users'",
        "-H 'Content-Type: application/json'",
        "-H 'Authorization: Bearer tok'",
        `--data '{"name":"Alice"}'`
      ].join(' \\\n  ')
    )
  })

  it('should escape single quotes for the shell', () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'")
    const curl = buildCurl({ method: 'POST', url: 'https://x.test', headers: [], body: "{'a':1}" })
    assert.ok(curl.includes("--data '{'\\''a'\\'':1}'"))
  })

  it('should send a body file with --data @path', () => {
    const curl = buildCurl({
      method: 'POST',
      url: 'https://api.test/upload',
      headers: [],
      body: '',
      bodyFile: '/abs/path/body.json'
    })
    assert.ok(curl.includes("--data '@/abs/path/body.json'"))
  })
})

describe('response history', () => {
  const entry = (id: string, timestamp: number, over: Partial<ResponseHistoryEntry> = {}): ResponseHistoryEntry => ({
    id,
    method: 'GET',
    url: 'https://api.test/x',
    status: 200,
    statusText: 'OK',
    durationMs: 12,
    timestamp,
    headers: [],
    body: '',
    bodyTruncated: false,
    ...over
  })

  it('should prepend newest-first and cap at max', () => {
    let list: ResponseHistoryEntry[] = []
    list = addHistoryEntry(list, entry('a', 1), 2)
    list = addHistoryEntry(list, entry('b', 2), 2)
    list = addHistoryEntry(list, entry('c', 3), 2)
    assert.deepEqual(
      list.map(e => e.id),
      ['c', 'b']
    )
  })

  it('should return an empty list when max is 0 (history disabled)', () => {
    assert.deepEqual(addHistoryEntry([entry('a', 1)], entry('b', 2), 0), [])
  })

  it('should truncate a body past the cap and flag it', () => {
    assert.deepEqual(truncateForHistory('abcdef', 3), { body: 'abc', truncated: true })
    assert.deepEqual(truncateForHistory('ab', 3), { body: 'ab', truncated: false })
  })

  it('should describe an entry with status, duration and relative time', () => {
    const now = 1_000_000
    const d = describeHistoryEntry(entry('a', now - 60_000, { method: 'POST', durationMs: 42 }), now)
    assert.equal(d.label, 'POST https://api.test/x')
    assert.equal(d.description, '200 OK · 42ms · 1 minute ago')
  })

  it('should note a truncated body in the description', () => {
    const now = 1_000_000
    const d = describeHistoryEntry(entry('a', now, { bodyTruncated: true }), now)
    assert.ok(d.description.includes('body truncated'))
  })

  it('should describe a failed request with its error instead of a status', () => {
    const now = 1_000_000
    const d = describeHistoryEntry(
      entry('a', now, { status: 0, statusText: 'Request failed', durationMs: 5, error: 'getaddrinfo ENOTFOUND' }),
      now
    )
    assert.equal(d.description, 'Failed: getaddrinfo ENOTFOUND · 5ms · just now')
  })

  it('should group entries by method + url, keeping each group newest-first', () => {
    const history = [
      entry('c', 3, { method: 'GET', url: 'https://api.test/users' }),
      entry('b', 2, { method: 'POST', url: 'https://api.test/users' }),
      entry('a', 1, { method: 'GET', url: 'https://api.test/users' })
    ]
    const groups = groupHistoryByRequest(history)
    assert.equal(groups.length, 2)
    // Groups are ordered by their most-recent entry: GET (c, newest) before POST (b).
    assert.equal(groups[0].key, 'GET https://api.test/users')
    assert.deepEqual(
      groups[0].entries.map(e => e.id),
      ['c', 'a']
    )
    assert.equal(groups[1].key, 'POST https://api.test/users')
    assert.deepEqual(
      groups[1].entries.map(e => e.id),
      ['b']
    )
  })

  it('should return no groups for an empty history', () => {
    assert.deepEqual(groupHistoryByRequest([]), [])
  })

  it('should bucket a status into the right kind for icon/color', () => {
    assert.equal(historyStatusKind(entry('a', 1, { status: 200 })), 'success')
    assert.equal(historyStatusKind(entry('a', 1, { status: 204 })), 'success')
    assert.equal(historyStatusKind(entry('a', 1, { status: 301 })), 'redirect')
    assert.equal(historyStatusKind(entry('a', 1, { status: 404 })), 'clientError')
    assert.equal(historyStatusKind(entry('a', 1, { status: 500 })), 'serverError')
    assert.equal(historyStatusKind(entry('a', 1, { status: 0, error: 'ENOTFOUND' })), 'failed')
  })

  it('should format byte sizes in human units', () => {
    assert.equal(formatBytes(undefined), '')
    assert.equal(formatBytes(-1), '')
    assert.equal(formatBytes(0), '0 B')
    assert.equal(formatBytes(820), '820 B')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(1024 * 1024 * 3), '3 MB')
    assert.equal(formatBytes(1024 * 20), '20 KB')
  })

  it('should summarize a group as a status breakdown', () => {
    const entries = [
      entry('c', 3, { status: 200 }),
      entry('b', 2, { status: 200 }),
      entry('a', 1, { status: 500 })
    ]
    assert.equal(summarizeGroupStatuses(entries), '2×200 1×500')
  })

  it('should mark failed entries as ERR in the breakdown', () => {
    const entries = [entry('a', 1, { status: 0, error: 'boom' }), entry('b', 2, { status: 200 })]
    assert.equal(summarizeGroupStatuses(entries), '1×ERR 1×200')
  })

  it('should escape HTML special characters', () => {
    assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })

  it('should build a detail HTML document with status, url, body and nonce-gated script', () => {
    const e = entry('a', 1_000, {
      method: 'POST',
      url: 'https://api.test/users',
      status: 201,
      statusText: 'Created',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body: '{"id":1}',
      bodyBytes: 8
    })
    const html = buildResponseDetailHtml(e, { cspSource: 'vscode-resource:', nonce: 'abc123' })
    assert.ok(html.includes('POST'))
    assert.ok(html.includes('https://api.test/users'))
    assert.ok(html.includes('201 Created'))
    assert.ok(html.includes('Content-Type'))
    // JSON body is pretty-printed in the embedded data.
    assert.ok(html.includes('nonce="abc123"'))
    assert.ok(html.includes('Content-Security-Policy'))
    // The injected URL must not break out of the attribute/script context.
    assert.ok(!html.includes('<script>alert'))
  })

  it('should escape a malicious URL in the detail HTML', () => {
    const e = entry('a', 1_000, { url: 'https://x/"><script>alert(1)</script>' })
    const html = buildResponseDetailHtml(e, { cspSource: 'vscode-resource:', nonce: 'n' })
    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })

  it('should neutralize a </script> in the body so it cannot break out of the inline script', () => {
    const e = entry('a', 1_000, { body: 'before</script><script>alert(1)</script>after' })
    const html = buildResponseDetailHtml(e, { cspSource: 'vscode-resource:', nonce: 'n' })
    // The only real closing tag is our own script's; the body's are escaped.
    assert.equal(html.split('</script>').length, 2)
    assert.ok(!html.includes('<script>alert(1)'))
  })

  it('embedJsonInScript should escape < and line separators', () => {
    assert.equal(embedJsonInScript('a</b>'), '"a\\u003c/b>"')
    assert.equal(embedJsonInScript('x y z'), '"x\\u2028y\\u2029z"')
  })
})
