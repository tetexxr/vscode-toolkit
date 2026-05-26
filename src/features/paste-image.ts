import * as vscode from 'vscode'
import * as path from 'node:path'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import {
  detectFormat,
  formatTimestamp,
  relativizePath,
  renderLink,
  resolveTargetPath,
  sanitizeFilename,
  type ImageFormat
} from './paste-image-utils'
import { ClipboardImageError, saveClipboardImage } from './paste-image-clipboard'

type ForcedFormat = 'auto' | 'markdown' | 'html'

async function pasteImage(forcedFormat: ForcedFormat): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('Toolkit: open a file before pasting an image.')
    return
  }

  const config = vscode.workspace.getConfiguration('toolkit.pasteImage')
  const directory = config.get<string>('directory', 'assets/images')
  const basePath = config.get<'file' | 'workspace'>('basePath', 'file')
  const naming = config.get<'timestamp' | 'prompt'>('naming', 'timestamp')
  const timestampFormat = config.get<string>('timestampFormat', 'YYYYMMDD-HHmmss')
  const formatConfig = (forcedFormat === 'auto' ? config.get<ForcedFormat>('format', 'auto') : forcedFormat)
  const useForwardSlashes = config.get<boolean>('useForwardSlashes', true)
  const htmlAttributes = config.get<string>('htmlAttributes', '')

  // Determine where to save
  const docUri = editor.document.uri
  const isUntitled = editor.document.isUntitled
  let baseDir: string
  if (basePath === 'workspace') {
    const folder = vscode.workspace.getWorkspaceFolder(docUri) ?? vscode.workspace.workspaceFolders?.[0]
    if (!folder) {
      vscode.window.showWarningMessage('Toolkit: no workspace folder available — falling back to the file directory.')
      if (isUntitled) {
        vscode.window.showWarningMessage('Toolkit: cannot paste image into an untitled, unsaved document.')
        return
      }
      baseDir = path.dirname(docUri.fsPath)
    } else {
      baseDir = folder.uri.fsPath
    }
  } else {
    if (isUntitled) {
      vscode.window.showWarningMessage('Toolkit: save the file first so the image can be placed next to it.')
      return
    }
    baseDir = path.dirname(docUri.fsPath)
  }

  const absoluteDirectory = path.isAbsolute(directory) ? directory : path.join(baseDir, directory)

  // Determine filename
  const timestamp = formatTimestamp(new Date(), timestampFormat)
  const defaultFilename = `image-${timestamp}.png`
  let filename = defaultFilename
  if (naming === 'prompt') {
    const userInput = await vscode.window.showInputBox({
      prompt: 'File name (without extension)',
      value: `image-${timestamp}`,
      validateInput: value => (value.trim().length === 0 ? 'Name cannot be empty.' : null)
    })
    if (userInput === undefined) {
      return
    }
    const safe = sanitizeFilename(userInput.trim())
    if (!safe) {
      vscode.window.showWarningMessage('Toolkit: name was empty after sanitization.')
      return
    }
    filename = safe.endsWith('.png') ? safe : `${safe}.png`
  }

  // Ensure target directory exists
  try {
    mkdirSync(absoluteDirectory, { recursive: true })
  } catch (error) {
    vscode.window.showWarningMessage(`Toolkit: could not create directory ${absoluteDirectory}: ${(error as Error).message}`)
    return
  }

  // Resolve final target path (avoid collisions)
  const existing = new Set(readdirSync(absoluteDirectory).map(f => path.join(absoluteDirectory, f)))
  const targetPath = resolveTargetPath(absoluteDirectory, filename, existing)

  // Extract image from clipboard
  try {
    await saveClipboardImage(targetPath)
  } catch (error) {
    if (error instanceof ClipboardImageError) {
      vscode.window.showWarningMessage(`Toolkit: ${error.message}`)
      tryCleanupEmpty(targetPath)
      return
    }
    throw error
  }

  // Resolve the link path embedded in the document — always relative to the active file
  const referenceFile = isUntitled ? path.join(baseDir, 'untitled') : docUri.fsPath
  const relPath = relativizePath(referenceFile, targetPath, useForwardSlashes)

  const format: ImageFormat = detectFormat(isUntitled ? undefined : path.basename(docUri.fsPath), formatConfig)
  const link = renderLink(format, relPath, { htmlAttributes })

  await editor.edit(builder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        builder.insert(selection.active, link)
      } else {
        builder.replace(selection, link)
      }
    }
  })
}

function tryCleanupEmpty(targetPath: string): void {
  try {
    if (existsSync(targetPath)) {
      const fs = require('node:fs') as typeof import('node:fs')
      if (fs.statSync(targetPath).size === 0) {
        unlinkSync(targetPath)
      }
    }
  } catch {
    // best-effort cleanup
  }
}

export function registerPasteImageCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.pasteImage', () => pasteImage('auto')),
    vscode.commands.registerCommand('toolkit.pasteImage.markdown', () => pasteImage('markdown')),
    vscode.commands.registerCommand('toolkit.pasteImage.html', () => pasteImage('html'))
  )
}
