const VALID_PRESETS = ['auto', 'page-actual', 'page-fit', 'page-width']

export function parseScale(value: string): string {
  if (VALID_PRESETS.includes(value)) return value
  const num = parseFloat(value)
  if (!isNaN(num) && num > 0) return String(num)
  return 'auto'
}

/**
 * Sanitizers for the zoom values remembered from webview messages — they are
 * interpolated into the viewer's inline script, so they must never carry
 * anything but a known preset or a number. Empty means "not set yet".
 */
export function sanitizeStoredScale(value: string): string {
  return value === '' ? '' : parseScale(value)
}

export function sanitizeStoredScaleMode(value: string): string {
  return VALID_PRESETS.includes(value) ? value : ''
}

export interface TemplateValues {
  pdfUri: string
  pdfJsUri: string
  workerUri: string
  viewerCssUri: string
  cspSource: string
  nonce: string
  codiconUri: string
  scale: string
  lastScale: string
  lastScaleMode: string
}

export function buildTemplateHtml(template: string, values: TemplateValues): string {
  let result = template
  for (const key of Object.keys(values) as (keyof TemplateValues)[]) {
    result = result.replaceAll('${' + key + '}', values[key])
  }
  return result
}

export interface ZoomChangedMessage {
  type: 'zoomChanged'
  scale: string
  mode: string
}

export function isZoomChangedMessage(value: unknown): value is ZoomChangedMessage {
  if (typeof value !== 'object' || value === null) return false
  const msg = value as Record<string, unknown>
  return msg.type === 'zoomChanged' && typeof msg.scale === 'string' && typeof msg.mode === 'string'
}
