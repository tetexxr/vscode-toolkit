import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { parseScale, buildTemplateHtml, TemplateValues } from './pdf-types'

export class PdfPreview implements vscode.Disposable {
  private readonly libUri: vscode.Uri
  private disposables: vscode.Disposable[] = []
  private zoomCallback?: (scale: string, mode: string) => void

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly documentUri: vscode.Uri,
    private readonly panel: vscode.WebviewPanel,
    private readonly lastScale: string,
    private readonly lastScaleMode: string
  ) {
    this.libUri = vscode.Uri.joinPath(extensionUri, 'lib', 'pdf-viewer')

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.libUri, vscode.Uri.joinPath(documentUri, '..')]
    }

    this.panel.webview.html = this.getHtml()
    this.setupFileWatcher()
    this.setupMessageListener()
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  onZoomChanged(callback: (scale: string, mode: string) => void): void {
    this.zoomCallback = callback
  }

  private getHtml(): string {
    const webview = this.panel.webview

    const templatePath = path.join(this.extensionUri.fsPath, 'lib', 'pdf-viewer', 'viewer.html')
    const template = fs.readFileSync(templatePath, 'utf8')

    const configScale = vscode.workspace.getConfiguration('toolkit.pdfViewer').get('scale', 'auto')
    const values: TemplateValues = {
      pdfUri: webview.asWebviewUri(this.documentUri).toString(),
      pdfJsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.libUri, 'pdf.min.mjs')).toString(),
      workerUri: webview.asWebviewUri(vscode.Uri.joinPath(this.libUri, 'pdf.worker.min.mjs')).toString(),
      viewerCssUri: webview.asWebviewUri(vscode.Uri.joinPath(this.libUri, 'viewer.css')).toString(),
      codiconUri: webview.asWebviewUri(vscode.Uri.joinPath(this.libUri, 'codicon.ttf')).toString(),
      cspSource: webview.cspSource,
      nonce: crypto.randomBytes(16).toString('hex'),
      scale: parseScale(configScale),
      lastScale: this.lastScale,
      lastScaleMode: this.lastScaleMode
    }

    return buildTemplateHtml(template, values)
  }

  private setupFileWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(this.documentUri.fsPath)

    watcher.onDidChange(
      () => {
        this.panel.webview.postMessage({ type: 'reload' })
      },
      null,
      this.disposables
    )

    watcher.onDidDelete(
      () => {
        this.panel.dispose()
      },
      null,
      this.disposables
    )

    this.disposables.push(watcher)
  }

  private setupMessageListener(): void {
    this.panel.webview.onDidReceiveMessage(
      msg => {
        if (msg.type === 'zoomChanged' && this.zoomCallback) {
          this.zoomCallback(msg.scale, msg.mode)
        }
      },
      null,
      this.disposables
    )
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
