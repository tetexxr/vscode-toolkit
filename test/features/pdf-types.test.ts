import { strict as assert } from 'assert'
import {
  parseScale,
  sanitizeStoredScale,
  sanitizeStoredScaleMode,
  isZoomChangedMessage
} from '../../src/features/pdf-viewer/pdf-types'

describe('parseScale', () => {
  it('should accept known presets', () => {
    assert.equal(parseScale('auto'), 'auto')
    assert.equal(parseScale('page-width'), 'page-width')
  })

  it('should accept positive numeric strings', () => {
    assert.equal(parseScale('1.5'), '1.5')
  })

  it('should fall back to auto for invalid values', () => {
    assert.equal(parseScale('huge'), 'auto')
    assert.equal(parseScale('-2'), 'auto')
  })
})

describe('sanitizeStoredScale', () => {
  it('should keep the empty string (not set yet)', () => {
    assert.equal(sanitizeStoredScale(''), '')
  })

  it('should keep presets and numbers', () => {
    assert.equal(sanitizeStoredScale('page-fit'), 'page-fit')
    assert.equal(sanitizeStoredScale('2'), '2')
  })

  it('should neutralize script-breaking values', () => {
    assert.equal(sanitizeStoredScale("'; alert(1); '"), 'auto')
  })
})

describe('sanitizeStoredScaleMode', () => {
  it('should keep known presets', () => {
    assert.equal(sanitizeStoredScaleMode('page-width'), 'page-width')
  })

  it('should map anything else to the empty string', () => {
    assert.equal(sanitizeStoredScaleMode(''), '')
    assert.equal(sanitizeStoredScaleMode('1.5'), '')
    assert.equal(sanitizeStoredScaleMode("'; alert(1); '"), '')
  })
})

describe('isZoomChangedMessage', () => {
  it('should accept a well-formed message', () => {
    assert.equal(isZoomChangedMessage({ type: 'zoomChanged', scale: '1.5', mode: 'auto' }), true)
  })

  it('should reject null, wrong types, and missing fields', () => {
    assert.equal(isZoomChangedMessage(null), false)
    assert.equal(isZoomChangedMessage({ type: 'zoomChanged', scale: 1.5, mode: 'auto' }), false)
    assert.equal(isZoomChangedMessage({ type: 'other', scale: '1', mode: 'auto' }), false)
  })
})
