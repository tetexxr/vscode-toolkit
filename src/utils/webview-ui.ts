/**
 * Shared webview UI primitives — single source of truth for button styling.
 *
 * Inject `BUTTON_CSS` into a webview's <style> (e.g. `<style>${BUTTON_CSS}...`) so
 * every panel renders buttons identically and as close to native VS Code as possible.
 *
 * Conventions (match the VS Code workbench):
 *   - text buttons: 2px radius, theme button tokens
 *   - .btn-secondary / button.secondary → secondary button tokens
 *   - .btn-danger   / button.danger    → error background
 *   - .btn-icon     / button.icon      → 26px square, transparent, 5px hover rect
 *
 * Both the `.btn` class and the bare `button` element are styled, so existing markup
 * keeps working; more specific component rules (e.g. `.flag`, `.toolbar button`)
 * still win via specificity.
 */
import { color, cssColor, withAlpha } from './palette'

export const BUTTON_CSS = /*css*/ `
  .btn, button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-family: inherit;
    font-size: var(--vscode-font-size, 13px);
    line-height: 1.4;
    padding: 4px 11px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    white-space: nowrap;
  }
  .btn:hover, button:hover { background: var(--vscode-button-hoverBackground); }
  .btn:focus-visible, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .btn:disabled, button:disabled { opacity: 0.5; cursor: default; }

  .btn-secondary, button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover, button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

  .btn-danger, button.danger { background: ${cssColor.error}; color: #fff; }
  .btn-danger:hover, button.danger:hover { opacity: 0.85; background: ${cssColor.error}; }

  .btn-icon, button.icon {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--vscode-foreground);
    font-size: 16px;
  }
  .btn-icon:hover, button.icon:hover { background: var(--vscode-toolbar-hoverBackground); }
`

/**
 * Shared rounded status-badge styling — the single source of truth for pill
 * badges across panels. Inject `BADGE_CSS` into a webview's <style>, then mark
 * up a badge as `<span class="badge badge-success">…</span>`.
 *
 * The look matches the npm overview's dependency-type chips: a soft translucent
 * tint of the semantic color, colored text and a subtle colored border — finer
 * than a solid fill. Each variant only sets the `--badge-*` custom properties,
 * so the base `.badge` rule owns shape and sizing.
 *
 *   .badge-success  green   — ok / yes / 2xx / up-to-date
 *   .badge-error    red     — broken / failed / 5xx
 *   .badge-warning  amber   — caution / no / 4xx / outdated
 *   .badge-accent   blue    — informational / redirect / pending
 *   .badge-neutral  theme   — unknown / n/a (native VS Code badge tokens)
 */
export const BADGE_CSS = /*css*/ `
  .badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    color: var(--badge-fg, var(--vscode-badge-foreground));
    background: var(--badge-bg, var(--vscode-badge-background));
    border: 1px solid var(--badge-bd, transparent);
  }
  .badge-success { --badge-fg: ${color.success}; --badge-bg: ${withAlpha(color.success, 0.18)}; --badge-bd: ${withAlpha(color.success, 0.55)}; }
  .badge-error   { --badge-fg: ${color.error};   --badge-bg: ${withAlpha(color.error, 0.18)};   --badge-bd: ${withAlpha(color.error, 0.55)}; }
  .badge-warning { --badge-fg: ${color.warning}; --badge-bg: ${withAlpha(color.warning, 0.18)}; --badge-bd: ${withAlpha(color.warning, 0.55)}; }
  .badge-accent  { --badge-fg: ${color.info};    --badge-bg: ${withAlpha(color.accent, 0.18)};  --badge-bd: ${withAlpha(color.accent, 0.55)}; }
  .badge-neutral { --badge-fg: var(--vscode-badge-foreground); --badge-bg: var(--vscode-badge-background); --badge-bd: transparent; }
`
