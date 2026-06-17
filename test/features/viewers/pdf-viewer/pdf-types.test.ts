import { strict as assert } from 'assert'
import {
  parseScale,
  buildTemplateHtml,
  sanitizeStoredScale,
  sanitizeStoredScaleMode,
  isZoomChangedMessage,
  type TemplateValues
} from '../../../../src/features/viewers/pdf-viewer/pdf-types'

describe('parseScale', () => {
  it('should accept known presets', () => {
    assert.equal(parseScale('auto'), 'auto')
    assert.equal(parseScale('page-actual'), 'page-actual')
    assert.equal(parseScale('page-fit'), 'page-fit')
    assert.equal(parseScale('page-width'), 'page-width')
  })

  it('should accept positive numeric strings', () => {
    assert.equal(parseScale('1.5'), '1.5')
    assert.equal(parseScale('2'), '2')
    assert.equal(parseScale('0.5'), '0.5')
  })

  it('should fall back to auto for invalid values', () => {
    assert.equal(parseScale('huge'), 'auto')
    assert.equal(parseScale('invalid'), 'auto')
    assert.equal(parseScale(''), 'auto')
  })

  it('should fall back to auto for zero or negative values', () => {
    assert.equal(parseScale('0'), 'auto')
    assert.equal(parseScale('-1'), 'auto')
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

describe('buildTemplateHtml', () => {
  const values: TemplateValues = {
    pdfUri: 'vscode-webview://id/file.pdf',
    pdfJsUri: 'vscode-webview://id/pdf.min.mjs',
    workerUri: 'vscode-webview://id/pdf.worker.min.mjs',
    viewerCssUri: 'vscode-webview://id/viewer.css',
    codiconUri: 'vscode-webview://id/codicon.ttf',
    cspSource: 'vscode-webview://*',
    nonce: 'abc123def456',
    scale: 'auto',
    lastScale: '1.25',
    lastScaleMode: 'custom'
  }

  it('should replace all placeholders', () => {
    const template = '${pdfUri} ${pdfJsUri} ${workerUri} ${viewerCssUri} ${cspSource} ${nonce} ${scale}'
    const result = buildTemplateHtml(template, values)
    assert.equal(
      result,
      'vscode-webview://id/file.pdf vscode-webview://id/pdf.min.mjs vscode-webview://id/pdf.worker.min.mjs vscode-webview://id/viewer.css vscode-webview://* abc123def456 auto'
    )
  })

  it('should replace repeated placeholders', () => {
    const template = '${nonce} ${nonce} ${nonce}'
    assert.equal(buildTemplateHtml(template, values), 'abc123def456 abc123def456 abc123def456')
  })

  it('should leave unrecognized placeholders untouched', () => {
    assert.equal(buildTemplateHtml('${unknown} ${pdfUri}', values), '${unknown} vscode-webview://id/file.pdf')
  })

  it('should handle empty and placeholder-free templates', () => {
    assert.equal(buildTemplateHtml('', values), '')
    assert.equal(buildTemplateHtml('<html></html>', values), '<html></html>')
  })
})
