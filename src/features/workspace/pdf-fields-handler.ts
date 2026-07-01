/**
 * Message handler for the PDF Fields panel.
 *
 * Reads one PDF's AcroForm fields for display, and clears the selected fields
 * on request — overwriting the original file in place after a confirmation.
 */

import * as vscode from 'vscode'
import { readPdfFields, setPdfFields, type PdfFieldInfo, type PdfFieldValue } from './pdf-fields-utils'

type WebviewMessage = { command: 'ready' } | { command: 'save'; values: PdfFieldValue[] }

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
      case 'save':
        return this.save(msg.values)
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

  private async save(values: PdfFieldValue[]): Promise<void> {
    if (values.length === 0) {
      return
    }
    const fileName = this.basename(this.target)
    const plural = values.length === 1 ? 'field' : 'fields'
    const choice = await vscode.window.showWarningMessage(
      `Save ${values.length} changed ${plural} in ${fileName}? This overwrites the original PDF.`,
      { modal: true, detail: 'The edited values are written and the file is saved in place.' },
      'Save'
    )
    if (choice !== 'Save') {
      await this.load() // discard the pending edits and re-enable the button
      return
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this.target)
      const updated = await setPdfFields(bytes, values)
      await vscode.workspace.fs.writeFile(this.target, updated)
      await this.load()
      vscode.window.showInformationMessage(`Toolkit: saved ${values.length} ${plural} in ${fileName}.`)
    } catch (error) {
      vscode.window.showErrorMessage(`Toolkit: could not save fields — ${String(error)}`)
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
