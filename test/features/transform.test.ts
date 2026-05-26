import { strict as assert } from 'assert'
import {
  base64Encode,
  base64Decode,
  base64UrlEncode,
  base64UrlDecode,
  urlEncode,
  urlDecode,
  htmlEncode,
  htmlDecode,
  hexEncode,
  hexDecode,
  hash,
  decodeJwt,
  formatDecodedJwt,
  TransformError
} from '../../src/features/transform-utils'

describe('base64 encode/decode', () => {
  it('encodes and decodes ASCII', () => {
    assert.equal(base64Encode('hello world'), 'aGVsbG8gd29ybGQ=')
    assert.equal(base64Decode('aGVsbG8gd29ybGQ='), 'hello world')
  })

  it('handles UTF-8 multi-byte sequences', () => {
    assert.equal(base64Encode('héllo 🌍'), 'aMOpbGxvIPCfjI0=')
    assert.equal(base64Decode('aMOpbGxvIPCfjI0='), 'héllo 🌍')
  })

  it('handles empty string', () => {
    assert.equal(base64Encode(''), '')
    assert.equal(base64Decode(''), '')
  })

  it('trims whitespace from base64 input', () => {
    assert.equal(base64Decode('  aGVsbG8=  '), 'hello')
  })

  it('throws on invalid base64', () => {
    assert.throws(() => base64Decode('not valid base64!'), TransformError)
    assert.throws(() => base64Decode('abc'), TransformError) // wrong length
  })
})

describe('base64 URL-safe encode/decode', () => {
  it('uses URL-safe alphabet and strips padding', () => {
    // "subjects?" → standard ends with '==' and contains '/'
    const std = base64Encode('subjects?')
    assert.match(std, /[+/=]/)
    const url = base64UrlEncode('subjects?')
    assert.doesNotMatch(url, /[+/=]/)
  })

  it('round-trips arbitrary input', () => {
    const inputs = ['', 'a', 'hello', 'héllo 🌍', 'subjects?', '???']
    for (const input of inputs) {
      assert.equal(base64UrlDecode(base64UrlEncode(input)), input, `round-trip failed for: ${input}`)
    }
  })

  it('decodes inputs without padding', () => {
    assert.equal(base64UrlDecode('aGVsbG8'), 'hello')
  })

  it('throws on invalid url-safe base64', () => {
    assert.throws(() => base64UrlDecode('not valid!'), TransformError)
  })
})

describe('url encode/decode', () => {
  it('encodes special characters', () => {
    assert.equal(urlEncode('hello world?'), 'hello%20world%3F')
    assert.equal(urlEncode('a&b=c'), 'a%26b%3Dc')
  })

  it('decodes percent-encoded sequences', () => {
    assert.equal(urlDecode('hello%20world%3F'), 'hello world?')
  })

  it('handles UTF-8 in encoded output', () => {
    assert.equal(urlEncode('café'), 'caf%C3%A9')
    assert.equal(urlDecode('caf%C3%A9'), 'café')
  })

  it('throws on malformed percent sequences', () => {
    assert.throws(() => urlDecode('%ZZ'), TransformError)
    assert.throws(() => urlDecode('%E0%A4'), TransformError)
  })

  it('handles empty string', () => {
    assert.equal(urlEncode(''), '')
    assert.equal(urlDecode(''), '')
  })
})

describe('html encode/decode', () => {
  it('encodes the five reserved characters', () => {
    assert.equal(htmlEncode('<b>"Hi & welcome"</b>'), '&lt;b&gt;&quot;Hi &amp; welcome&quot;&lt;/b&gt;')
    assert.equal(htmlEncode("don't"), 'don&#39;t')
  })

  it('decodes named entities', () => {
    assert.equal(htmlDecode('&lt;b&gt;hi&lt;/b&gt;'), '<b>hi</b>')
    assert.equal(htmlDecode('Tom &amp; Jerry'), 'Tom & Jerry')
    assert.equal(htmlDecode('it&apos;s'), "it's")
    assert.equal(htmlDecode('a &nbsp; b'), 'a   b')
    assert.equal(htmlDecode('caf&eacute;'), 'caf&eacute;') // unknown name is preserved
  })

  it('decodes numeric and hex entities', () => {
    assert.equal(htmlDecode('&#65;&#66;&#67;'), 'ABC')
    assert.equal(htmlDecode('&#x41;&#x42;&#x43;'), 'ABC')
    assert.equal(htmlDecode('&#9731;'), '☃')
  })

  it('round-trips a simple string', () => {
    const input = 'Tom & Jerry: "<3"'
    assert.equal(htmlDecode(htmlEncode(input)), input)
  })

  it('leaves unrelated text alone', () => {
    assert.equal(htmlEncode('no entities here'), 'no entities here')
    assert.equal(htmlDecode('plain text'), 'plain text')
  })
})

