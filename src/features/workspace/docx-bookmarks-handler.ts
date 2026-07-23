/**
 * Message handler for the Word Bookmarks panel.
 *
 * Scans a set of .docx targets (an explicit selection, or every .docx in the
 * workspace), turns each document's analysis into flat table rows, and applies
 * consolidation fixes on demand — re-analyzing the touched file so the panel
 * updates live.
 */

import * as vscode from 'vscode'
import { analyzeDocx, analysisToRows, fixDocx, type BookmarkRow } from './docx-bookmarks-utils'

const EXCLUDE = '**/{node_modules,bin,obj,.git,.vs}/**'

type WebviewMessage =
  | { command: 'ready' }
  | { command: 'scanWorkspace' }
  | { command: 'fix'; file: string; part: string; name: string }
  | { command: 'fixAll' }
  | { command: 'revealFile'; file: string }

type ExtensionMessage =
  | { type: 'state'; scope: string; rows: BookmarkRow[]; scanning: boolean }
  | { type: 'scanning' }

export class DocxBookmarksHandler implements vscode.Disposable {
  private disposables: vscode.Disposable[] = []
  private rowsByFile = new Map<string, BookmarkRow[]>()

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
        return this.fixOne(msg.file, msg.part, msg.name)
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

  private async resolveDocxUris(): Promise<vscode.Uri[]> {
    if (this.targets.length > 0) {
      return this.targets
    }
    return vscode.workspace.findFiles('**/*.docx', EXCLUDE)
  }

  private async scanAndSend(): Promise<void> {
    this.post({ type: 'scanning' })
    const uris = await this.resolveDocxUris()
    this.rowsByFile.clear()
    for (const uri of uris) {
      this.rowsByFile.set(uri.fsPath, await this.analyzeFile(uri))
    }
    this.sendState()
  }

  private async analyzeFile(uri: vscode.Uri): Promise<BookmarkRow[]> {
    const relPath = vscode.workspace.asRelativePath(uri)
    let bytes: Uint8Array
    try {
      bytes = await vscode.workspace.fs.readFile(uri)
    } catch {
      return [{ file: uri.fsPath, relPath, part: '', name: '(unreadable)', kind: 'orphan-start', detail: 'Could not read the file.', runCount: 0, fixable: false }]
    }

    try {
      return analysisToRows(uri.fsPath, relPath, analyzeDocx(bytes))
    } catch {
      return [{ file: uri.fsPath, relPath, part: '', name: '(invalid)', kind: 'orphan-start', detail: 'Not a valid .docx document.', runCount: 0, fixable: false }]
    }
  }

  private allRows(): BookmarkRow[] {
    const all: BookmarkRow[] = []
    for (const rows of this.rowsByFile.values()) {
      all.push(...rows)
    }
    return all
  }

  private async fixOne(file: string, part: string, name: string): Promise<void> {
    const uri = vscode.Uri.file(file)
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      const result = fixDocx(bytes, [{ part, name }])
      if (result.fixed.length > 0) {
        await vscode.workspace.fs.writeFile(uri, result.buffer)
      }
      this.rowsByFile.set(file, await this.analyzeFile(uri))
      this.sendState()
    } catch (error) {
      vscode.window.showErrorMessage(`Toolkit: could not fix bookmark — ${String(error)}`)
      this.sendState()
    }
  }

  private async fixAll(): Promise<void> {
    const fixableFiles = [...this.rowsByFile.entries()].filter(([, rows]) => rows.some(r => r.fixable))
    const fixableCount = this.allRows().filter(r => r.fixable).length
    if (fixableCount === 0) {
      vscode.window.showInformationMessage('Toolkit: no fixable (split-run) bookmarks in the current scope.')
      return
    }
    const filePlural = fixableFiles.length === 1 ? 'file' : 'files'
    const bookmarkPlural = fixableCount === 1 ? 'bookmark' : 'bookmarks'
    const choice = await vscode.window.showWarningMessage(
      `Consolidate ${fixableCount} split ${bookmarkPlural} in ${fixableFiles.length} ${filePlural}? This rewrites the .docx in place.`,
      { modal: true, detail: 'Each affected bookmark is merged into a single run, keeping its formatting.' },
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
        const result = fixDocx(bytes)
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
    vscode.window.showInformationMessage(`Toolkit: consolidated ${fixed} bookmark(s) across ${fixableFiles.length} ${filePlural}.`)
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
