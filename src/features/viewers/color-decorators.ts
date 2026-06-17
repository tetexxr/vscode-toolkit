import * as vscode from 'vscode'
import { findColors, toHex, toHslString, toRgbString, type Rgba } from './color-utils'

// VS Code already provides color decorators for these, so we stay out of their
// way to avoid duplicate swatches.
const BUILTIN_COLOR_LANGUAGES = new Set(['css', 'scss', 'less', 'sass'])

// Guard against scanning pathologically large files on every edit.
const MAX_LENGTH = 2_000_000

function enabled(): boolean {
  return vscode.workspace.getConfiguration('toolkit.colorDecorators').get<boolean>('enabled', true)
}

function toVscodeColor({ r, g, b, a }: Rgba): vscode.Color {
  return new vscode.Color(r / 255, g / 255, b / 255, a)
}

function fromVscodeColor(color: vscode.Color): Rgba {
  return { r: color.red * 255, g: color.green * 255, b: color.blue * 255, a: color.alpha }
}

class ToolkitColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    if (!enabled() || BUILTIN_COLOR_LANGUAGES.has(document.languageId)) {
      return []
    }
    const text = document.getText()
    if (text.length > MAX_LENGTH) {
      return []
    }
    return findColors(text).map(found => {
      const range = new vscode.Range(document.positionAt(found.start), document.positionAt(found.end))
      return new vscode.ColorInformation(range, toVscodeColor(found.color))
    })
  }

  provideColorPresentations(color: vscode.Color): vscode.ColorPresentation[] {
    const rgba = fromVscodeColor(color)
    return [
      new vscode.ColorPresentation(toHex(rgba)),
      new vscode.ColorPresentation(toRgbString(rgba)),
      new vscode.ColorPresentation(toHslString(rgba))
    ]
  }
}

export function registerColorDecorators(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.languages.registerColorProvider('*', new ToolkitColorProvider()))
}
