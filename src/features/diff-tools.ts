import * as vscode from 'vscode'
import * as path from 'node:path'
import { compareTitle, resolveDiffExtension } from './diff-tools-utils'

const SCHEME = 'toolkit-diff'
const CACHE_MAX_ENTRIES = 100

/** Serves ad-hoc snapshots (clipboard text, a selection) as read-only virtual
 * documents, so the diff editor doesn't materialize standalone tabs. */
class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>()
  private emitter = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this.emitter.event
  private counter = 0

  set(name: string, ext: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${name}${ext}`, query: String(this.counter++) })
    const key = uri.toString()
    this.cache.set(key, content)
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
    this.emitter.fire(uri)
    return uri
  }

  delete(uri: vscode.Uri): void {
    this.cache.delete(uri.toString())
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? ''
  }
}

async function compareWithClipboard(provider: DiffContentProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('Toolkit: open a file to compare with the clipboard.')
    return
  }
  const clipboard = await vscode.env.clipboard.readText()
  if (clipboard.length === 0) {
    vscode.window.showInformationMessage('Toolkit: the clipboard is empty.')
    return
  }
  const document = editor.document
  const ext = resolveDiffExtension(document.fileName, document.languageId)
  const rightUri = provider.set('Clipboard', ext, clipboard)

  const selection = editor.selection
  if (!selection.isEmpty) {
    const leftUri = provider.set('Selection', ext, document.getText(selection))
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, compareTitle('Selection', 'Clipboard'))
    return
  }
  const leftName = document.isUntitled ? 'Untitled' : path.basename(document.fileName)
  await vscode.commands.executeCommand('vscode.diff', document.uri, rightUri, compareTitle(leftName, 'Clipboard'))
}

function openTextTabUris(): vscode.Uri[] {
  const uris: vscode.Uri[] = []
  const seen = new Set<string>()
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const key = tab.input.uri.toString()
        if (!seen.has(key)) {
          seen.add(key)
          uris.push(tab.input.uri)
        }
      }
    }
  }
  return uris
}

async function compareWithOpenFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('Toolkit: open a file to compare.')
    return
  }
  const activeKey = editor.document.uri.toString()
  const candidates = openTextTabUris().filter(uri => uri.toString() !== activeKey)
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('Toolkit: open another file in a tab to compare against.')
    return
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map(uri => ({ label: path.basename(uri.path), description: vscode.workspace.asRelativePath(uri), uri })),
    { placeHolder: 'Compare the active file against which open file?', matchOnDescription: true }
  )
  if (!picked) {
    return
  }
  const title = compareTitle(path.basename(editor.document.fileName) || 'Active', picked.label)
  await vscode.commands.executeCommand('vscode.diff', picked.uri, editor.document.uri, title)
}

export function registerDiffToolsCommands(context: vscode.ExtensionContext): void {
  const provider = new DiffContentProvider()
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.scheme === SCHEME) {
        provider.delete(doc.uri)
      }
    }),
    vscode.commands.registerCommand('toolkit.diff.withClipboard', () => compareWithClipboard(provider)),
    vscode.commands.registerCommand('toolkit.diff.withOpenFile', () => compareWithOpenFile())
  )
}
