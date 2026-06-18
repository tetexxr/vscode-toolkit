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
import { cssColor } from './palette'

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
