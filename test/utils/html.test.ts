import { strict as assert } from 'assert'
import { createNonce, escapeHtml } from '../../src/utils/html'

describe('escapeHtml', () => {
  it('should escape angle brackets', () => {
    assert.equal(escapeHtml('<div>'), '&lt;div&gt;')
  })

  it('should escape ampersands', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b')
  })

  it('should escape double quotes', () => {
    assert.equal(escapeHtml('a "b" c'), 'a &quot;b&quot; c')
  })

  it('should escape single quotes', () => {
    assert.equal(escapeHtml("a 'b' c"), 'a &#39;b&#39; c')
  })

  it('should escape ampersand before other entities', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;')
  })

  it('should produce output that is safe inside attribute values', () => {
    // The combined HTML — both text and attribute — should not contain any
    // raw metacharacter that would close a quoted attribute.
    const escaped = escapeHtml(`"'><script>alert(1)</script>`)
    assert.ok(!escaped.includes('"'))
    assert.ok(!escaped.includes("'"))
    assert.ok(!escaped.includes('<'))
    assert.ok(!escaped.includes('>'))
  })

  it('should leave plain text untouched', () => {
    assert.equal(escapeHtml('hello world'), 'hello world')
  })

  it('should handle empty string', () => {
    assert.equal(escapeHtml(''), '')
  })
})

describe('createNonce', () => {
  it('should return a non-empty string', () => {
    const nonce = createNonce()
    assert.equal(typeof nonce, 'string')
    assert.ok(nonce.length > 0)
  })

  it('should return a hex-only string', () => {
    const nonce = createNonce()
    assert.match(nonce, /^[0-9a-f]+$/)
  })

  it('should return a different value each invocation', () => {
    const a = createNonce()
    const b = createNonce()
    assert.notEqual(a, b)
  })

  it('should be long enough to resist guessing (≥ 128 bits)', () => {
    // 16 bytes → 32 hex chars; anything shorter would be too easy to brute-force in a CSP context.
    assert.ok(createNonce().length >= 32)
  })
})
