import * as vscode from 'vscode'
import * as path from 'node:path'
import {
  CURATED_LANGUAGES,
  extForLanguage,
  nextScratchName,
  sortScratchNames
} from './scratch-utils'
import { logError } from '../utils/logger'

const VIEW_ID = 'toolkitScratchFiles'
const STORAGE_DIR = 'scratches'
// Maps a scratch file name → its language id, so a scratch created with a
// language whose extension we don't know (the "Other…" path) still reopens in
// the right mode. Lives in globalState alongside the files themselves.
const STATE_LANGUAGES = 'scratch.languages'

let stateStore: vscode.Memento | undefined

/* -------------------------------------------------------------------------- */
/*  Language association                                                      */
/* -------------------------------------------------------------------------- */

function languageMap(): Record<string, string> {
  return { ...(stateStore?.get<Record<string, string>>(STATE_LANGUAGES, {}) ?? {}) }
}

async function rememberLanguage(fileName: string, languageId: string): Promise<void> {
  const map = languageMap()
  map[fileName] = languageId
  await stateStore?.update(STATE_LANGUAGES, map)
}

async function forgetLanguage(fileName: string): Promise<void> {
  const map = languageMap()
  if (fileName in map) {
    delete map[fileName]
    await stateStore?.update(STATE_LANGUAGES, map)
  }
}

async function renameLanguage(oldName: string, newName: string): Promise<void> {
  const map = languageMap()
  if (oldName in map) {
    map[newName] = map[oldName]
    delete map[oldName]
    await stateStore?.update(STATE_LANGUAGES, map)
  }
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

class ScratchStore {
  readonly dir: vscode.Uri

  constructor(globalStorage: vscode.Uri) {
    this.dir = vscode.Uri.joinPath(globalStorage, STORAGE_DIR)
  }

  uriFor(name: string): vscode.Uri {
    return vscode.Uri.joinPath(this.dir, name)
  }

  /** Lists scratch file names, newest first. */
  async list(): Promise<string[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.dir)
      const files = entries.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name)
      return sortScratchNames(files)
    } catch {
      return []
    }
  }

  /** Creates a new scratch with the given content and language, returning its uri. */
  async create(languageId: string, content: string): Promise<vscode.Uri> {
    await vscode.workspace.fs.createDirectory(this.dir)
    const existing = await this.list()
    const name = nextScratchName(existing, extForLanguage(languageId))
    const uri = this.uriFor(name)
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
    await rememberLanguage(name, languageId)
    return uri
  }
}

/* -------------------------------------------------------------------------- */
/*  Tree view                                                                 */
/* -------------------------------------------------------------------------- */

interface ScratchNode {
  uri: vscode.Uri
  name: string
}

class ScratchProvider implements vscode.TreeDataProvider<ScratchNode> {
  private emitter = new vscode.EventEmitter<ScratchNode | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  constructor(private readonly store: ScratchStore) {}

  refresh(): void {
    this.emitter.fire()
  }

  getTreeItem(node: ScratchNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None)
    item.resourceUri = node.uri
    item.contextValue = 'scratch'
    const languageId = languageMap()[node.name]
    if (languageId) {
      item.description = languageId
    }
    item.tooltip = node.uri.fsPath
    item.command = {
      title: 'Open Scratch',
      command: 'toolkit.scratch.open',
      arguments: [node]
    }
    return item
  }

  async getChildren(parent?: ScratchNode): Promise<ScratchNode[]> {
    if (parent) {
      return []
    }
    const names = await this.store.list()
    return names.map(name => ({ name, uri: this.store.uriFor(name) }))
  }
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

async function openScratch(uri: vscode.Uri, name: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri)
  const languageId = languageMap()[name]
  if (languageId && document.languageId !== languageId) {
    await vscode.languages.setTextDocumentLanguage(document, languageId)
  }
  await vscode.window.showTextDocument(document)
}

/** Prompts for a language: the curated list first, then "Other…" for the full set. */
async function pickLanguage(): Promise<string | undefined> {
  const OTHER = 'other'
  const items: Array<vscode.QuickPickItem & { languageId: string }> = CURATED_LANGUAGES.map(lang => ({
    label: lang.label,
    languageId: lang.languageId
  }))
  items.push({ label: 'Other…', description: 'Pick from all installed languages', languageId: OTHER })

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Language for the new scratch file' })
  if (!picked) {
    return undefined
  }
  if (picked.languageId !== OTHER) {
    return picked.languageId
  }
  const all = (await vscode.languages.getLanguages()).sort((a, b) => a.localeCompare(b))
  return vscode.window.showQuickPick(all, { placeHolder: 'Pick a language' })
}

