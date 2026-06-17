import * as vscode from 'vscode'
import { FEATURE_CATALOG, type FeatureEntry } from './feature-catalog'

/**
 * "Toolkit: All Features" — a searchable, runnable index of every feature.
 * Picking an entry runs its command; entries without one (automatic or
 * context-bound features) open the FEATURES.md cheat sheet instead.
 */

async function showAllFeatures(context: vscode.ExtensionContext): Promise<void> {
  type Item = vscode.QuickPickItem & { entry?: FeatureEntry }
  const items: Item[] = []
  let lastCategory = ''
  for (const entry of FEATURE_CATALOG) {
    if (entry.category !== lastCategory) {
      lastCategory = entry.category
      items.push({ label: entry.category, kind: vscode.QuickPickItemKind.Separator })
    }
    items.push({
      label: entry.command ? entry.name : `${entry.name} $(book)`,
      description: entry.shortcut ?? '',
      detail: entry.description,
      entry
    })
  }

  const picked = await vscode.window.showQuickPick(items, {
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder: 'All Toolkit features — pick one to run it ($(book) = automatic/contextual, opens the docs)'
  })
  if (!picked?.entry) {
    return
  }
  if (picked.entry.command) {
    await vscode.commands.executeCommand(picked.entry.command)
    return
  }
  await vscode.commands.executeCommand(
    'markdown.showPreview',
    vscode.Uri.joinPath(context.extensionUri, 'FEATURES.md')
  )
}

export function registerFeatureLauncherCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.showAllFeatures', () => showAllFeatures(context))
  )
}
