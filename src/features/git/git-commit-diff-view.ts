import * as vscode from 'vscode'
import { getCommitParents, getFileAtRef } from '../../utils/git'

// A read-only virtual document serving a file's contents at a specific commit.
// Backing the diff editor's sides with this scheme (rather than the inline
// webview renderer) lets VS Code tokenize each side with the file's own
// language grammar and theme — the native, syntax-highlighted diff the
// built-in Source Control graph shows.
const SCHEME = 'toolkit-commit-file'

/**
 * Builds the virtual-document URI for `relativePath` as it existed at `ref`.
 * The path carries the real file name so VS Code can derive the language from
 * its extension; the repo root and ref travel in the query (appending the ref
 * to the path would make (ref 'a', path 'b/c.ts') collide with
 * (ref 'a/b', path 'c.ts')).
 */
function buildUri(repoRoot: string, ref: string, relativePath: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: `/${relativePath}`,
    query: `${encodeURIComponent(repoRoot)}|${encodeURIComponent(ref)}`
  })
}

class CommitFileContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [repo, ref] = uri.query.split('|')
    const repoRoot = decodeURIComponent(repo ?? '')
    const decodedRef = decodeURIComponent(ref ?? '')
    // Empty ref = the empty side of an add/root-commit diff: serve nothing.
    if (!repoRoot || !decodedRef) return ''
    const relativePath = uri.path.replace(/^\//, '')
    try {
      return await getFileAtRef(repoRoot, decodedRef, relativePath)
    } catch {
      // The path didn't exist at this ref (added on the right, deleted on the
      // left, or renamed) — that side of the diff is legitimately empty.
      return ''
    }
  }
}

/**
 * Opens `relativePath`'s change in `hash` in the native diff editor, comparing
 * the file at the commit's first parent against the commit itself. Root commits
 * (no parent) diff against an empty left side.
 */
export async function openCommitFileDiff(repoRoot: string, hash: string, relativePath: string): Promise<void> {
  try {
    const parents = await getCommitParents(repoRoot, hash)
    const parentRef = parents[0] ?? ''
    const left = buildUri(repoRoot, parentRef, relativePath)
    const right = buildUri(repoRoot, hash, relativePath)
    const fileName = relativePath.split('/').pop() ?? relativePath
    const title = `${fileName} (${hash.slice(0, 7)})`
    await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true })
  } catch (err) {
    vscode.window.showErrorMessage(`Could not open diff: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function registerCommitDiffView(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, new CommitFileContentProvider()))
}
