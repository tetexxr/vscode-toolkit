import * as vscode from 'vscode'
import * as path from 'node:path'
import {
  BookmarkStore,
  findNextBookmark,
  findPreviousBookmark,
  formatBookmark,
  type BookmarkData,
  type BookmarkLocation
} from './bookmarks-utils'

const STORAGE_KEY = 'toolkit.bookmarks.v1'

class BookmarkController {
  private gutterDecoration: vscode.TextEditorDecorationType
  private highlightDecoration: vscode.TextEditorDecorationType
  private highlightEnabled = false
  private highlightColor = 'rgba(255,200,0,0.15)'
  private gutterEnabled = true

  constructor(
    private context: vscode.ExtensionContext,
    private store: BookmarkStore
  ) {
    const iconPath = vscode.Uri.file(path.join(context.extensionPath, 'themes', 'icons', 'bookmark.svg'))
    this.gutterDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconPath,
      gutterIconSize: 'contain'
    })
    this.highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: this.highlightColor,
      isWholeLine: true
    })
    this.refreshSettings()
  }

  refreshSettings(): void {
    const config = vscode.workspace.getConfiguration('toolkit.bookmarks')
    this.gutterEnabled = config.get<boolean>('gutterIcon', true)
    this.highlightEnabled = config.get<boolean>('highlightLine', false)
    const color = config.get<string>('highlightColor', 'rgba(255,200,0,0.15)')
    if (color !== this.highlightColor) {
      this.highlightDecoration.dispose()
      this.highlightColor = color
      this.highlightDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: color,
        isWholeLine: true
      })
    }
  }

  applyToEditor(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString()
    const bookmarks = this.store.getForUri(uri)
    const gutterOptions: vscode.DecorationOptions[] = []
    const highlightRanges: vscode.Range[] = []
    for (const b of bookmarks) {
      if (b.line >= editor.document.lineCount) {
        continue
      }
      const range = new vscode.Range(b.line, 0, b.line, editor.document.lineAt(b.line).text.length)
      const md = new vscode.MarkdownString(
        b.label ? `**Bookmark:** ${escapeMd(b.label)}` : '**Bookmark**',
        false
      )
      md.isTrusted = false
      gutterOptions.push({ range: new vscode.Range(b.line, 0, b.line, 0), hoverMessage: md })
      highlightRanges.push(range)
    }
    editor.setDecorations(this.gutterDecoration, this.gutterEnabled ? gutterOptions : [])
    editor.setDecorations(this.highlightDecoration, this.highlightEnabled ? highlightRanges : [])
  }

  applyToAllEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToEditor(editor)
    }
  }

  persist(): Thenable<void> {
    return this.context.workspaceState.update(STORAGE_KEY, this.store.serialize())
  }

  dispose(): void {
    this.gutterDecoration.dispose()
    this.highlightDecoration.dispose()
  }
}

function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!]/g, m => `\\${m}`)
}

async function toggleAt(controller: BookmarkController, store: BookmarkStore, askLabel: boolean): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const uri = editor.document.uri.toString()
  const line = editor.selection.active.line
  const existing = store.find(uri, line)
  if (existing) {
    store.toggle(uri, line)
    await controller.persist()
    controller.applyToEditor(editor)
    return
  }
  let label: string | undefined
  if (askLabel) {
    const input = await vscode.window.showInputBox({
      prompt: 'Bookmark label (optional)',
      placeHolder: 'e.g. "auth flow entry point"'
    })
    if (input === undefined) {
      return
    }
    label = input.trim() || undefined
  }
  store.toggle(uri, line, label)
  await controller.persist()
  controller.applyToEditor(editor)
}

async function editLabel(controller: BookmarkController, store: BookmarkStore): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const uri = editor.document.uri.toString()
  const line = editor.selection.active.line
  const existing = store.find(uri, line)
  if (!existing) {
    vscode.window.showInformationMessage('Toolkit: there is no bookmark on this line.')
    return
  }
  const input = await vscode.window.showInputBox({
    prompt: 'New label (empty to remove)',
    value: existing.label ?? ''
  })
  if (input === undefined) {
    return
  }
  store.setLabel(uri, line, input.trim() || undefined)
  await controller.persist()
  controller.applyToEditor(editor)
}

function relativeFor(uri: string): string {
  const u = vscode.Uri.parse(uri)
  const folder = vscode.workspace.getWorkspaceFolder(u)
  if (folder) {
    return path.relative(folder.uri.fsPath, u.fsPath).split(path.sep).join('/')
  }
  return path.basename(u.fsPath)
}

async function jumpTo(location: BookmarkLocation): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(location.uri))
    const editor = await vscode.window.showTextDocument(doc)
    const line = Math.min(location.line, doc.lineCount - 1)
    const position = new vscode.Position(line, 0)
    editor.selection = new vscode.Selection(position, position)
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
  } catch {
    vscode.window.showWarningMessage(`Toolkit: could not open ${relativeFor(location.uri)}.`)
  }
}

