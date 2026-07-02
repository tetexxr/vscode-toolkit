import { strict as assert } from 'assert'
import {
  ENHANCED_WRAPPER_CLASS,
  shouldShowStatusBar,
  statusBarText,
  statusBarTooltip,
  toggleMessage,
  wrapEnhancedHtml
} from '../../../src/features/viewers/markdown-preview-style-utils'

describe('markdown preview style utils', () => {
  describe('wrapEnhancedHtml', () => {
    it('should wrap the html in the gate element when enhanced', () => {
      const out = wrapEnhancedHtml('<p>hi</p>', true)
      assert.ok(out.startsWith(`<div class="${ENHANCED_WRAPPER_CLASS}">`))
      assert.ok(out.trimEnd().endsWith('</div>'))
    })

    it('should keep the original html inside the wrapper when enhanced', () => {
      const out = wrapEnhancedHtml('<table><tr><td>1</td></tr></table>', true)
      assert.ok(out.includes('<table><tr><td>1</td></tr></table>'))
    })

    it('should return the html untouched when disabled', () => {
      const html = '<h1>Title</h1>'
      assert.equal(wrapEnhancedHtml(html, false), html)
    })
  })

  describe('shouldShowStatusBar', () => {
    it('should show when a markdown editor is visible', () => {
      assert.equal(shouldShowStatusBar(['typescript', 'markdown']), true)
    })

    it('should show when only a markdown editor is visible', () => {
      assert.equal(shouldShowStatusBar(['markdown']), true)
    })

    it('should hide when no visible editor is markdown', () => {
      assert.equal(shouldShowStatusBar(['typescript', 'json']), false)
    })

    it('should hide when there are no visible editors', () => {
      assert.equal(shouldShowStatusBar([]), false)
    })
  })

  describe('statusBarText', () => {
    it('should read Enhanced when enabled', () => {
      assert.ok(statusBarText(true).includes('Enhanced'))
    })

    it('should read Default when disabled', () => {
      assert.ok(statusBarText(false).includes('Default'))
    })
  })

  describe('statusBarTooltip', () => {
    it('should differ between the enabled and disabled states', () => {
      assert.notEqual(statusBarTooltip(true), statusBarTooltip(false))
    })
  })

  describe('toggleMessage', () => {
    it('should announce enhanced styling when enabled', () => {
      assert.ok(toggleMessage(true).toLowerCase().includes('enhanced'))
    })

    it('should announce the default style when disabled', () => {
      assert.ok(toggleMessage(false).toLowerCase().includes('default'))
    })
  })
})
