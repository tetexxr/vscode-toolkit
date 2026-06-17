import * as vscode from 'vscode'
import { describeCron, nextRuns, parseCron } from './cron-utils'

// Loosely matches a run of 5–6 space-separated cron-ish tokens; parseCron does
// the strict validation, so non-cron runs of words simply yield no hover.
const CRON_TOKEN = /[\d*?/,A-Za-z#L-]+(?:\s+[\d*?/,A-Za-z#L-]+){4,5}/

class CronHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const config = vscode.workspace.getConfiguration('toolkit.cron')
    if (!config.get<boolean>('enableHover', true)) {
      return undefined
    }
    const range = document.getWordRangeAtPosition(position, CRON_TOKEN)
    if (!range) {
      return undefined
    }
    const text = document.getText(range)
    const cron = parseCron(text)
    if (!cron) {
      return undefined
    }

    const count = Math.max(1, config.get<number>('nextRunsCount', 5))
    const runs = nextRuns(cron, new Date(), count)
    const lines = ['**Cron**', '', describeCron(cron)]
    if (runs.length > 0) {
      lines.push('', '**Next runs:**')
      for (const run of runs) {
        lines.push(`- ${run.toLocaleString()}`)
      }
    }
    const md = new vscode.MarkdownString(lines.join('\n'))
    md.isTrusted = false
    return new vscode.Hover(md, range)
  }
}

export function registerCronCommands(context: vscode.ExtensionContext): void {
  const languages = vscode.workspace.getConfiguration('toolkit.cron').get<string[]>('hoverLanguages', ['*'])
  const provider = new CronHoverProvider()
  for (const language of languages) {
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language }, provider))
  }
}
