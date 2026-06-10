import * as assert from 'assert'
import { sameOrigin } from '../../src/utils/http'

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
