import * as vscode from 'vscode'
import { ClipboardHistory, formatItem } from './clipboard-history-utils'

// Values to skip exactly once when the watcher next sees them, so secrets
// (e.g. a generated password) never land in the clipboard history.
const secretValues = new Set<string>()

/** Marks a clipboard value the history watcher should not capture (one-shot). */
export function markClipboardSecret(text: string): void {
  if (text.length > 0) {
    secretValues.add(text)
  }
}

class Watcher {
  private timer: NodeJS.Timeout | null = null
  private lastSeen: string | null = null
  private active = false

  constructor(
    private history: ClipboardHistory,
    private getInterval: () => number,
    private isEnabled: () => boolean
  ) {}

  async initialize(): Promise<void> {
    try {
      this.lastSeen = await vscode.env.clipboard.readText()
    } catch {
      this.lastSeen = null
    }
  }

  start(): void {
    if (this.active || !this.isEnabled()) {
      return
    }
    this.active = true
    const tick = async () => {
      if (!this.active) {
        return
      }
      try {
        const text = await vscode.env.clipboard.readText()
        if (secretValues.has(text)) {
          // A marked secret (e.g. a generated password): treat as seen but never store it.
          secretValues.delete(text)
          this.lastSeen = text
          return
        }
        if (text !== this.lastSeen) {
          this.lastSeen = text
          if (text.length > 0) {
            this.history.add(text)
          }
        }
      } catch {
        // ignore — sometimes the clipboard read can fail transiently
      }
    }
    this.timer = setInterval(() => {
      void tick()
    }, this.getInterval())
  }

  stop(): void {
    this.active = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Mark `text` as just-seen so the next poll doesn't re-add it. */
  prime(text: string): void {
    this.lastSeen = text
  }

  dispose(): void {
    this.stop()
  }
}

async function pasteText(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  await editor.edit(builder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        builder.insert(selection.active, text)
      } else {
        builder.replace(selection, text)
      }
    }
  })
}

export function registerClipboardHistoryCommands(context: vscode.ExtensionContext): void {
  const readConfig = () => {
    const config = vscode.workspace.getConfiguration('toolkit.clipboardHistory')
    return {
      enabled: config.get<boolean>('enabled', true),
      maxItems: Math.max(1, config.get<number>('maxItems', 50)),
      maxItemLength: Math.max(1, config.get<number>('maxItemLength', 10000)),
      pollInterval: Math.max(200, config.get<number>('pollInterval', 1000))
    }
  }

  const initial = readConfig()
  const history = new ClipboardHistory({ maxItems: initial.maxItems, maxItemLength: initial.maxItemLength })
  const watcher = new Watcher(
    history,
    () => readConfig().pollInterval,
    () => readConfig().enabled
  )

  void watcher.initialize().then(() => {
    if (vscode.window.state.focused && readConfig().enabled) {
      watcher.start()
    }
  })

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused && readConfig().enabled) {
        watcher.start()
      } else {
        watcher.stop()
      }
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('toolkit.clipboardHistory')) {
        return
      }
      const cfg = readConfig()
      history.setLimits({ maxItems: cfg.maxItems, maxItemLength: cfg.maxItemLength })
      watcher.stop()
      if (cfg.enabled && vscode.window.state.focused) {
        watcher.start()
      }
    })
  )

  context.subscriptions.push({ dispose: () => watcher.dispose() })

  type Item = vscode.QuickPickItem & { text?: string }

  const PIN_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('pin'), tooltip: 'Pin' }
  const UNPIN_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('pinned'), tooltip: 'Unpin' }

  function buildPicks(): Item[] {
    const now = Date.now()
    const all = history.getAll()
    const toItem = (item: (typeof all)[number]): Item => {
      const f = formatItem(item, now)
      const pick: Item = {
        label: f.label,
        description: f.description,
        text: item.text,
        buttons: [item.pinned ? UNPIN_BUTTON : PIN_BUTTON]
      }
      if (f.detail) {
        pick.detail = f.detail
      }
      return pick
    }
    const pinned = all.filter(i => i.pinned).map(toItem)
    const recent = all.filter(i => !i.pinned).map(toItem)
    if (pinned.length === 0) {
      return recent
    }
    return [
      { label: 'Pinned', kind: vscode.QuickPickItemKind.Separator },
      ...pinned,
      { label: 'Recent', kind: vscode.QuickPickItemKind.Separator },
      ...recent
    ]
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.clipboardHistory.show', () => {
      if (history.size() === 0) {
        vscode.window.showInformationMessage('Toolkit: clipboard history is empty.')
        return
      }
      const quickPick = vscode.window.createQuickPick<Item>()
      quickPick.items = buildPicks()
      quickPick.matchOnDescription = true
      quickPick.matchOnDetail = true
      quickPick.placeholder = 'Pick a clipboard entry to paste at the cursor — 📌 keeps it for the whole session'

      quickPick.onDidTriggerItemButton(event => {
        if (event.item.text !== undefined) {
          history.togglePin(event.item.text)
          quickPick.items = buildPicks()
        }
      })

      quickPick.onDidAccept(async () => {
        const picked = quickPick.selectedItems[0]
        quickPick.hide()
        if (!picked?.text) {
          return
        }
        watcher.prime(picked.text)
        await vscode.env.clipboard.writeText(picked.text)
        history.add(picked.text)
        await pasteText(picked.text)
      })

      quickPick.onDidHide(() => quickPick.dispose())
      quickPick.show()
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.clipboardHistory.clear', async () => {
      if (history.size() === 0) {
        vscode.window.showInformationMessage('Toolkit: clipboard history is already empty.')
        return
      }
      const pinnedCount = history.pinnedCount()
      const total = history.size()
      if (pinnedCount === 0) {
        const choice = await vscode.window.showWarningMessage(
          `Clear clipboard history (${total} item${total === 1 ? '' : 's'})?`,
          { modal: true },
          'Clear'
        )
        if (choice === 'Clear') {
          history.clear()
        }
        return
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear clipboard history? ${pinnedCount} of ${total} item${total === 1 ? '' : 's'} are pinned.`,
        { modal: true },
        'Clear unpinned',
        'Clear everything'
      )
      if (choice === 'Clear unpinned') {
        history.clear(true)
      } else if (choice === 'Clear everything') {
        history.clear()
      }
    })
  )
}
