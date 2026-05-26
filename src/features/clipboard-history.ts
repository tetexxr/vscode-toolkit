import * as vscode from 'vscode'
import { ClipboardHistory, formatItem } from './clipboard-history-utils'

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

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.clipboardHistory.show', async () => {
      const items = history.getAll()
      if (items.length === 0) {
        vscode.window.showInformationMessage('Toolkit: clipboard history is empty.')
        return
      }
      const now = Date.now()
      type Item = vscode.QuickPickItem & { text: string }
      const picks: Item[] = items.map(item => {
        const f = formatItem(item, now)
        const pick: Item = { label: f.label, description: f.description, text: item.text }
        if (f.detail) {
          pick.detail = f.detail
        }
        return pick
      })
      const picked = await vscode.window.showQuickPick(picks, {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Pick a clipboard entry to paste at the cursor'
      })
      if (!picked) {
        return
      }
      watcher.prime(picked.text)
      await vscode.env.clipboard.writeText(picked.text)
      history.add(picked.text)
      await pasteText(picked.text)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.clipboardHistory.clear', async () => {
      if (history.size() === 0) {
        vscode.window.showInformationMessage('Toolkit: clipboard history is already empty.')
        return
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear clipboard history (${history.size()} item${history.size() === 1 ? '' : 's'})?`,
        { modal: true },
        'Clear'
      )
      if (choice === 'Clear') {
        history.clear()
      }
    })
  )
}
