/**
 * Pure helpers for the Diff Tools feature. vscode-free for mocha.
 */

import * as path from 'node:path'
import { extForLanguage } from './scratch-utils'

/**
 * The file extension to give a virtual diff document so VS Code highlights it
 * with the right language. Uses the source file's extension when it has one,
 * otherwise derives it from the language id.
 */
export function resolveDiffExtension(fileName: string, languageId: string): string {
  const ext = path.extname(fileName)
  return ext.length > 0 ? ext : `.${extForLanguage(languageId)}`
}

export function compareTitle(left: string, right: string): string {
  return `${left} ↔ ${right}`
}