describe('hex encode/decode', () => {
  it('round-trips ASCII and UTF-8', () => {
    assert.equal(hexEncode('hello'), '68656c6c6f')
    assert.equal(hexDecode('68656c6c6f'), 'hello')
    assert.equal(hexDecode(hexEncode('héllo 🌍')), 'héllo 🌍')
  })

  it('accepts whitespace in hex input', () => {
    assert.equal(hexDecode('68 65 6c 6c 6f'), 'hello')
    assert.equal(hexDecode('68\n65\n6c\n6c\n6f'), 'hello')
  })

  it('is case-insensitive', () => {
    assert.equal(hexDecode('68656C6C6F'), 'hello')
  })

  it('throws on odd-length input', () => {
    assert.throws(() => hexDecode('123'), TransformError)
  })

  it('throws on non-hex characters', () => {
    assert.throws(() => hexDecode('zzzz'), TransformError)
  })

  it('handles empty', () => {
    assert.equal(hexEncode(''), '')
    assert.equal(hexDecode(''), '')
  })
})

describe('hash', () => {
  it('produces known MD5 digest for "abc"', () => {
    assert.equal(hash('abc', 'md5'), '900150983cd24fb0d6963f7d28e17f72')
  })

  it('produces known SHA-1 digest for "abc"', () => {
    assert.equal(hash('abc', 'sha1'), 'a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('produces known SHA-256 digest for "abc"', () => {
    assert.equal(hash('abc', 'sha256'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('produces known SHA-512 digest for "abc"', () => {
    assert.equal(
      hash('abc', 'sha512'),
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
        '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    )
  })

  it('handles UTF-8 input', () => {
    assert.equal(hash('héllo', 'md5').length, 32)
    assert.equal(hash('🌍', 'sha256').length, 64)
  })

  it('handles empty input', () => {
    assert.equal(hash('', 'md5'), 'd41d8cd98f00b204e9800998ecf8427e')
  })
})

describe('jwt decode', () => {
  // {"alg":"HS256","typ":"JWT"}.{"sub":"1234567890","name":"John Doe","iat":1516239022}
  const SAMPLE_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

  it('decodes header and payload of a standard JWT', () => {
    const decoded = decodeJwt(SAMPLE_JWT)
    assert.deepEqual(decoded.header, { alg: 'HS256', typ: 'JWT' })
    assert.deepEqual(decoded.payload, { sub: '1234567890', name: 'John Doe', iat: 1516239022 })
    assert.equal(decoded.signature, 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })

  it('tolerates surrounding whitespace', () => {
    const decoded = decodeJwt('  ' + SAMPLE_JWT + '  ')
    assert.deepEqual(decoded.header, { alg: 'HS256', typ: 'JWT' })
  })

  it('throws when there are not exactly 3 segments', () => {
    assert.throws(() => decodeJwt('only.two'), TransformError)
    assert.throws(() => decodeJwt('a.b.c.d'), TransformError)
  })

  it('throws when the header is not valid base64url JSON', () => {
    assert.throws(() => decodeJwt('not_base64.eyJ9.x'), TransformError)
  })

  it('formats decoded JWT as readable jsonc-style output', () => {
    const formatted = formatDecodedJwt(decodeJwt(SAMPLE_JWT))
    assert.ok(formatted.includes('// Header'))
    assert.ok(formatted.includes('"alg": "HS256"'))
    assert.ok(formatted.includes('// Payload'))
    assert.ok(formatted.includes('"sub": "1234567890"'))
    assert.ok(formatted.includes('// Signature (not verified)'))
  })
})
