/**
 * Shared path helpers for NuGet handlers.
 *
 * `findAuxiliaryFiles` returns every file path that *could* affect a project's
 * resolved package set (CPM, Directory.Build.props, NuGet.config) so callers
 * can hash their mtimes for a cache fingerprint.
 */

import * as path from 'path'

/** Files (relative to a project's parent dirs) that affect the resolved package set. */
export const PARENT_AUX_FILES = [
  'Directory.Packages.props',
  'Directory.Build.props',
  'Directory.Build.targets',
  'NuGet.config',
  'nuget.config'
]

/** Walk every parent directory of `projectFsPath` collecting candidate aux-file paths. */
export function findAuxiliaryFiles(projectFsPath: string): string[] {
  const found: string[] = []
  let dir = path.dirname(projectFsPath)
  const root = path.parse(dir).root
  while (dir && dir !== root) {
    for (const name of PARENT_AUX_FILES) {
      found.push(path.join(dir, name))
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return found
}