async function newScratch(store: ScratchStore, provider: ScratchProvider): Promise<void> {
  const languageId = await pickLanguage()
  if (!languageId) {
    return
  }
  const uri = await store.create(languageId, '')
  provider.refresh()
  await openScratch(uri, path.basename(uri.path))
}

async function newScratchFromSelection(store: ScratchStore, provider: ScratchProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('Toolkit: open a file and select some text first.')
    return
  }
  const selection = editor.selection
  const content = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection)
  const uri = await store.create(editor.document.languageId, content)
  provider.refresh()
  await openScratch(uri, path.basename(uri.path))
}

async function renameScratch(store: ScratchStore, provider: ScratchProvider, node: ScratchNode): Promise<void> {
  const newName = await vscode.window.showInputBox({
    prompt: 'New scratch file name',
    value: node.name,
    validateInput: value => {
      const trimmed = value.trim()
      if (!trimmed) {
        return 'Name cannot be empty.'
      }
      if (/[\\/]/.test(trimmed)) {
        return 'Name cannot contain path separators.'
      }
      return undefined
    }
  })
  if (!newName || newName.trim() === node.name) {
    return
  }
  const target = store.uriFor(newName.trim())
  try {
    await vscode.workspace.fs.rename(node.uri, target, { overwrite: false })
    await renameLanguage(node.name, newName.trim())
    provider.refresh()
  } catch (err) {
    logError('scratch:rename', err)
    vscode.window.showWarningMessage(`Toolkit: could not rename to "${newName.trim()}" (does it already exist?).`)
  }
}

async function deleteScratch(provider: ScratchProvider, node: ScratchNode): Promise<void> {
  // Sent to the OS trash, so a mistaken delete is still recoverable.
  await vscode.workspace.fs.delete(node.uri, { useTrash: true })
  await forgetLanguage(node.name)
  provider.refresh()
}

async function moveToWorkspace(provider: ScratchProvider, node: ScratchNode): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    vscode.window.showInformationMessage('Toolkit: open a folder or workspace first to move a scratch into it.')
    return
  }
  let folder = folders[0]
  if (folders.length > 1) {
    const picked = await vscode.window.showQuickPick(
      folders.map(f => ({ label: f.name, folder: f })),
      { placeHolder: 'Move the scratch into which workspace folder?' }
    )
    if (!picked) {
      return
    }
    folder = picked.folder
  }
  const name = await vscode.window.showInputBox({
    prompt: `File name inside "${folder.name}"`,
    value: node.name,
    validateInput: value => (value.trim() ? undefined : 'Name cannot be empty.')
  })
  if (!name) {
    return
  }
  const dest = vscode.Uri.joinPath(folder.uri, name.trim())
  let overwrite = false
  try {
    await vscode.workspace.fs.stat(dest)
    const choice = await vscode.window.showWarningMessage(
      `"${name.trim()}" already exists in "${folder.name}". Overwrite it?`,
      { modal: true },
      'Overwrite'
    )
    if (choice !== 'Overwrite') {
      return
    }
    overwrite = true
  } catch {
    // Destination is free.
  }
  try {
    await vscode.workspace.fs.copy(node.uri, dest, { overwrite })
    await vscode.workspace.fs.delete(node.uri, { useTrash: false })
    await forgetLanguage(node.name)
    provider.refresh()
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(dest))
  } catch (err) {
    logError('scratch:moveToWorkspace', err)
    vscode.window.showWarningMessage('Toolkit: could not move the scratch into the workspace.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerScratchCommands(context: vscode.ExtensionContext): void {
  stateStore = context.globalState
  const store = new ScratchStore(context.globalStorageUri)
  const provider = new ScratchProvider(store)
  context.subscriptions.push(vscode.window.createTreeView<ScratchNode>(VIEW_ID, { treeDataProvider: provider }))

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.scratch.new', () => newScratch(store, provider)),
    vscode.commands.registerCommand('toolkit.scratch.newFromSelection', () =>
      newScratchFromSelection(store, provider)
    ),
    vscode.commands.registerCommand('toolkit.scratch.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('toolkit.scratch.open', (node: ScratchNode) => openScratch(node.uri, node.name)),
    vscode.commands.registerCommand('toolkit.scratch.rename', (node: ScratchNode) =>
      renameScratch(store, provider, node)
    ),
    vscode.commands.registerCommand('toolkit.scratch.delete', (node: ScratchNode) => deleteScratch(provider, node)),
    vscode.commands.registerCommand('toolkit.scratch.moveToWorkspace', (node: ScratchNode) =>
      moveToWorkspace(provider, node)
    )
  )
}
