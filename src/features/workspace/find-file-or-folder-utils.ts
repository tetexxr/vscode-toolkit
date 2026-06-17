/**
 * Pure helpers for the Find File or Folder picker, extracted so they can be unit tested
 * without pulling in the vscode API.
 */

export function removeFromRecent(recent: readonly string[], fsPath: string): string[] | null {
  if (!recent.includes(fsPath)) {
    return null
  }
  return recent.filter(p => p !== fsPath)
}
