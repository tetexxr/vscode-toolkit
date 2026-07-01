import * as vscode from 'vscode'
import { analyzeDocx, fixDocx, type BookmarkIssue, type DocxAnalysis } from './docx-bookmarks-utils'

/**
 * Word bookmark checker for .docx templates.
 *
 * .docx files are binary (a ZIP), so this feature is command-driven rather than
 * diagnostics-driven: it reads the bytes, inspects the bookmark XML, reports
 * defects (chiefly a placeholder split across runs, which breaks the "replace
 * the first run" export logic), and can consolidate the fixable ones in place.
 *
 *  - Check Word Bookmarks (palette): scans every .docx in the workspace.
 *  - Check / Fix Bookmarks (explorer context on a .docx): one or more files.
 */

const EXCLUDE = '**/{node_modules,bin,obj,.git,.vs}/**'

function isDocx(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith('.docx')
}

/** Resolve the .docx files a command should act on: explorer selection, then active tab. */
function resolveTargets(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  const selected = (uris && uris.length > 0 ? uris : uri ? [uri] : []).filter(isDocx)
  if (selected.length > 0) {
    return selected
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input && typeof input === 'object' && 'uri' in input) {
    const active = (input as { uri: vscode.Uri }).uri
    if (isDocx(active)) {
      return [active]
    }
  }
  return []
}

async function readDocx(uri: vscode.Uri): Promise<Uint8Array | null> {
  try {
    return await vscode.workspace.fs.readFile(uri)
  } catch {
    return null
  }
}

interface FileReport {
  uri: vscode.Uri
  analysis: DocxAnalysis | null
  fixable: number
}

async function analyzeFiles(uris: vscode.Uri[]): Promise<FileReport[]> {
  const reports: FileReport[] = []
  for (const uri of uris) {
    const bytes = await readDocx(uri)
    if (bytes === null) {
      reports.push({ uri, analysis: null, fixable: 0 })
      continue
    }
    try {
      const analysis = analyzeDocx(bytes)
      reports.push({ uri, analysis, fixable: analysis.issues.filter(i => i.fixable).length })
    } catch {
      reports.push({ uri, analysis: null, fixable: 0 })
    }
  }
  return reports
}

function issueLine(issue: BookmarkIssue): string {
  const tag = issue.fixable ? ' [fixable]' : ''
  return `    • ${issue.kind}  ${issue.name} (${issue.part}) — ${issue.detail}${tag}`
}

function writeReport(output: vscode.OutputChannel, reports: FileReport[]): void {
  output.clear()
  output.appendLine(`Word bookmark check — ${reports.length} file(s) scanned`)
  output.appendLine('')
  for (const report of reports) {
    const name = vscode.workspace.asRelativePath(report.uri)
    if (report.analysis === null) {
      output.appendLine(`⚠ ${name} — could not read or parse the document`)
      continue
    }
    if (report.analysis.issues.length === 0) {
      output.appendLine(`✔ ${name} — no issues (${report.analysis.bookmarks.length} bookmark(s))`)
      continue
    }
    output.appendLine(`✖ ${name}`)
    for (const issue of report.analysis.issues) {
      output.appendLine(issueLine(issue))
    }
  }
  output.appendLine('')
}

function summarize(reports: FileReport[]): { withIssues: number; fixableFiles: FileReport[]; fixableCount: number } {
  const withIssues = reports.filter(r => r.analysis && r.analysis.issues.length > 0).length
  const fixableFiles = reports.filter(r => r.fixable > 0)
  const fixableCount = fixableFiles.reduce((sum, r) => sum + r.fixable, 0)
  return { withIssues, fixableFiles, fixableCount }
}

