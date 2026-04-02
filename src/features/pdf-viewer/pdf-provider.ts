import * as vscode from 'vscode'
import { PdfPreview } from './pdf-preview'

export class PdfProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'toolkit.pdfPreview'
  private lastScale = ''
  private lastScaleMode = ''

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose() {} }
  }

  resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): void {
    const preview = new PdfPreview(this.extensionUri, document.uri, webviewPanel, this.lastScale, this.lastScaleMode)
    preview.onZoomChanged((scale, mode) => {
      this.lastScale = scale
      this.lastScaleMode = mode
    })
  }
}

export function registerPdfViewer(context: vscode.ExtensionContext): void {
  const provider = new PdfProvider(context.extensionUri)

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PdfProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )
}
