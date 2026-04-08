import { strict as assert } from 'assert'
import { generateWebviewHtml } from '../../../src/features/npm/npm-webview'
import { generateOverviewHtml } from '../../../src/features/npm/npm-overview-webview'

const mockWebview = { cspSource: 'https://mock.vscode-resource.test' } as any

describe('generateWebviewHtml', () => {
  const nonce = 'test-nonce-abc123'
  const html = generateWebviewHtml(mockWebview, nonce)

  it('should return valid HTML document', () => {
    assert.ok(html.startsWith('<!DOCTYPE html>'))
    assert.ok(html.includes('<html lang="en">'))
    assert.ok(html.includes('</html>'))
  })

  it('should include the nonce in style tag', () => {
    assert.ok(html.includes(`<style nonce="${nonce}">`))
  })

  it('should include the nonce in script tag', () => {
    assert.ok(html.includes(`<script nonce="${nonce}">`))
  })

  it('should include Content-Security-Policy with nonce', () => {
    assert.ok(html.includes(`style-src 'nonce-${nonce}'`))
    assert.ok(html.includes(`script-src 'nonce-${nonce}'`))
  })

  it('should include the main layout elements', () => {
    assert.ok(html.includes('id="nav-bar"'))
    assert.ok(html.includes('id="tool-bar"'))
    assert.ok(html.includes('id="package-list"'))
    assert.ok(html.includes('id="resize-handle"'))
    assert.ok(html.includes('id="package-details"'))
  })

  it('should include title', () => {
    assert.ok(html.includes('<title>npm Package Manager</title>'))
  })

  it('should include VS Code API acquisition', () => {
    assert.ok(html.includes('acquireVsCodeApi'))
  })

  it('should include the ready message post', () => {
    assert.ok(html.includes("command: 'ready'"))
  })

  it('should include CSS for VS Code theme integration', () => {
    assert.ok(html.includes('--vscode-font-family'))
    assert.ok(html.includes('--vscode-button-background'))
    assert.ok(html.includes('--vscode-editor-background'))
  })

  it('should use different nonce values correctly', () => {
    const html2 = generateWebviewHtml(mockWebview, 'other-nonce')
    assert.ok(html2.includes('nonce-other-nonce'))
    assert.ok(!html2.includes('nonce-test-nonce-abc123'))
  })
})

describe('generateOverviewHtml', () => {
  const nonce = 'overview-nonce-xyz'
  const html = generateOverviewHtml(mockWebview, nonce)

  it('should return valid HTML document', () => {
    assert.ok(html.startsWith('<!DOCTYPE html>'))
    assert.ok(html.includes('</html>'))
  })

  it('should include nonce in style and script tags', () => {
    assert.ok(html.includes(`<style nonce="${nonce}">`))
    assert.ok(html.includes(`<script nonce="${nonce}">`))
  })

  it('should include Content-Security-Policy', () => {
    assert.ok(html.includes(`style-src 'nonce-${nonce}'`))
    assert.ok(html.includes(`script-src 'nonce-${nonce}'`))
  })

  it('should include toolbar and content elements', () => {
    assert.ok(html.includes('id="toolbar"'))
    assert.ok(html.includes('id="content"'))
  })

  it('should include title', () => {
    assert.ok(html.includes('<title>npm Workspace Overview</title>'))
  })

  it('should include ready message post', () => {
    assert.ok(html.includes("command: 'ready'"))
  })

  it('should include load-versions command', () => {
    assert.ok(html.includes("command: 'load-versions'"))
  })

  it('should include update-all command', () => {
    assert.ok(html.includes("command: 'update-all'"))
  })
})
