import * as vscode from 'vscode'
import { getRepoRoot, getFileBlame, BlameInfo } from '../utils/git'
import * as path from 'path'

/** Palette of subtle background colors to distinguish consecutive commit groups. */
const GROUP_COLORS = [
  'rgba(255, 255, 255, 0.04)',
  'rgba(255, 255, 255, 0.08)'
]

/** How many characters the annotation column occupies (date + author). */
const ANNOTATION_WIDTH = 30

let enabled = false
let blameDecorationTypes: vscode.TextEditorDecorationType[] = []
let activeBlame: Map<string, BlameInfo[]> = new Map()

export function registerGitBlameCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.toggleGitBlame', () => toggleBlame()),
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (enabled) {
        applyBlame(vscode.window.activeTextEditor)
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (enabled) {
        const editor = vscode.window.activeTextEditor
        if (editor && editor.document === doc) {
          activeBlame.delete(doc.uri.toString())
          applyBlame(editor)
        }
      }
    })
  )
}

async function toggleBlame(): Promise<void> {
  enabled = !enabled
  if (enabled) {
    await applyBlame(vscode.window.activeTextEditor)
  } else {
    clearDecorations()
    activeBlame.clear()
  }
}

function clearDecorations(): void {
  for (const dt of blameDecorationTypes) {
    dt.dispose()
  }
  blameDecorationTypes = []
}

async function applyBlame(editor: vscode.TextEditor | undefined): Promise<void> {
  if (!editor || editor.document.uri.scheme !== 'file') {
    return
  }

  clearDecorations()

  const filePath = editor.document.uri.fsPath
  const cacheKey = editor.document.uri.toString()

  try {
    let blameData = activeBlame.get(cacheKey)
    if (!blameData) {
      const repoRoot = await getRepoRoot(path.dirname(filePath))
      const relativePath = path.relative(repoRoot, filePath)
      blameData = await getFileBlame(repoRoot, relativePath)
      activeBlame.set(cacheKey, blameData)
    }

    if (blameData.length === 0) {
      return
    }

    renderAnnotations(editor, blameData)
  } catch {
    // File is not tracked by git or other error — silently ignore
  }
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function renderAnnotations(editor: vscode.TextEditor, blameData: BlameInfo[]): void {
  // Group consecutive lines by commit hash to assign alternating colors
  const groups: { hash: string; lines: number[] }[] = []
  for (let i = 0; i < blameData.length; i++) {
    const info = blameData[i]
    const last = groups[groups.length - 1]
    if (last && last.hash === info.hash) {
      last.lines.push(i)
    } else {
      groups.push({ hash: info.hash, lines: [i] })
    }
  }

  // Build decoration options per color group
  const decorationsByColor: Map<number, vscode.DecorationOptions[]> = new Map()

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    const colorIndex = gi % GROUP_COLORS.length

    if (!decorationsByColor.has(colorIndex)) {
      decorationsByColor.set(colorIndex, [])
    }
    const opts = decorationsByColor.get(colorIndex)!

    for (let li = 0; li < group.lines.length; li++) {
      const lineIndex = group.lines[li]
      const info = blameData[lineIndex]
      const isFirstInGroup = li === 0

      let text: string
      if (isFirstInGroup) {
        const date = formatDate(info.authorTime)
        const maxAuthor = ANNOTATION_WIDTH - date.length - 2
        const author = info.author.length > maxAuthor
          ? info.author.substring(0, maxAuthor - 1) + '…'
          : info.author
        text = `${date}  ${author}`
      } else {
        text = ''
      }

      // Pad to fixed width
      text = text.padEnd(ANNOTATION_WIDTH)

      const range = new vscode.Range(lineIndex, 0, lineIndex, 0)
      opts.push({
        range,
        renderOptions: {
          before: {
            contentText: text,
            color: 'rgba(153, 153, 153, 0.6)',
            fontStyle: 'normal',
            textDecoration: `none; font-size: 12px; font-family: monospace; margin-right: 16px;`
          }
        },
        hoverMessage: buildHover(info)
      })
    }
  }

  // Create one decoration type per color group and apply
  for (const [colorIndex, options] of decorationsByColor) {
    const dt = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: GROUP_COLORS[colorIndex],
      before: {
        width: `${ANNOTATION_WIDTH}ch`,
      }
    })
    blameDecorationTypes.push(dt)
    editor.setDecorations(dt, options)
  }
}

function buildHover(info: BlameInfo): vscode.MarkdownString {
  const date = new Date(info.authorTime * 1000)
  const md = new vscode.MarkdownString()
  md.isTrusted = true
  md.appendMarkdown(`**${info.summary}**\n\n`)
  md.appendMarkdown(`$(git-commit) \`${info.hash.substring(0, 8)}\`\n\n`)
  md.appendMarkdown(`$(person) ${info.author}  \n`)
  md.appendMarkdown(`$(calendar) ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`)
  return md
}
