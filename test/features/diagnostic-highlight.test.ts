import { strict as assert } from 'assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '../../src/features/diagnostic-highlight.ts'), 'utf-8')

describe('diagnostic-highlight', () => {
  it('should register the toggle command', () => {
    assert.ok(source.includes("'toolkit.toggleDiagnosticHighlight'"))
  })

  it('should listen to diagnostic changes', () => {
    assert.ok(source.includes('onDidChangeDiagnostics'))
  })

  it('should listen to active editor changes', () => {
    assert.ok(source.includes('onDidChangeActiveTextEditor'))
  })

  it('should listen to visible editor changes', () => {
    assert.ok(source.includes('onDidChangeVisibleTextEditors'))
  })

  it('should listen to configuration changes', () => {
    assert.ok(source.includes('onDidChangeConfiguration'))
  })

  it('should define default colors for hint, info, and warning', () => {
    assert.ok(source.includes('hint:'))
    assert.ok(source.includes('info:'))
    assert.ok(source.includes('warning:'))
  })

  it('should create decoration types for all three severities', () => {
    assert.ok(source.includes("['hint', 'info', 'warning']"))
  })

  it('should use different border styles per severity', () => {
    assert.ok(source.includes("hint: 'dotted'"))
    assert.ok(source.includes("info: 'dashed'"))
    assert.ok(source.includes("warning: 'solid'"))
  })

  it('should handle multi-line ranges with splitRangePerLine', () => {
    assert.ok(source.includes('function splitRangePerLine'))
    assert.ok(source.includes('firstNonWhitespaceCharacterIndex'))
  })

  it('should skip empty lines in multi-line ranges', () => {
    assert.ok(source.includes('isEmptyOrWhitespace'))
  })

  it('should return single-line ranges as-is', () => {
    assert.ok(source.includes('startLine === endLine'))
  })

  it('should build hover with severity label, source, and code', () => {
    assert.ok(source.includes('function buildHover'))
    assert.ok(source.includes('severityLabel'))
    assert.ok(source.includes('diag.source'))
    assert.ok(source.includes('diag.code'))
  })

  it('should read highlight settings per severity', () => {
    assert.ok(source.includes("'highlightHints'"))
    assert.ok(source.includes("'highlightInfo'"))
    assert.ok(source.includes("'highlightWarnings'"))
  })

  it('should debounce updates', () => {
    assert.ok(source.includes('function debounceUpdate'))
    assert.ok(source.includes('setTimeout'))
  })

  it('should use overview ruler for scrollbar markers', () => {
    assert.ok(source.includes('overviewRulerColor'))
    assert.ok(source.includes('overviewRulerLane'))
  })

  it('should dispose decoration types on cleanup', () => {
    assert.ok(source.includes('function disposeDecorationTypes'))
    assert.ok(source.includes('.dispose()'))
  })
})
