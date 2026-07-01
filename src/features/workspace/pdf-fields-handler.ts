/**
 * Message handler for the PDF Fields panel.
 *
 * Reads one PDF's AcroForm fields for display, and clears the selected fields
 * on request — overwriting the original file in place after a confirmation.
 */

import * as vscode from 'vscode'
import { readPdfFields, clearPdfFields, type PdfFieldInfo } from './pdf-fields-utils'

type WebviewMessage = { command: 'ready' } | { command: 'clear'; names: string[] }

type ExtensionMessage = {
  type: 'state'
  fileName: string
  relPath: string
  fields: PdfFieldInfo[]
  hasForm: boolean
  loading: boolean
  error?: string
}

export class PdfFieldsHandler implements vscode.Disposable {
  private disposables: vscode.Disposable[] = []

  constructor(
    private webview: vscode.Webview,
    private target: vscode.Uri
  ) {
    this.disposables.push(this.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg)))
  }

  /** Point the panel at a different PDF. */
  public async retarget(target: vscode.Uri): Promise<void> {
    this.target = target
    await this.load()
  }

  private handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'ready':
        return this.load()
      case 'clear':
        return this.clear(msg.names)
    }
  }

  private async load(): Promise<void> {
    const relPath = vscode.workspace.asRelativePath(this.target)
    const fileName = this.basename(this.target)
    this.post({ type: 'state', fileName, relPath, fields: [], hasForm: false, loading: true })

    try {
      const bytes = await vscode.workspace.fs.readFile(this.target)
      const result = await readPdfFields(bytes)
      this.post({ type: 'state', fileName, relPath, fields: result.fields, hasForm: result.hasForm, loading: false })
    } catch (error) {
      this.post({ type: 'state', fileName, relPath, fields: [], hasForm: false, loading: false, error: `Could not read the PDF — ${String(error)}` })
    }
  }

  private async clear(names: string[]): Promise<void> {
    if (names.length === 0) {
      return
    }
    const fileName = this.basename(this.target)
    const plural = names.length === 1 ? 'field' : 'fields'
    const choice = await vscode.window.showWarningMessage(
      `Clear ${names.length} ${plural} in ${fileName}? This overwrites the original PDF.`,
      { modal: true, detail: 'The selected fields are blanked and the file is saved in place.' },
      'Clear'
    )
    if (choice !== 'Clear') {
      await this.load() // re-enable the button in the webview
      return
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this.target)
      const cleared = await clearPdfFields(bytes, names)
      await vscode.workspace.fs.writeFile(this.target, cleared)
      await this.load()
      vscode.window.showInformationMessage(`Toolkit: cleared ${names.length} ${plural} in ${fileName}.`)
    } catch (error) {
      vscode.window.showErrorMessage(`Toolkit: could not clear fields — ${String(error)}`)
      await this.load()
    }
  }

  private basename(uri: vscode.Uri): string {
    const parts = uri.path.split('/')
    return parts[parts.length - 1]
  }

  private post(msg: ExtensionMessage): void {
    this.webview.postMessage(msg)
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }
}
