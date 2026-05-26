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
