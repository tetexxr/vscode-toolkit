/**
 * Single shared OutputChannel for the extension. Features should use this for
 * "informational" errors that are NOT shown to the user as toasts — things
 * like "git blame failed for an untracked file" or "package.json could not be
 * read" — so a curious user can still inspect them via
 * "Output: Toolkit" in the Command Palette.
 *
 * The channel is created lazily on first use, so this module is free to import
 * from any vscode-dependent file without an activation-time cost.
 *
 * NOTE: do not import this from a pure `*-utils.ts` file that has its own
 * unit tests — those modules deliberately avoid the `vscode` import so they
 * can run under mocha, and this module brings `vscode` along transitively.
 */

import * as vscode from 'vscode'

let channel: vscode.OutputChannel | undefined

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Toolkit')
  }
  return channel
}

function format(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`
  }
  return String(err)
}

/** Log a non-fatal error with a scope tag so users can grep the channel. */
export function logError(scope: string, err: unknown): void {
  getChannel().appendLine(`[${new Date().toISOString()}] [error] [${scope}] ${format(err)}`)
}

/** Log a warning (e.g. unexpected but recoverable state). */
export function logWarn(scope: string, message: string): void {
  getChannel().appendLine(`[${new Date().toISOString()}] [warn]  [${scope}] ${message}`)
}

/**
 * Informational log. Reserve this for completed operations whose timing or
 * volume might matter when diagnosing a slowness report — NOT per-keystroke
 * or per-iteration noise.
 */
export function logInfo(scope: string, message: string): void {
  getChannel().appendLine(`[${new Date().toISOString()}] [info]  [${scope}] ${message}`)
}
