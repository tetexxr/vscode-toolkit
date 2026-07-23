/**
 * Pure helpers for the enhanced Markdown preview feature, kept free of the
 * `vscode` API so they can be unit-tested. The feature module wires these to
 * the editor: configuration, status bar and the markdown-it render hook.
 */

export const MARKDOWN_LANGUAGE_ID = 'markdown'

/** Class on the wrapper the render hook injects; the contributed CSS is scoped to it. */
export const ENHANCED_WRAPPER_CLASS = 'toolkit-md-enhanced'

/**
 * Wraps rendered preview HTML in the gate element when enhanced styling is on.
 * With it off the HTML is returned untouched, so the preview keeps its stock
 * VS Code look (nothing in our stylesheet matches without the wrapper).
 */
export function wrapEnhancedHtml(html: string, enabled: boolean): string {
  return enabled ? `<div class="${ENHANCED_WRAPPER_CLASS}">\n${html}\n</div>` : html
}

/**
 * Whether the status bar item should be shown. Visible when any editor on
 * screen holds a Markdown document — so it stays put when the preview is
 * focused beside the source, not just when the `.md` editor itself is active.
 */
export function shouldShowStatusBar(visibleLanguageIds: readonly string[]): boolean {
  return visibleLanguageIds.includes(MARKDOWN_LANGUAGE_ID)
}

export function statusBarText(enabled: boolean): string {
  return enabled ? '$(markdown) MD: Enhanced' : '$(markdown) MD: Default'
}

export function statusBarTooltip(enabled: boolean): string {
  return enabled
    ? 'Markdown preview: enhanced styling is ON — click to use the default VS Code style'
    : 'Markdown preview: using the default VS Code style — click to enable enhanced styling'
}

export function toggleMessage(enabled: boolean): string {
  return `Markdown preview: ${enabled ? 'enhanced styling' : 'default VS Code style'}`
}
