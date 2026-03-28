const VALID_PRESETS = ['auto', 'page-actual', 'page-fit', 'page-width'];

export function parseScale(value: string): string {
  if (VALID_PRESETS.includes(value)) return value;
  const num = parseFloat(value);
  if (!isNaN(num) && num > 0) return String(num);
  return 'auto';
}

export interface TemplateValues {
  pdfUri: string;
  pdfJsUri: string;
  workerUri: string;
  viewerCssUri: string;
  cspSource: string;
  nonce: string;
  scale: string;
}

export function buildTemplateHtml(template: string, values: TemplateValues): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll('${' + key + '}', value);
  }
  return result;
}