/** Consolidate split bookmarks in the given files, writing each back in place. */
async function fixFiles(uris: vscode.Uri[], output: vscode.OutputChannel): Promise<number> {
  let fixedTotal = 0
  for (const uri of uris) {
    const bytes = await readDocx(uri)
    if (bytes === null) {
      continue
    }
    try {
      const result = fixDocx(bytes)
      if (result.fixed.length === 0) {
        continue
      }
      await vscode.workspace.fs.writeFile(uri, result.buffer)
      fixedTotal += result.fixed.length
      const name = vscode.workspace.asRelativePath(uri)
      for (const fixed of result.fixed) {
        output.appendLine(`  fixed  ${fixed.name} (${fixed.part}) in ${name}`)
      }
    } catch (error) {
      output.appendLine(`⚠ ${vscode.workspace.asRelativePath(uri)} — fix failed: ${String(error)}`)
    }
  }
  return fixedTotal
}

async function offerFix(reports: FileReport[], output: vscode.OutputChannel): Promise<void> {
  const { fixableFiles, fixableCount } = summarize(reports)
  if (fixableCount === 0) {
    return
  }
  const filePlural = fixableFiles.length === 1 ? 'file' : 'files'
  const bookmarkPlural = fixableCount === 1 ? 'bookmark' : 'bookmarks'
  const choice = await vscode.window.showWarningMessage(
    `Consolidate ${fixableCount} split ${bookmarkPlural} in ${fixableFiles.length} ${filePlural}? This rewrites the .docx in place.`,
    { modal: true, detail: 'Each affected bookmark is merged into a single run, keeping its formatting.' },
    'Fix'
  )
  if (choice !== 'Fix') {
    return
  }
  output.appendLine('')
  const fixed = await fixFiles(fixableFiles.map(r => r.uri), output)
  output.show(true)
  vscode.window.showInformationMessage(`Toolkit: consolidated ${fixed} bookmark(s) across ${fixableFiles.length} ${filePlural}.`)
}

async function checkWorkspace(output: vscode.OutputChannel): Promise<void> {
  const uris = await vscode.workspace.findFiles('**/*.docx', EXCLUDE)
  if (uris.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no .docx files found in the workspace.')
    return
  }
  const reports = await analyzeFiles(uris)
  writeReport(output, reports)
  output.show(true)

  const { withIssues, fixableCount } = summarize(reports)
  if (withIssues === 0) {
    vscode.window.showInformationMessage(`Toolkit: all ${reports.length} .docx file(s) look good.`)
    return
  }
  vscode.window.showWarningMessage(
    `Toolkit: ${withIssues} of ${reports.length} .docx file(s) have bookmark issues (${fixableCount} fixable). See the report.`
  )
  await offerFix(reports, output)
}

async function checkFiles(uris: vscode.Uri[], output: vscode.OutputChannel): Promise<void> {
  if (uris.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a .docx file in the Explorer to check its bookmarks.')
    return
  }
  const reports = await analyzeFiles(uris)
  writeReport(output, reports)
  output.show(true)

  const { withIssues, fixableCount } = summarize(reports)
  if (withIssues === 0) {
    vscode.window.showInformationMessage(`Toolkit: no bookmark issues in ${uris.length} file(s).`)
    return
  }
  vscode.window.showWarningMessage(`Toolkit: found bookmark issues (${fixableCount} fixable). See the report.`)
  await offerFix(reports, output)
}

async function fixCommand(uris: vscode.Uri[], output: vscode.OutputChannel): Promise<void> {
  if (uris.length === 0) {
    vscode.window.showInformationMessage('Toolkit: select a .docx file in the Explorer to fix its bookmarks.')
    return
  }
  const reports = await analyzeFiles(uris)
  writeReport(output, reports)
  const { fixableCount } = summarize(reports)
  if (fixableCount === 0) {
    vscode.window.showInformationMessage('Toolkit: no fixable (split-run) bookmarks in the selected file(s).')
    return
  }
  await offerFix(reports, output)
}

export function registerDocxBookmarkCommands(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Toolkit: Word Bookmarks')

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('toolkit.docx.checkWorkspace', () => checkWorkspace(output)),
    vscode.commands.registerCommand('toolkit.docx.checkFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      checkFiles(resolveTargets(uri, uris), output)
    ),
    vscode.commands.registerCommand('toolkit.docx.fixFile', (uri?: vscode.Uri, uris?: vscode.Uri[]) =>
      fixCommand(resolveTargets(uri, uris), output)
    )
  )
}
