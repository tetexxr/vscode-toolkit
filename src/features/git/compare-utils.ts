import * as path from 'node:path'

/**
 * Parses the output of:
 *   git for-each-ref --sort=-committerdate refs/heads --format=%(refname:short)
 * Returns a clean list of branch names in the order git produced them.
 */
export function parseGitBranchList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Returns the path of `fileFsPath` relative to `repoRoot`, normalized to forward slashes
 * (what git expects in `git show <branch>:<path>`).
 */
export function relativizeToRepo(repoRoot: string, fileFsPath: string): string {
  const rel = path.relative(repoRoot, fileFsPath)
  return rel.split(path.sep).join('/')
}

export function buildDiffTitle(fileName: string, branch: string): string {
  return `${fileName} (${branch}) ↔ ${fileName}`
}

/** The kind of change a file underwent between the merge-base and the working tree. */
export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed'

export interface FileChange {
  status: ChangeStatus
  /** Path on the base branch (left side of the diff); `null` when the file was added. */
  oldPath: string | null
  /** Path in the working tree (right side of the diff); `null` when the file was deleted. */
  newPath: string | null
}

function mapStatusLetter(letter: string): ChangeStatus {
  switch (letter) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'type-changed'
    default:
      // M, and anything unexpected (e.g. unmerged), is treated as a modification.
      return 'modified'
  }
}

/**
 * Parses the NUL-separated output of:
 *   git diff --name-status -z <base>
 * Returns one {@link FileChange} per entry, resolving the left/right paths so the caller
 * knows which side exists. Renames/copies carry two path tokens (old, new); every other
 * status carries one.
 */
export function parseNameStatusZ(output: string): FileChange[] {
  const tokens = output.split('\0').filter(token => token.length > 0)
  const changes: FileChange[] = []
  let i = 0
  while (i < tokens.length) {
    const code = tokens[i++]
    const status = mapStatusLetter(code[0])
    if (status === 'renamed' || status === 'copied') {
      const oldPath = tokens[i++]
      const newPath = tokens[i++]
      if (oldPath === undefined || newPath === undefined) {
        break
      }
      changes.push({ status, oldPath, newPath })
      continue
    }
    const filePath = tokens[i++]
    if (filePath === undefined) {
      break
    }
    if (status === 'added') {
      changes.push({ status, oldPath: null, newPath: filePath })
    } else if (status === 'deleted') {
      changes.push({ status, oldPath: filePath, newPath: null })
    } else {
      changes.push({ status, oldPath: filePath, newPath: filePath })
    }
  }
  return changes
}

/** Title for the multi-file diff view, e.g. "src ↔ main · 3 files". */
export function buildMultiDiffTitle(scope: string, branch: string, count: number): string {
  const noun = count === 1 ? 'file' : 'files'
  return `${scope} ↔ ${branch} · ${count} ${noun}`
}