async function jumpToBookmark(store: BookmarkStore, direction: 'next' | 'previous'): Promise<void> {
  const locations = store.getAll().map(({ uri, bookmark }) => ({ uri, line: bookmark.line }))
  if (locations.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no bookmarks yet.')
    return
  }
  const editor = vscode.window.activeTextEditor
  const currentUri = editor?.document.uri.toString()
  const currentLine = editor?.selection.active.line ?? 0
  const target =
    direction === 'next'
      ? findNextBookmark(locations, currentUri, currentLine)
      : findPreviousBookmark(locations, currentUri, currentLine)
  if (target) {
    await jumpTo(target)
  }
}

async function showBookmarks(store: BookmarkStore): Promise<void> {
  const all = store.getAll()
  if (all.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no bookmarks yet.')
    return
  }

  const items: Array<vscode.QuickPickItem & { uri: string; line: number }> = []
  for (const { uri, bookmark } of all) {
    const relPath = relativeFor(uri)
    let lineText: string | undefined
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri)
    if (doc && bookmark.line < doc.lineCount) {
      lineText = doc.lineAt(bookmark.line).text
    }
    const formatted = formatBookmark(uri, bookmark, relPath, lineText)
    const item: vscode.QuickPickItem & { uri: string; line: number } = {
      label: formatted.label,
      description: formatted.description,
      uri,
      line: bookmark.line
    }
    if (formatted.detail) {
      item.detail = formatted.detail
    }
    items.push(item)
  }
  items.sort((a, b) =>
    a.description!.localeCompare(b.description!, undefined, { numeric: true, sensitivity: 'base' })
  )

  const picked = await vscode.window.showQuickPick(items, {
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder: `${items.length} bookmark${items.length === 1 ? '' : 's'} — pick one to navigate`
  })
  if (!picked) {
    return
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(picked.uri))
  const editor = await vscode.window.showTextDocument(doc)
  const targetLine = Math.min(picked.line, doc.lineCount - 1)
  const position = new vscode.Position(targetLine, 0)
  editor.selection = new vscode.Selection(position, position)
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

export function registerBookmarkCommands(context: vscode.ExtensionContext): void {
  const store = new BookmarkStore()
  const persisted = context.workspaceState.get<BookmarkData>(STORAGE_KEY, {})
  store.load(persisted)

  const controller = new BookmarkController(context, store)

  context.subscriptions.push(controller)
  controller.applyToAllEditors()

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => controller.applyToAllEditors()),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        controller.applyToEditor(editor)
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('toolkit.bookmarks')) {
        controller.refreshSettings()
        controller.applyToAllEditors()
      }
    }),
    vscode.workspace.onDidRenameFiles(event => {
      let moved = 0
      for (const { oldUri, newUri } of event.files) {
        moved += store.renamePath(oldUri.toString(), newUri.toString())
      }
      if (moved > 0) {
        void controller.persist()
        controller.applyToAllEditors()
      }
    }),
    vscode.workspace.onDidDeleteFiles(event => {
      let removed = 0
      for (const uri of event.files) {
        removed += store.deletePath(uri.toString())
      }
      if (removed > 0) {
        void controller.persist()
      }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      const uri = event.document.uri.toString()
      if (store.getForUri(uri).length === 0) {
        return
      }
      const sortedChanges = [...event.contentChanges].sort(
        (a, b) => b.range.start.line - a.range.start.line
      )
      for (const change of sortedChanges) {
        store.adjustForChange(uri, { range: change.range, text: change.text })
      }
      void controller.persist()
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === uri) {
          controller.applyToEditor(editor)
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.bookmarks.toggle', () => toggleAt(controller, store, false)),
    vscode.commands.registerCommand('toolkit.bookmarks.toggleWithLabel', () =>
      toggleAt(controller, store, true)
    ),
    vscode.commands.registerCommand('toolkit.bookmarks.editLabel', () => editLabel(controller, store)),
    vscode.commands.registerCommand('toolkit.bookmarks.show', () => showBookmarks(store)),
    vscode.commands.registerCommand('toolkit.bookmarks.next', () => jumpToBookmark(store, 'next')),
    vscode.commands.registerCommand('toolkit.bookmarks.previous', () => jumpToBookmark(store, 'previous')),
    vscode.commands.registerCommand('toolkit.bookmarks.clearFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const uri = editor.document.uri.toString()
      const count = store.clearForUri(uri)
      if (count === 0) {
        vscode.window.showInformationMessage('Toolkit: no bookmarks in this file.')
        return
      }
      await controller.persist()
      controller.applyToEditor(editor)
      vscode.window.showInformationMessage(`Toolkit: cleared ${count} bookmark${count === 1 ? '' : 's'} from this file.`)
    }),
    vscode.commands.registerCommand('toolkit.bookmarks.clearAll', async () => {
      const total = store.getAll().length
      if (total === 0) {
        vscode.window.showInformationMessage('Toolkit: no bookmarks to clear.')
        return
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear all ${total} bookmarks in this workspace?`,
        { modal: true },
        'Clear All'
      )
      if (choice !== 'Clear All') {
        return
      }
      store.clearAll()
      await controller.persist()
      controller.applyToAllEditors()
    })
  )
}
