import * as vscode from 'vscode'
import {
  shouldShowStatusBar,
  statusBarText,
  statusBarTooltip,
  toggleMessage,
  wrapEnhancedHtml
} from './markdown-preview-style-utils'

/**
 * Enhanced Markdown preview styling.
 *
 * The extension ships GitHub's official stylesheet (media/markdown-enhanced.css)
 * contributed through `contributes["markdown.previewStyles"]`, so the built-in
 * preview always loads it. Every rule is scoped under `.toolkit-md-enhanced`;
 * we only add that wrapper (via extendMarkdownIt) when
 * `toolkit.markdownPreview.enhanced` is on. When it is off there is no wrapper,
 * nothing matches, and the preview falls back to the stock VS Code look — so
 * the day the built-in styling improves you can just switch back to it.
 */

const SETTING_SECTION = 'toolkit.markdownPreview'
const ENHANCED_KEY = 'enhanced'
const TOGGLE_COMMAND = 'toolkit.markdown.toggleEnhancedPreview'

function isEnhanced(): boolean {
  return vscode.workspace.getConfiguration(SETTING_SECTION).get<boolean>(ENHANCED_KEY, true)
}

/** Minimal shape of the markdown-it instance the preview hands us. */
interface MarkdownItLike {
  renderer: {
    render: (tokens: unknown, options: unknown, env: unknown) => string
  }
}

/**
 * Called by VS Code's built-in Markdown preview via the
 * `markdown.markdownItPlugins` contribution. The render override reads the
 * setting live on every render, so `markdown.api.reloadPlugins` after a toggle
 * is enough to flip the look without a window reload.
 */
export function extendMarkdownIt(md: MarkdownItLike): MarkdownItLike {
  const originalRender = md.renderer.render.bind(md.renderer)
  md.renderer.render = (tokens, options, env) => wrapEnhancedHtml(originalRender(tokens, options, env), isEnhanced())
  return md
}

let statusBar: vscode.StatusBarItem | undefined

function updateStatusBar(): void {
  if (!statusBar) {
    return
  }
  const visibleLanguageIds = vscode.window.visibleTextEditors.map(editor => editor.document.languageId)
  if (!shouldShowStatusBar(visibleLanguageIds)) {
    statusBar.hide()
    return
  }
  const on = isEnhanced()
  statusBar.text = statusBarText(on)
  statusBar.tooltip = statusBarTooltip(on)
  statusBar.show()
}

/** Re-render every open preview so a toggle is visible without a window reload. */
async function reloadPreviews(): Promise<void> {
  try {
    await vscode.commands.executeCommand('markdown.api.reloadPlugins')
  } catch {
    // Older VS Code without the reload API: fall back to a plain refresh.
    await vscode.commands.executeCommand('markdown.preview.refresh')
  }
}

async function toggleEnhanced(): Promise<void> {
  const next = !isEnhanced()
  await vscode.workspace.getConfiguration(SETTING_SECTION).update(ENHANCED_KEY, next, vscode.ConfigurationTarget.Global)
  // The configuration listener re-renders previews and refreshes the status bar.
  vscode.window.showInformationMessage(toggleMessage(next))
}

export function registerMarkdownPreviewStyle(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)
  statusBar.command = TOGGLE_COMMAND

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand(TOGGLE_COMMAND, () => toggleEnhanced()),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.window.onDidChangeVisibleTextEditors(() => updateStatusBar()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${SETTING_SECTION}.${ENHANCED_KEY}`)) {
        updateStatusBar()
        void reloadPreviews()
      }
    })
  )
  updateStatusBar()
}
