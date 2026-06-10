import * as assert from 'assert'
import * as http from 'http'
import * as zlib from 'zlib'
import { httpGetJson, sameOrigin } from '../../src/utils/http'

describe('utils/http', () => {
  describe('sameOrigin', () => {
    it('should return true for URLs on the same host and scheme', () => {
      assert.strictEqual(sameOrigin('https://api.nuget.org/v3/index.json', 'https://api.nuget.org/v3/search?q=x'), true)
    })

    it('should return false for different hosts', () => {
      assert.strictEqual(sameOrigin('https://api.nuget.org/v3/index.json', 'https://evil.com/v3/search'), false)
    })

    it('should return false for different subdomains', () => {
      assert.strictEqual(sameOrigin('https://pkgs.dev.azure.com/feed', 'https://dev.azure.com/feed'), false)
    })

    it('should return false when schemes differ', () => {
      assert.strictEqual(sameOrigin('https://registry.example.com', 'http://registry.example.com'), false)
    })

    it('should return false when ports differ', () => {
      assert.strictEqual(sameOrigin('https://registry.example.com:8443/a', 'https://registry.example.com/b'), false)
    })

    it('should treat default ports as equal to explicit ones', () => {
      assert.strictEqual(sameOrigin('https://registry.example.com:443/a', 'https://registry.example.com/b'), true)
    })

    it('should return false when either URL is invalid', () => {
      assert.strictEqual(sameOrigin('not a url', 'https://api.nuget.org'), false)
      assert.strictEqual(sameOrigin('https://api.nuget.org', ''), false)
    })
  })
})

describe('httpGetJson', () => {
  let server: http.Server
  let baseUrl: string

  before(done => {
    server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, value: 42 }))
      } else if (req.url === '/gzip') {
        const body = zlib.gzipSync(JSON.stringify({ compressed: true }))
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' })
        res.end(body)
      } else if (req.url === '/notfound') {
        res.writeHead(404)
        res.end('nope')
      } else if (req.url === '/invalid') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('this is not json')
      } else if (req.url === '/slow') {
        // Never responds; the client timeout must fire.
      } else {
        res.writeHead(500)
        res.end()
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number }
      baseUrl = `http://127.0.0.1:${address.port}`
      done()
    })
  })

  after(done => {
    server.close(() => done())
  })

  it('should fetch and parse a JSON response', async () => {
    const result = await httpGetJson<{ ok: boolean; value: number }>({ url: `${baseUrl}/json` })
    assert.deepEqual(result, { ok: true, value: 42 })
  })

  it('should decompress gzip responses', async () => {
    const result = await httpGetJson<{ compressed: boolean }>({ url: `${baseUrl}/gzip` })
    assert.deepEqual(result, { compressed: true })
  })

  it('should reject on non-2xx status codes', async () => {
    await assert.rejects(() => httpGetJson({ url: `${baseUrl}/notfound` }), /HTTP 404/)
  })

  it('should reject when the body is not valid JSON', async () => {
    await assert.rejects(() => httpGetJson({ url: `${baseUrl}/invalid` }), /Failed to parse JSON/)
  })

  it('should reject when the request exceeds the timeout', async () => {
    await assert.rejects(() => httpGetJson({ url: `${baseUrl}/slow`, timeout: 150 }), /timed out/)
  })
})
