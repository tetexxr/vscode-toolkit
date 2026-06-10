import * as vscode from 'vscode'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import {
  parseDotnetVulnerableJson,
  parseNpmAuditJson,
  parseYarnAuditNdjson,
  sortFindings,
  summarizeFindings,
  type VulnerabilityFinding
} from './dependency-audit-utils'
import { detectPackageManager } from './npm/npm-commands'
import { logError } from '../utils/logger'

/**
 * Dependency vulnerability audit — runs the ecosystem's official tool
 * (`npm|pnpm|yarn audit`, `dotnet list package --vulnerable`) and shows the
 * findings sorted by severity. Picking one opens its advisory page.
 */

const EXEC_TIMEOUT_MS = 120_000

interface CliResult {
  stdout: string
  stderr: string
  failed: boolean
}

function runCli(command: string, args: string[], cwd: string): Promise<CliResult> {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      { cwd, timeout: EXEC_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // Audit tools exit non-zero when vulnerabilities exist — stdout still
        // carries the JSON report, so "failed" only means "no usable output".
        resolve({ stdout: String(stdout), stderr: String(stderr), failed: !!error && String(stdout).trim() === '' })
      }
    )
  })
}

const SEVERITY_ICONS: Record<string, string> = {
  critical: '$(error)',
  high: '$(warning)',
  moderate: '$(alert)',
  low: '$(info)',
  info: '$(info)',
  unknown: '$(question)'
}

async function showFindings(findings: VulnerabilityFinding[], scopeLabel: string): Promise<void> {
  if (findings.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: no known vulnerabilities in ${scopeLabel}.`)
    return
  }
  const sorted = sortFindings(findings)
  type Item = vscode.QuickPickItem & { url: string | null }
  const items: Item[] = sorted.map(f => ({
    label: `${SEVERITY_ICONS[f.severity]} ${f.severity} — ${f.package}`,
    description: [f.range, f.transitive ? 'transitive' : '', f.fixAvailable ? 'fix available' : '']
      .filter(Boolean)
      .join(' · '),
    detail: f.title,
    url: f.url
  }))
  const picked = await vscode.window.showQuickPick(items, {
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder: `${summarizeFindings(findings)} in ${scopeLabel} — pick one to open its advisory`
  })
  if (picked?.url) {
    const target = vscode.Uri.parse(picked.url)
    if (target.scheme === 'http' || target.scheme === 'https') {
      await vscode.env.openExternal(target)
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  npm / pnpm / yarn                                                         */
/* -------------------------------------------------------------------------- */

async function pickProjectFile(pattern: string, placeHolder: string, uri?: vscode.Uri): Promise<vscode.Uri | null> {
  if (uri) {
    return uri
  }
  const candidates = await vscode.workspace.findFiles(pattern, '**/node_modules/**')
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: no projects matching ${pattern} found in the workspace.`)
    return null
  }
  if (candidates.length === 1) {
    return candidates[0]
  }
  const items = candidates.map(c => ({ label: vscode.workspace.asRelativePath(c), uri: c }))
  items.sort((a, b) => a.label.localeCompare(b.label))
  const picked = await vscode.window.showQuickPick(items, { placeHolder })
  return picked?.uri ?? null
}

async function npmAudit(uri?: vscode.Uri): Promise<void> {
  const projectUri = await pickProjectFile('**/package.json', 'Audit which project?', uri)
  if (!projectUri) {
    return
  }
  const cwd = path.dirname(projectUri.fsPath)
  const pm = detectPackageManager(cwd)
  const scopeLabel = vscode.workspace.asRelativePath(projectUri)

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Running ${pm} audit...` },
    async () => {
      const result = await runCli(pm, ['audit', '--json'], cwd)
      if (result.failed) {
        vscode.window.showWarningMessage(`Toolkit: ${pm} audit failed — ${firstLine(result.stderr) || 'no output'}.`)
        return
      }
      try {
        const findings = pm === 'yarn' ? parseYarnAuditNdjson(result.stdout) : parseNpmAuditJson(result.stdout)
        await showFindings(findings, scopeLabel)
      } catch (err) {
        logError('dependency-audit:npm', err)
        vscode.window.showWarningMessage(`Toolkit: could not parse ${pm} audit output.`)
      }
    }
  )
}

/* -------------------------------------------------------------------------- */
/*  NuGet                                                                     */
/* -------------------------------------------------------------------------- */

async function nugetVulnerabilities(uri?: vscode.Uri): Promise<void> {
  const projectUri = await pickProjectFile('**/*.{csproj,fsproj,vbproj}', 'Check which project?', uri)
  if (!projectUri) {
    return
  }
  const scopeLabel = vscode.workspace.asRelativePath(projectUri)

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking NuGet vulnerabilities...' },
    async () => {
      const result = await runCli(
        'dotnet',
        ['list', projectUri.fsPath, 'package', '--vulnerable', '--include-transitive', '--format', 'json'],
        path.dirname(projectUri.fsPath)
      )
      if (result.failed) {
        const hint = /restore/i.test(result.stderr) ? ' (try running dotnet restore first)' : ''
        vscode.window.showWarningMessage(
          `Toolkit: dotnet list package failed — ${firstLine(result.stderr) || 'no output'}${hint}.`
        )
        return
      }
      try {
        const findings = parseDotnetVulnerableJson(result.stdout)
        await showFindings(findings, scopeLabel)
      } catch (err) {
        logError('dependency-audit:nuget', err)
        vscode.window.showWarningMessage('Toolkit: could not parse dotnet output.')
      }
    }
  )
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? ''
}

export function registerDependencyAuditCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('toolkit.npm.audit', (uri?: vscode.Uri) => npmAudit(uri)),
    vscode.commands.registerCommand('toolkit.nuget.vulnerabilities', (uri?: vscode.Uri) => nugetVulnerabilities(uri))
  )
}
