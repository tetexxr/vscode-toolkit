/**
 * Centralized semantic color palette for the whole extension.
 *
 * Single source of truth: change a token here and every panel, badge and
 * editor decoration updates. Values come from the One Dark family, which the
 * extension already leaned on (csv-rainbow, version-bump labels, syntax theme).
 *
 * Two layers:
 *  - `color.*`   raw hex tokens — use in editor decorations (TextEditorDecorationType)
 *                and anywhere a plain color string is needed.
 *  - `cssColor.*` webview CSS values that honour the user's VS Code theme first
 *                and fall back to our token, so panels adapt to light/dark themes.
 *                Use these inside webview <style> template literals.
 */

/** Raw One Dark tokens — single source of truth. */
export const color = {
  /** green — ok / up-to-date / success / added / patch / strong */
  success: '#98C379',
  /** amber — update available / outdated / warning / modified / minor */
  warning: '#E5C07B',
  /** red — error / 5xx / deleted / danger / major / vulnerability */
  error: '#E06C75',
  /** blue — informational / 3xx / redirect */
  info: '#61AFEF',
  /** brand blue — primary CTAs (matches the bundled theme's accent) */
  accent: '#3474F0',
  /** purple — secondary / categorical accents */
  special: '#C678DD',
  /** orange — categorical (e.g. PUT method, mid strength) */
  orange: '#D19A66',
  /** cyan — categorical (e.g. diagnostic hints) */
  cyan: '#56B6C2'
} as const

/**
 * Webview CSS values: prefer the user's theme variable, fall back to our token.
 * Keeps panels theme-adaptive instead of hardcoded for dark themes.
 */
export const cssColor = {
  success: `var(--vscode-charts-green, ${color.success})`,
  warning: `var(--vscode-charts-yellow, ${color.warning})`,
  error: `var(--vscode-charts-red, ${color.error})`,
  info: `var(--vscode-charts-blue, ${color.info})`,
  orange: `var(--vscode-charts-orange, ${color.orange})`,
  special: `var(--vscode-charts-purple, ${color.special})`,
  // Git resource decorations — match the user's SCM colors when available.
  gitAdded: `var(--vscode-gitDecoration-addedResourceForeground, ${color.success})`,
  gitDeleted: `var(--vscode-gitDecoration-deletedResourceForeground, ${color.error})`,
  gitModified: `var(--vscode-gitDecoration-modifiedResourceForeground, ${color.warning})`,
  errorText: `var(--vscode-errorForeground, ${color.error})`
} as const

/** Build an rgba() string from a #rrggbb token and an alpha (0–1). For decoration backgrounds. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
