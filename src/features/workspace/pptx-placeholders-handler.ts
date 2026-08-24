/**
 * Message handler for the PowerPoint Placeholders panel.
 *
 * Scans a set of .pptx targets (an explicit selection, or every .pptx in the
 * workspace), turns each presentation's analysis into flat table rows, and
 * consolidates split placeholders on demand — re-analyzing the touched file so
 * the panel updates live.
 */

import * as vscode from 'vscode'
import { analyzePptx, analysisToRows, fixPptx, type PlaceholderRow } from './pptx-placeholders-utils'

const EXCLUDE = '**/{node_modules,bin,obj,.git,.vs}/**'

type WebviewMessage =
  | { command: 'ready' }
  | { command: 'scanWorkspace' }
  | { command: 'fix'; file: string; part: string; target: string }
  | { command: 'fixAll' }
  | { command: 'revealFile'; file: string }

type ExtensionMessage =
  | { type: 'state'; scope: string; rows: PlaceholderRow[]; scanning: boolean }
  | { type: 'scanning' }

export class PptxPlaceholdersHandler implements vscode.Disposable {
  private disposables: vscode.Disposable[] = []
  private rowsByFile = new Map<string, PlaceholderRow[]>()

  constructor(
    private webview: vscode.Webview,
    private targets: vscode.Uri[],
    private autoFix: boolean
  ) {
    this.disposables.push(this.webview.onDidReceiveMessage((msg: WebviewMessage) => this.handleMessage(msg)))
  }

  public async retarget(targets: vscode.Uri[], autoFix: boolean): Promise<void> {
    this.targets = targets
    this.autoFix = autoFix
    await this.onReady()
  }

  private get scopeLabel(): string {
    return this.targets.length > 0 ? `${this.targets.length} selected file(s)` : 'workspace'
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'ready':
        return this.onReady()
      case 'scanWorkspace':
        this.targets = []
        return this.scanAndSend()
      case 'fix':
        return this.fixOne(msg.file, msg.part, msg.target)
      case 'fixAll':
        return this.fixAll()
      case 'revealFile':
        return void vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.file))
    }
  }

  private async onReady(): Promise<void> {
    await this.scanAndSend()
    if (this.autoFix) {
      this.autoFix = false
      await this.fixAll()
    }
  }

  private async resolvePptxUris(): Promise<vscode.Uri[]> {
    if (this.targets.length > 0) {
      return this.targets
    }
    return vscode.workspace.findFiles('**/*.pptx', EXCLUDE)
  }

  private async scanAndSend(): Promise<void> {
    this.post({ type: 'scanning' })
    const uris = await this.resolvePptxUris()
    this.rowsByFile.clear()
    for (const uri of uris) {
      this.rowsByFile.set(uri.fsPath, await this.analyzeFile(uri))
    }
    this.sendState()
  }

  private async analyzeFile(uri: vscode.Uri): Promise<PlaceholderRow[]> {
    const relPath = vscode.workspace.asRelativePath(uri)
    const failed = (name: string, detail: string): PlaceholderRow[] => [
      { file: uri.fsPath, relPath, part: '', location: '', name, target: name, kind: 'malformed', detail, runCount: 0, uses: 1, fixable: false }
    ]

    let bytes: Uint8Array
    try {
      bytes = await vscode.workspace.fs.readFile(uri)
    } catch {
      return failed('(unreadable)', 'Could not read the file.')
    }

    try {
      return analysisToRows(uri.fsPath, relPath, analyzePptx(bytes))
    } catch {
      return failed('(invalid)', 'Not a valid .pptx presentation.')
    }
  }

  private allRows(): PlaceholderRow[] {
    const all: PlaceholderRow[] = []
    for (const rows of this.rowsByFile.values()) {
      all.push(...rows)
    }
    return all
  }

  private async fixOne(file: string, part: string, target: string): Promise<void> {
    const uri = vscode.Uri.file(file)
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      const result = fixPptx(bytes, [{ part, name: target }])
      if (result.fixed.length > 0) {
        await vscode.workspace.fs.writeFile(uri, result.buffer)
      }
      this.rowsByFile.set(file, await this.analyzeFile(uri))
      this.sendState()
    } catch (error) {
      vscode.window.showErrorMessage(`Toolkit: could not fix placeholder — ${String(error)}`)
      this.sendState()
    }
  }

  private async fixAll(): Promise<void> {
    const fixableFiles = [...this.rowsByFile.entries()].filter(([, rows]) => rows.some(r => r.fixable))
    const fixableCount = this.allRows().filter(r => r.fixable).length
    if (fixableCount === 0) {
      vscode.window.showInformationMessage('Toolkit: no fixable placeholders in the current scope.')
      return
    }
    const filePlural = fixableFiles.length === 1 ? 'file' : 'files'
    const placeholderPlural = fixableCount === 1 ? 'placeholder' : 'placeholders'
    const choice = await vscode.window.showWarningMessage(
      `Fix ${fixableCount} ${placeholderPlural} in ${fixableFiles.length} ${filePlural}? This rewrites the .pptx in place.`,
      {
        modal: true,
        detail:
          'Split placeholders are merged into a single run, and loosely written names are canonicalised ({{ work centers }} → {{WorkCenters}}). The text around them keeps its own formatting.',
      },
      'Fix'
    )
    if (choice !== 'Fix') {
      return
    }
    let fixed = 0
    for (const [file] of fixableFiles) {
      const uri = vscode.Uri.file(file)
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const result = fixPptx(bytes)
        if (result.fixed.length > 0) {
          await vscode.workspace.fs.writeFile(uri, result.buffer)
          fixed += result.fixed.length
        }
        this.rowsByFile.set(file, await this.analyzeFile(uri))
      } catch (error) {
        vscode.window.showErrorMessage(`Toolkit: could not fix ${vscode.workspace.asRelativePath(uri)} — ${String(error)}`)
      }
    }
    this.sendState()
    vscode.window.showInformationMessage(`Toolkit: fixed ${fixed} placeholder(s) across ${fixableFiles.length} ${filePlural}.`)
  }

  private sendState(): void {
    this.post({ type: 'state', scope: this.scopeLabel, rows: this.allRows(), scanning: false })
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
