import { strict as assert } from 'assert'
import {
  curlToHttpRequest,
  parseCurl,
  tokenizeCurl
} from '../../../src/features/workspace/rest-client-utils'

describe('tokenizeCurl', () => {
  it('should split a simple command on whitespace', () => {
    assert.deepEqual(tokenizeCurl('curl https://example.com'), ['curl', 'https://example.com'])
  })

  it('should keep single-quoted values intact', () => {
    assert.deepEqual(tokenizeCurl("curl -H 'Accept: application/json'"), ['curl', '-H', 'Accept: application/json'])
  })

  it('should join backslash-newline line continuations', () => {
    const input = "curl 'https://x.test' \\\n  -H 'a: b'"
    assert.deepEqual(tokenizeCurl(input), ['curl', 'https://x.test', '-H', 'a: b'])
  })

  it('should decode the \\x27 single-quote escape used by browsers', () => {
    // bash: 'it'\''s' → it's
    assert.deepEqual(tokenizeCurl("'it'\\''s'"), ["it's"])
  })

  it('should handle double quotes with escaped characters', () => {
    assert.deepEqual(tokenizeCurl('curl -d "{\\"a\\":1}"'), ['curl', '-d', '{"a":1}'])
  })

  it('should drop the Windows caret continuation', () => {
    assert.deepEqual(tokenizeCurl('curl ^\n  https://x.test'), ['curl', 'https://x.test'])
  })
})

describe('parseCurl', () => {
  it('should parse a bare GET', () => {
    assert.deepEqual(parseCurl('curl https://api.test/users'), {
      method: 'GET',
      url: 'https://api.test/users',
      headers: [],
      body: ''
    })
  })

  it('should collect headers', () => {
    const req = parseCurl("curl 'https://api.test' -H 'Accept: application/json' -H 'X-Token: abc'")
    assert.deepEqual(req?.headers, [
      { name: 'Accept', value: 'application/json' },
      { name: 'X-Token', value: 'abc' }
    ])
  })

  it('should infer POST when a body is present', () => {
    const req = parseCurl("curl https://api.test --data-raw '{\"a\":1}'")
    assert.equal(req?.method, 'POST')
    assert.equal(req?.body, '{"a":1}')
  })

  it('should respect an explicit -X method', () => {
    const req = parseCurl("curl -X PUT https://api.test -d 'x=1'")
    assert.equal(req?.method, 'PUT')
  })

  it('should join multiple -d parts with &', () => {
    const req = parseCurl('curl https://api.test -d a=1 -d b=2')
    assert.equal(req?.body, 'a=1&b=2')
  })

  it('should url-encode --data-urlencode values', () => {
    const req = parseCurl('curl https://api.test --data-urlencode "q=a b&c"')
    assert.equal(req?.body, 'q=a%20b%26c')
  })

  it('should turn -u into a Basic auth header', () => {
    const req = parseCurl('curl https://api.test -u alice:secret')
    const auth = req?.headers.find(h => h.name === 'Authorization')
    assert.equal(auth?.value, `Basic ${Buffer.from('alice:secret').toString('base64')}`)
  })

  it('should fold -G data into the query string and keep GET', () => {
    const req = parseCurl('curl -G https://api.test/search -d q=cats -d page=2')
    assert.equal(req?.method, 'GET')
    assert.equal(req?.url, 'https://api.test/search?q=cats&page=2')
    assert.equal(req?.body, '')
  })

  it('should ignore noise flags like --compressed and skip -o output', () => {
    const req = parseCurl('curl --compressed -o out.json https://api.test')
    assert.equal(req?.url, 'https://api.test')
  })

  it('should return null when there is no URL', () => {
    assert.equal(parseCurl('curl --compressed'), null)
    assert.equal(parseCurl(''), null)
  })
})

describe('curlToHttpRequest', () => {
  it('should render a full POST block with a pretty-printed JSON body', () => {
    const curl = [
      "curl 'https://api.test/users' \\",
      "  -X POST \\",
      "  -H 'Content-Type: application/json' \\",
      "  -H 'Authorization: Bearer xyz' \\",
      `  --data-raw '{"name":"Alice","age":30}'`
    ].join('\n')
    const block = curlToHttpRequest(curl)
    assert.equal(
      block,
      [
        '### Imported from curl',
        'POST https://api.test/users',
        'Content-Type: application/json',
        'Authorization: Bearer xyz',
        '',
        '{',
        '  "name": "Alice",',
        '  "age": 30',
        '}'
      ].join('\n')
    )
  })

  it('should render a header-only GET without a body section', () => {
    const block = curlToHttpRequest("curl 'https://api.test' -H 'Accept: */*'")
    assert.equal(block, ['### Imported from curl', 'GET https://api.test', 'Accept: */*'].join('\n'))
  })

  it('should use a custom request name', () => {
    const block = curlToHttpRequest('curl https://api.test', 'List users')
    assert.match(block ?? '', /^### List users\n/)
  })

  it('should return null for non-curl input', () => {
    assert.equal(curlToHttpRequest('not a curl command'), null)
  })
})
