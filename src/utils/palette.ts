/**
 * Centralized semantic color palette for the whole extension.
 *
 * Single source of truth: change a token here and every panel, badge and
 * editor decoration updates. Values are the exact GitHub Primer (dark) functional
 * tokens (@primer/primitives), so the extension matches GitHub's palette.
 *
 * Two layers:
 *  - `color.*`    raw hex tokens — use in editor decorations
 *                 (TextEditorDecorationType) and anywhere a plain color is needed.
 *  - `cssColor.*` webview CSS values. Brand/semantic chips are fixed to the token
 *                 so panels show this palette consistently regardless of the active
 *                 theme; Git/error roles defer to the user's theme variable and fall
 *                 back to the token.
 */

/** Raw GitHub Primer (dark) tokens — single source of truth. */
export const color = {
  /** green — ok / up-to-date / success / added / patch / strong (success.emphasis) */
  success: '#238636',
  /** amber — update available / outdated / warning / modified / minor (attention.fg) */
  warning: '#d29922',
  /** red — error / 5xx / deleted / danger / major / vulnerability (danger.fg) */
  error: '#f85149',
  /** brand blue — primary CTAs and blue chips: redirect / OPTIONS / pending (accent.emphasis) */
  accent: '#1f6feb',
  /** lighter blue — informational accents on dark surfaces / decoration lines (accent.fg) */
  info: '#58a6ff',
  /** purple — secondary / categorical accents (done.fg) */
  special: '#a371f7',
  /** orange — categorical, e.g. PUT method, mid strength (severe.fg) */
  orange: '#db6d28',
  /** cyan — categorical, e.g. diagnostic hints. Primer has no functional cyan; closest scale hue. */
  cyan: '#39c5cf'
} as const

/**
 * Webview CSS values. Semantic chips use the fixed token (consistent brand);
 * Git resource and error roles honour the user's theme variable, token as fallback.
 */
export const cssColor = {
  success: color.success,
  warning: color.warning,
  error: color.error,
  accent: color.accent,
  info: color.info,
  orange: color.orange,
  special: color.special,
  // Neutral UI surfaces. Deterministic translucent grays so they stay visible on
  // any theme — unlike --vscode-panel-border, which some themes render near-invisible.
  /** Visible hairline for grids, separators and table cell borders. */
  border: 'rgba(140, 140, 140, 0.35)',
  /** Subtle tint to lift header bands off the editor background. */
  surface: 'rgba(140, 140, 140, 0.12)',
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
