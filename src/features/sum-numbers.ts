import * as vscode from 'vscode'
import { extractLeadingNumbers, formatSum, sumNumbers } from './sum-numbers-utils'

export function registerSumNumbersCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.sumNumbers', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }

      const text = editor.selections
        .filter(s => !s.isEmpty)
        .map(s => editor.document.getText(s))
        .join('\n')

      if (!text) {
        vscode.window.showInformationMessage('Toolkit: select some text containing numbers first.')
        return
      }

      const numbers = extractLeadingNumbers(text)
      if (numbers.length === 0) {
        vscode.window.showInformationMessage('Toolkit: no numbers found in selection.')
        return
      }

      const formatted = formatSum(sumNumbers(numbers))
      const label = numbers.length === 1 ? '1 number' : `${numbers.length} numbers`
      const message = `Toolkit: sum of ${label} = ${formatted}`

      const action = await vscode.window.showInformationMessage(message, 'Copy')
      if (action === 'Copy') {
        await vscode.env.clipboard.writeText(formatted)
      }
    })
  )
}
