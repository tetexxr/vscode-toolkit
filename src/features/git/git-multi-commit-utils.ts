/** A repository that has staged changes and may be selected in the SCM view. */
export interface StagedRepo {
  selectedInScm: boolean
}

/**
 * Decides which candidate repos start pre-checked in the confirmation list.
 * When the user has explicitly selected repos in the SCM "Repositories" view,
 * those drive the pre-selection; otherwise every candidate is pre-checked.
 */
export function computePrechecked(candidates: readonly StagedRepo[]): boolean[] {
  const anySelected = candidates.some(c => c.selectedInScm)
  return candidates.map(c => (anySelected ? c.selectedInScm : true))
}
