import { strict as assert } from 'assert'
import * as path from 'node:path'
import {
  detectFormat,
  formatTimestamp,
  relativizePath,
  renderLink,
  resolveTargetPath,
  sanitizeFilename
} from '../../../src/features/workspace/paste-image-utils'

describe('formatTimestamp', () => {
  const date = new Date(2024, 2, 15, 9, 5, 7) // 2024-03-15 09:05:07 local

  it('should replace YYYY/MM/DD/HH/mm/ss tokens', () => {
    assert.equal(formatTimestamp(date, 'YYYYMMDD-HHmmss'), '20240315-090507')
  })

  it('should support separators between tokens', () => {
    assert.equal(formatTimestamp(date, 'YYYY-MM-DD_HH.mm.ss'), '2024-03-15_09.05.07')
  })

  it('should distinguish MM (month) from mm (minute)', () => {
    assert.equal(formatTimestamp(date, 'MM-mm'), '03-05')
  })

  it('should leave non-token characters intact', () => {
    assert.equal(formatTimestamp(date, 'snap_YYYY!_MM_DD'), 'snap_2024!_03_15')
  })

  it('should zero-pad single-digit components', () => {
    const d = new Date(2024, 0, 2, 3, 4, 5)
    assert.equal(formatTimestamp(d, 'YYYY-MM-DD HH:mm:ss'), '2024-01-02 03:04:05')
  })
})

describe('resolveTargetPath', () => {
  it('should return the simple candidate when there is no collision', () => {
    const out = resolveTargetPath('/tmp', 'image.png', new Set())
    assert.equal(out, path.join('/tmp', 'image.png'))
  })

  it('should append -1, -2, ... on collision', () => {
    const existing = new Set([path.join('/tmp', 'image.png'), path.join('/tmp', 'image-1.png')])
    const out = resolveTargetPath('/tmp', 'image.png', existing)
    assert.equal(out, path.join('/tmp', 'image-2.png'))
  })

  it('should handle filenames without an extension', () => {
    const existing = new Set([path.join('/tmp', 'pic')])
    const out = resolveTargetPath('/tmp', 'pic', existing)
    assert.equal(out, path.join('/tmp', 'pic-1'))
  })
})

describe('relativizePath', () => {
  it('should produce a path relative to the directory of the source file', () => {
    const out = relativizePath('/repo/docs/readme.md', '/repo/docs/assets/img.png')
    assert.equal(out, 'assets/img.png')
  })

  it('should walk up the tree when needed', () => {
    const out = relativizePath('/repo/docs/readme.md', '/repo/assets/img.png')
    assert.equal(out, '../assets/img.png')
  })

  it('should keep native separators when forward slashes are disabled', () => {
    const out = relativizePath('/repo/docs/readme.md', '/repo/docs/assets/img.png', false)
    assert.equal(out, path.join('assets', 'img.png'))
  })
})

describe('detectFormat', () => {
  it('should honor an explicit format', () => {
    assert.equal(detectFormat('foo.md', 'html'), 'html')
    assert.equal(detectFormat('foo.html', 'markdown'), 'markdown')
  })

  it('should detect HTML for .html / .htm / .razor / .cshtml', () => {
    assert.equal(detectFormat('index.html', 'auto'), 'html')
    assert.equal(detectFormat('page.htm', 'auto'), 'html')
    assert.equal(detectFormat('Page.razor', 'auto'), 'html')
    assert.equal(detectFormat('Index.cshtml', 'auto'), 'html')
  })

  it('should default to markdown for everything else', () => {
    assert.equal(detectFormat('readme.md', 'auto'), 'markdown')
    assert.equal(detectFormat('foo.txt', 'auto'), 'markdown')
    assert.equal(detectFormat(undefined, 'auto'), 'markdown')
  })
})

describe('renderLink', () => {
  it('should produce Markdown image syntax', () => {
    assert.equal(renderLink('markdown', 'assets/img.png'), '![](assets/img.png)')
    assert.equal(renderLink('markdown', 'assets/img.png', { alt: 'Hello' }), '![Hello](assets/img.png)')
  })

  it('should produce an HTML img tag with alt and optional extra attributes', () => {
    assert.equal(renderLink('html', 'assets/img.png'), '<img src="assets/img.png" alt="" />')
    assert.equal(
      renderLink('html', 'assets/img.png', { alt: 'Hi', htmlAttributes: 'class="screenshot"' }),
      '<img src="assets/img.png" alt="Hi" class="screenshot" />'
    )
  })

  it('should escape quotes and angle brackets in HTML attributes', () => {
    assert.equal(
      renderLink('html', 'a/b<c>"d".png', { alt: '"He said"' }),
      '<img src="a/b&lt;c&gt;&quot;d&quot;.png" alt="&quot;He said&quot;" />'
    )
  })
})

describe('sanitizeFilename', () => {
  it('should replace filesystem-unsafe characters with hyphens', () => {
    assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j')
  })

  it('should collapse consecutive separators and trim edges', () => {
    assert.equal(sanitizeFilename('---my   name---'), 'my   name')
    assert.equal(sanitizeFilename('::clean::'), 'clean')
  })

  it('should strip trailing dots (Windows-friendly)', () => {
    assert.equal(sanitizeFilename('foo...'), 'foo')
  })

  it('should return an empty string when input is made entirely of unsafe characters', () => {
    assert.equal(sanitizeFilename('////'), '')
  })

  it('should truncate very long names', () => {
    const long = 'x'.repeat(500)
    assert.equal(sanitizeFilename(long).length, 200)
  })
})
