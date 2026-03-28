import { strict as assert } from 'assert';
import { parseScale, buildTemplateHtml, TemplateValues } from '../../../src/features/pdf-viewer/pdf-types';

describe('parseScale', () => {
  it('should accept "auto"', () => {
    assert.equal(parseScale('auto'), 'auto');
  });

  it('should accept "page-actual"', () => {
    assert.equal(parseScale('page-actual'), 'page-actual');
  });

  it('should accept "page-fit"', () => {
    assert.equal(parseScale('page-fit'), 'page-fit');
  });

  it('should accept "page-width"', () => {
    assert.equal(parseScale('page-width'), 'page-width');
  });

  it('should accept positive numeric strings', () => {
    assert.equal(parseScale('1.5'), '1.5');
    assert.equal(parseScale('2'), '2');
    assert.equal(parseScale('0.5'), '0.5');
  });

  it('should fallback to "auto" for invalid values', () => {
    assert.equal(parseScale('invalid'), 'auto');
    assert.equal(parseScale(''), 'auto');
  });

  it('should fallback to "auto" for zero or negative values', () => {
    assert.equal(parseScale('0'), 'auto');
    assert.equal(parseScale('-1'), 'auto');
    assert.equal(parseScale('-0.5'), 'auto');
  });
});

describe('buildTemplateHtml', () => {
  const values: TemplateValues = {
    pdfUri: 'vscode-webview://id/file.pdf',
    pdfJsUri: 'vscode-webview://id/pdf.min.mjs',
    workerUri: 'vscode-webview://id/pdf.worker.min.mjs',
    viewerCssUri: 'vscode-webview://id/viewer.css',
    cspSource: 'vscode-webview://*',
    nonce: 'abc123def456',
    scale: 'auto',
    lastScale: '1.25',
    lastScaleMode: 'custom',
  };

  it('should replace all placeholders', () => {
    const template = '${pdfUri} ${pdfJsUri} ${workerUri} ${viewerCssUri} ${cspSource} ${nonce} ${scale}';
    const result = buildTemplateHtml(template, values);
    assert.equal(
      result,
      'vscode-webview://id/file.pdf vscode-webview://id/pdf.min.mjs vscode-webview://id/pdf.worker.min.mjs vscode-webview://id/viewer.css vscode-webview://* abc123def456 auto',
    );
  });

  it('should replace repeated placeholders', () => {
    const template = '${nonce} ${nonce} ${nonce}';
    const result = buildTemplateHtml(template, values);
    assert.equal(result, 'abc123def456 abc123def456 abc123def456');
  });

  it('should leave unrecognized placeholders untouched', () => {
    const template = '${unknown} ${pdfUri}';
    const result = buildTemplateHtml(template, values);
    assert.equal(result, '${unknown} vscode-webview://id/file.pdf');
  });

  it('should handle empty template', () => {
    assert.equal(buildTemplateHtml('', values), '');
  });

  it('should handle template with no placeholders', () => {
    assert.equal(buildTemplateHtml('<html></html>', values), '<html></html>');
  });
});
