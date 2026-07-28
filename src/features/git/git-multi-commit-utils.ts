/** A repository a multi-repo action can target, and whether it is selected in the SCM view. */
export interface SelectableRepo {
  selectedInScm: boolean
}

export interface PartitionedTargets<T> {
  /** Repositories the action can run on. */
  candidates: T[]
  /** Repositories selected in the SCM view that the action cannot run on. */
  ignored: T[]
}

/**
 * Splits repositories into the ones an action can run on and the ones the user
 * selected in the SCM view but that have nothing to do (nothing staged, no
 * upstream to pull from...). The latter are surfaced in the picker as
 * non-runnable rows so a selected repository is never silently dropped;
 * unselected repositories with nothing to do are simply left out.
 */
export function partitionTargets<T extends SelectableRepo>(
  repos: readonly T[],
  canRun: (repo: T) => boolean
): PartitionedTargets<T> {
  return {
    candidates: repos.filter(r => canRun(r)),
    ignored: repos.filter(r => r.selectedInScm && !canRun(r))
  }
}

/**
 * Decides which candidate repos start pre-checked in the confirmation list.
 * When the user has explicitly selected repos in the SCM "Repositories" view,
 * those drive the pre-selection; otherwise every candidate is pre-checked.
 */
export function computePrechecked(candidates: readonly SelectableRepo[]): boolean[] {
  const anySelected = candidates.some(c => c.selectedInScm)
  return candidates.map(c => (anySelected ? c.selectedInScm : true))
}

/**
 * When the user has multi-selected (2 or more) candidate repos in the SCM view,
 * that is already an unambiguous choice, so the confirmation picker can be skipped:
 * returns those selected candidates. With 0 or 1 selected it returns null, meaning
 * the picker should be shown instead.
 */
export function autoSelectedTargets<T extends SelectableRepo>(candidates: readonly T[]): T[] | null {
  const selected = candidates.filter(c => c.selectedInScm)
  return selected.length >= 2 ? selected : null
}

/**
 * Repository roots the command was invoked on from the SCM "Repositories" view.
 *
 * When a command contributed to the `scm/sourceControl` menu runs against a
 * multi-selection, VS Code passes the picked SourceControl objects as arguments
 * (the focused one plus, for a multi-selection, an array of all selected). Each
 * carries a `rootUri`, so we collect those `fsPath`s to know exactly which repos
 * the user targeted — a repository's `ui.selected` flag only reflects the single
 * focused repo, not the whole multi-selection. Returns an empty set when invoked
 * without args (e.g. from the Command Palette), and tolerates arbitrarily nested
 * argument arrays.
 */
export function selectedRootsFromArgs(args: readonly unknown[]): Set<string> {
  const roots = new Set<string>()
  const visit = (x: unknown): void => {
    if (!x) {
      return
    }
    if (Array.isArray(x)) {
      x.forEach(visit)
      return
    }
    const uri = (x as { rootUri?: { fsPath?: unknown } }).rootUri
    if (uri && typeof uri.fsPath === 'string') {
      roots.add(uri.fsPath)
    }
  }
  args.forEach(visit)
  return roots
}
