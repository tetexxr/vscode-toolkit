const VALID_PRESETS = ['auto', 'page-actual', 'page-fit', 'page-width']

export function parseScale(value: string): string {
  if (VALID_PRESETS.includes(value)) return value
  const num = parseFloat(value)
  if (!isNaN(num) && num > 0) return String(num)
  return 'auto'
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
