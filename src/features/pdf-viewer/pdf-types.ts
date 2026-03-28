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
  return template
    .replaceAll('${pdfUri}', values.pdfUri)
    .replaceAll('${pdfJsUri}', values.pdfJsUri)
    .replaceAll('${workerUri}', values.workerUri)
    .replaceAll('${viewerCssUri}', values.viewerCssUri)
    .replaceAll('${cspSource}', values.cspSource)
    .replaceAll('${nonce}', values.nonce)
    .replaceAll('${scale}', values.scale);
}
