import * as vscode from 'vscode'
import * as path from 'node:path'
import {
  diffResx,
  isDesignerResx,
  parseResx,
  parseResxName,
  planInsertions,
  reorderToNeutral,
  stringEntries,
  type ResxName
} from './resx-check-utils'

/**
 * .resx localization checker — keeps a neutral resx (`Foo.resx`) and its
 * per-locale satellites (`Foo.en.resx`, `Foo.ca.resx`, ...) in sync:
 *  - editing a locale file: flags keys missing vs the neutral, keys not in the
 *    neutral, duplicates, a different key order, and placeholder ({0}/{1})
 *    drift — with quick fixes to add the missing keys (empty) and to reorder.
 *  - editing the neutral file: hints which keys are not yet present in every
 *    language, with a quick fix to add them everywhere at once.
 * WinForms designer resx (typed/binary entries, <metadata>) are skipped: their
 * satellites are intentionally partial.
 */

const MISSING_CODE = 'resx-missing-keys'
const ORDER_CODE = 'resx-order'
const NEUTRAL_MISSING_CODE = 'resx-neutral-missing'
const SOURCE = 'toolkit-resx'

interface ResxConfig {
  enabled: boolean
  severity: vscode.DiagnosticSeverity
}

function readConfig(): ResxConfig {
  const config = vscode.workspace.getConfiguration('toolkit.resx')
  const severityName = config.get<string>('severity', 'warning')
  const severity =
    severityName === 'error'
      ? vscode.DiagnosticSeverity.Error
      : severityName === 'information'
        ? vscode.DiagnosticSeverity.Information
        : severityName === 'hint'
          ? vscode.DiagnosticSeverity.Hint
          : vscode.DiagnosticSeverity.Warning
  return { enabled: config.get<boolean>('enabled', true), severity }
}

async function readFileText(uri: vscode.Uri): Promise<string | null> {
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
  if (open) {
    return open.getText()
  }
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
  } catch {
    return null
  }
}

interface GroupMember {
  uri: vscode.Uri
  locale: string | null
}

interface ResxGroup {
  base: string
  dir: vscode.Uri
  neutral: GroupMember | null
  locales: GroupMember[]
}

/** Resolve the localization group a resx file belongs to, by listing its folder. */
async function resolveGroup(uri: vscode.Uri, parsed: ResxName): Promise<ResxGroup | null> {
  const dir = vscode.Uri.joinPath(uri, '..')
  let entries: [string, vscode.FileType][]
  try {
    entries = await vscode.workspace.fs.readDirectory(dir)
  } catch {
    return null
  }
  let neutral: GroupMember | null = null
  const locales: GroupMember[] = []
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue
    }
    const member = parseResxName(name)
    if (!member || member.base !== parsed.base) {
      continue
    }
    const memberUri = vscode.Uri.joinPath(dir, name)
    if (member.locale === null) {
      neutral = { uri: memberUri, locale: null }
    } else {
      locales.push({ uri: memberUri, locale: member.locale })
    }
  }
  locales.sort((a, b) => (a.locale ?? '').localeCompare(b.locale ?? ''))
  return { base: parsed.base, dir, neutral, locales }
}

function firstLineRange(document: vscode.TextDocument): vscode.Range {
  const end = document.lineCount > 0 ? document.lineAt(0).range.end : new vscode.Position(0, 0)
  return new vscode.Range(new vscode.Position(0, 0), end)
}

function lineRange(document: vscode.TextDocument, line: number): vscode.Range {
  const safe = Math.min(line, Math.max(0, document.lineCount - 1))
  return document.lineAt(safe).range
}

/* -------------------------------------------------------------------------- */
/*  Diagnostics                                                               */
/* -------------------------------------------------------------------------- */

async function analyzeDocument(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): Promise<void> {
  if (document.uri.scheme !== 'file') {
    return
  }
  const fileName = path.basename(document.uri.fsPath)
  const parsed = parseResxName(fileName)
  if (!parsed) {
    return
  }
  const config = readConfig()
  if (!config.enabled) {
    diagnostics.delete(document.uri)
    return
  }

  const group = await resolveGroup(document.uri, parsed)
  if (!group || !group.neutral) {
    diagnostics.delete(document.uri)
    return
  }
  const neutralText = await readFileText(group.neutral.uri)
  if (neutralText === null || isDesignerResx(neutralText)) {
    diagnostics.delete(document.uri)
    return
  }

  if (parsed.locale === null) {
    await analyzeNeutral(document, group, neutralText, diagnostics)
  } else {
    analyzeLocale(document, group, neutralText, config, diagnostics)
  }
}

/** Diagnostics for a locale file, compared against its neutral source. */
function analyzeLocale(
  document: vscode.TextDocument,
  group: ResxGroup,
  neutralText: string,
  config: ResxConfig,
  diagnostics: vscode.DiagnosticCollection
): void {
  const diff = diffResx(neutralText, document.getText())
  const entries = parseResx(document.getText())
  const startOf = new Map(entries.map(e => [e.name, e.startLine]))
  const neutralName = path.basename(group.neutral!.uri.fsPath)
  const result: vscode.Diagnostic[] = []

  if (diff.missing.length > 0) {
    const plural = diff.missing.length === 1 ? 'key' : 'keys'
    const d = new vscode.Diagnostic(
      firstLineRange(document),
      `Missing ${diff.missing.length} ${plural} from ${neutralName}: ${diff.missing.join(', ')}`,
      config.severity
    )
    d.source = SOURCE
    d.code = MISSING_CODE
    result.push(d)
  }

  if (diff.orderDiffers) {
    const d = new vscode.Diagnostic(
      firstLineRange(document),
      `Key order differs from ${neutralName}.`,
      config.severity
    )
    d.source = SOURCE
    d.code = ORDER_CODE
    result.push(d)
  }

  for (const key of diff.orphan) {
    const d = new vscode.Diagnostic(
      lineRange(document, startOf.get(key) ?? 0),
      `${key} is not declared in ${neutralName}.`,
      vscode.DiagnosticSeverity.Hint
    )
    d.source = SOURCE
    result.push(d)
  }

  for (const key of diff.duplicates) {
    const d = new vscode.Diagnostic(
      lineRange(document, startOf.get(key) ?? 0),
      `${key} is declared more than once.`,
      vscode.DiagnosticSeverity.Warning
    )
    d.source = SOURCE
    result.push(d)
  }

  for (const key of diff.placeholderMismatch) {
    const d = new vscode.Diagnostic(
      lineRange(document, startOf.get(key) ?? 0),
      `${key}: placeholders ({0}, {1}, ...) differ from ${neutralName} — formatting may break at runtime.`,
      vscode.DiagnosticSeverity.Warning
    )
    d.source = SOURCE
    result.push(d)
  }

  diagnostics.set(document.uri, result)
}

/** Diagnostics for the neutral file: which keys are not yet in every language. */
async function analyzeNeutral(
  document: vscode.TextDocument,
  group: ResxGroup,
  neutralText: string,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (group.locales.length === 0) {
    diagnostics.set(document.uri, [])
    return
  }
  // For each neutral key, collect the locales that lack it.
  const lackingByKey = new Map<string, string[]>()
  for (const locale of group.locales) {
    const text = await readFileText(locale.uri)
    if (text === null) {
      continue
    }
    for (const key of diffResx(neutralText, text).missing) {
      const list = lackingByKey.get(key) ?? []
      list.push(locale.locale!)
      lackingByKey.set(key, list)
    }
  }

  const entries = stringEntries(parseResx(neutralText))
  const startOf = new Map(entries.map(e => [e.name, e.startLine]))
  const result: vscode.Diagnostic[] = []
  for (const [key, langs] of lackingByKey) {
    const d = new vscode.Diagnostic(
      lineRange(document, startOf.get(key) ?? 0),
      `${key} is missing in: ${langs.sort().join(', ')}.`,
      vscode.DiagnosticSeverity.Hint
    )
    d.source = SOURCE
    d.code = NEUTRAL_MISSING_CODE
    result.push(d)
  }
  diagnostics.set(document.uri, result)
}

/* -------------------------------------------------------------------------- */
/*  Quick fixes                                                               */
/* -------------------------------------------------------------------------- */

class ResxCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const ours = context.diagnostics.filter(d => d.source === SOURCE)
    if (ours.length === 0) {
      return []
    }
    const parsed = parseResxName(path.basename(document.uri.fsPath))
    if (!parsed) {
      return []
    }
    const group = await resolveGroup(document.uri, parsed)
    if (!group || !group.neutral) {
      return []
    }
    const neutralText = await readFileText(group.neutral.uri)
    if (neutralText === null || isDesignerResx(neutralText)) {
      return []
    }
    const neutralKeys = stringEntries(parseResx(neutralText)).map(e => e.name)
    const actions: vscode.CodeAction[] = []

    if (parsed.locale !== null) {
      const diff = diffResx(neutralText, document.getText())
      if (diff.missing.length > 0) {
        const action = new vscode.CodeAction(
          `Add ${diff.missing.length} missing key${diff.missing.length === 1 ? '' : 's'} (empty)`,
          vscode.CodeActionKind.QuickFix
        )
        action.edit = buildInsertEdit(document, neutralKeys, diff.missing)
        action.diagnostics = ours.filter(d => d.code === MISSING_CODE)
        actions.push(action)
      }
      if (diff.orderDiffers) {
        const action = new vscode.CodeAction('Reorder keys to match the neutral file', vscode.CodeActionKind.QuickFix)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, fullRange(document), reorderToNeutral(document.getText(), neutralKeys))
        action.edit = edit
        action.diagnostics = ours.filter(d => d.code === ORDER_CODE)
        actions.push(action)
      }
    } else {
      // Neutral file: offer to add the missing key(s) to every language.
      const neutralMissing = ours.filter(d => d.code === NEUTRAL_MISSING_CODE)
      if (neutralMissing.length > 0) {
        const action = new vscode.CodeAction(
          `Add missing key${neutralMissing.length === 1 ? '' : 's'} to all languages (empty)`,
          vscode.CodeActionKind.QuickFix
        )
        action.edit = await buildSyncEdit(group, neutralText)
        action.diagnostics = neutralMissing
        actions.push(action)
      }
    }

    return actions
  }
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end)
}

/** A WorkspaceEdit inserting `missing` keys (empty) into one locale document. */
function buildInsertEdit(document: vscode.TextDocument, neutralKeys: string[], missing: string[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit()
  for (const ins of planInsertions(document.getText(), neutralKeys, missing)) {
    edit.insert(document.uri, new vscode.Position(ins.atLine, 0), ins.text + '\n')
  }
  return edit
}

/** A WorkspaceEdit adding every missing key (empty) to every satellite of a group. */
async function buildSyncEdit(group: ResxGroup, neutralText: string): Promise<vscode.WorkspaceEdit> {
  const neutralKeys = stringEntries(parseResx(neutralText)).map(e => e.name)
  const edit = new vscode.WorkspaceEdit()
  for (const locale of group.locales) {
    const text = await readFileText(locale.uri)
    if (text === null) {
      continue
    }
    const missing = diffResx(neutralText, text).missing
    if (missing.length === 0) {
      continue
    }
    for (const ins of planInsertions(text, neutralKeys, missing)) {
      edit.insert(locale.uri, new vscode.Position(ins.atLine, 0), ins.text + '\n')
    }
  }
  return edit
}

/* -------------------------------------------------------------------------- */
/*  Sync command (editor context + palette)                                   */
/* -------------------------------------------------------------------------- */

async function syncActiveGroup(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('Toolkit: open a .resx file to sync its languages.')
    return
  }
  const parsed = parseResxName(path.basename(editor.document.uri.fsPath))
  if (!parsed) {
    vscode.window.showInformationMessage('Toolkit: the active file is not a .resx file.')
    return
  }
  const group = await resolveGroup(editor.document.uri, parsed)
  if (!group || !group.neutral) {
    vscode.window.showInformationMessage('Toolkit: no neutral .resx found for this group.')
    return
  }
  const neutralText = await readFileText(group.neutral.uri)
  if (neutralText === null) {
    return
  }
  if (isDesignerResx(neutralText)) {
    vscode.window.showInformationMessage('Toolkit: designer/WinForms resx are not synced (satellites are partial by design).')
    return
  }
  if (group.locales.length === 0) {
    vscode.window.showInformationMessage('Toolkit: this group has no locale files to sync.')
    return
  }

  const neutralKeys = stringEntries(parseResx(neutralText)).map(e => e.name)
  const edit = new vscode.WorkspaceEdit()
  let added = 0
  for (const locale of group.locales) {
    const text = await readFileText(locale.uri)
    if (text === null) {
      continue
    }
    const missing = diffResx(neutralText, text).missing
    for (const ins of planInsertions(text, neutralKeys, missing)) {
      edit.insert(locale.uri, new vscode.Position(ins.atLine, 0), ins.text + '\n')
      added += ins.text.split('\n').length
    }
  }

  if (added === 0) {
    vscode.window.showInformationMessage(
      `Toolkit: no missing keys across ${group.locales.length} language file(s). (Use the lightbulb on a file to reorder its keys.)`
    )
    return
  }
  await vscode.workspace.applyEdit(edit)
  for (const doc of vscode.workspace.textDocuments) {
    if (parseResxName(path.basename(doc.uri.fsPath))?.base === group.base) {
      void analyzeDocument(doc, diagnostics)
    }
  }
  vscode.window.showInformationMessage(`Toolkit: added ${added} empty key(s) across the language files.`)
}

/* -------------------------------------------------------------------------- */
/*  Workspace audit                                                           */
/* -------------------------------------------------------------------------- */

interface GroupAudit {
  base: string
  dir: vscode.Uri
  neutralUri: vscode.Uri
  totalKeys: number
  /** Per locale: how many neutral keys it lacks. */
  missingByLocale: { locale: string; missing: number; order: boolean }[]
}

async function scanGroups(): Promise<ResxGroup[]> {
  const uris = await vscode.workspace.findFiles('**/*.resx', '**/{node_modules,bin,obj,.git}/**')
  const byKey = new Map<string, ResxGroup>()
  for (const uri of uris) {
    const parsed = parseResxName(path.basename(uri.fsPath))
    if (!parsed) {
      continue
    }
    const dir = path.dirname(uri.fsPath)
    const key = `${dir}::${parsed.base}`
    let group = byKey.get(key)
    if (!group) {
      group = { base: parsed.base, dir: vscode.Uri.joinPath(uri, '..'), neutral: null, locales: [] }
      byKey.set(key, group)
    }
    if (parsed.locale === null) {
      group.neutral = { uri, locale: null }
    } else {
      group.locales.push({ uri, locale: parsed.locale })
    }
  }
  return [...byKey.values()].filter(g => g.neutral && g.locales.length > 0)
}

async function auditGroup(group: ResxGroup): Promise<GroupAudit | null> {
  const neutralText = await readFileText(group.neutral!.uri)
  if (neutralText === null || isDesignerResx(neutralText)) {
    return null
  }
  const totalKeys = stringEntries(parseResx(neutralText)).length
  const missingByLocale = []
  for (const locale of group.locales) {
    const text = await readFileText(locale.uri)
    if (text === null) {
      continue
    }
    const diff = diffResx(neutralText, text)
    missingByLocale.push({ locale: locale.locale!, missing: diff.missing.length, order: diff.orderDiffers })
  }
  missingByLocale.sort((a, b) => a.locale.localeCompare(b.locale))
  return { base: group.base, dir: group.dir, neutralUri: group.neutral!.uri, totalKeys, missingByLocale }
}

async function checkWorkspace(): Promise<void> {
  const groups = await scanGroups()
  if (groups.length === 0) {
    vscode.window.showInformationMessage('Toolkit: no .resx localization groups were found.')
    return
  }
  const audits = (await Promise.all(groups.map(auditGroup))).filter((a): a is GroupAudit => a !== null)
  const outOfSync = audits.filter(a => a.missingByLocale.some(m => m.missing > 0 || m.order))
  if (outOfSync.length === 0) {
    vscode.window.showInformationMessage(`Toolkit: all ${audits.length} resx group(s) are in sync.`)
    return
  }
  const items = outOfSync.map(a => ({
    label: vscode.workspace.asRelativePath(a.neutralUri),
    description: a.missingByLocale
      .filter(m => m.missing > 0 || m.order)
      .map(m => `${m.locale}: ${[m.missing > 0 ? `${m.missing} missing` : '', m.order ? 'order' : ''].filter(Boolean).join('/')}`)
      .join(' · '),
    uri: a.neutralUri
  }))
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${outOfSync.length} resx group(s) out of sync — pick one to open the neutral file`
  })
  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.uri)
    await vscode.window.showTextDocument(doc)
  }
}

/* -------------------------------------------------------------------------- */
/*  Resources tree                                                            */
/* -------------------------------------------------------------------------- */

const VIEW_ID = 'toolkitResxGroups'

type ResxNode = AuditNode | LocaleNode

interface AuditNode {
  kind: 'group'
  audit: GroupAudit
}

interface LocaleNode {
  kind: 'locale'
  uri: vscode.Uri
  locale: string
  missing: number
  order: boolean
  total: number
}

class ResxTreeProvider implements vscode.TreeDataProvider<ResxNode> {
  private audits: GroupAudit[] = []
  private localesByBase = new Map<string, GroupMember[]>()
  private emitter = new vscode.EventEmitter<ResxNode | undefined | null | void>()
  readonly onDidChangeTreeData = this.emitter.event

  setAudits(audits: GroupAudit[], groups: ResxGroup[]): void {
    this.audits = audits.sort((a, b) =>
      vscode.workspace.asRelativePath(a.neutralUri).localeCompare(vscode.workspace.asRelativePath(b.neutralUri))
    )
    this.localesByBase = new Map(groups.map(g => [`${g.dir.fsPath}::${g.base}`, g.locales]))
    this.emitter.fire()
  }

  outOfSyncCount(): number {
    return this.audits.filter(a => a.missingByLocale.some(m => m.missing > 0 || m.order)).length
  }

  getTreeItem(node: ResxNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const a = node.audit
      const drift = a.missingByLocale.some(m => m.missing > 0 || m.order)
      const item = new vscode.TreeItem(
        vscode.workspace.asRelativePath(a.neutralUri),
        drift ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
      )
      item.description = a.missingByLocale
        .map(m => `${m.locale} ${a.totalKeys === 0 ? 100 : Math.round(((a.totalKeys - m.missing) / a.totalKeys) * 100)}%`)
        .join(' · ')
      item.iconPath = new vscode.ThemeIcon(drift ? 'warning' : 'globe')
      item.tooltip = `${a.totalKeys} key(s) in the neutral file — click to open it`
      item.resourceUri = a.neutralUri
      item.command = { title: 'Open neutral file', command: 'vscode.open', arguments: [a.neutralUri] }
      item.contextValue = 'resxGroup'
      return item
    }
    const item = new vscode.TreeItem(node.locale, vscode.TreeItemCollapsibleState.None)
    const issues = [
      node.missing > 0 ? `${node.missing} missing` : '',
      node.order ? 'order differs' : ''
    ].filter(Boolean)
    item.description = issues.length > 0 ? issues.join(' · ') : `${Math.round(((node.total - node.missing) / Math.max(1, node.total)) * 100)}%`
    item.iconPath = new vscode.ThemeIcon(node.missing > 0 || node.order ? 'circle-filled' : 'pass-filled')
    item.resourceUri = node.uri
    item.command = { title: 'Open', command: 'vscode.open', arguments: [node.uri] }
    return item
  }

  getChildren(parent?: ResxNode): ResxNode[] {
    if (!parent) {
      return this.audits.map<ResxNode>(audit => ({ kind: 'group', audit }))
    }
    if (parent.kind === 'group') {
      const a = parent.audit
      const locales = this.localesByBase.get(`${a.dir.fsPath}::${a.base}`) ?? []
      return locales.map<ResxNode>(loc => {
        const m = a.missingByLocale.find(x => x.locale === loc.locale)
        return {
          kind: 'locale',
          uri: loc.uri,
          locale: loc.locale!,
          missing: m?.missing ?? 0,
          order: m?.order ?? false,
          total: a.totalKeys
        }
      })
    }
    return []
  }
}

async function refreshTree(provider: ResxTreeProvider, treeView: vscode.TreeView<ResxNode>): Promise<void> {
  const groups = await scanGroups()
  const audits = (await Promise.all(groups.map(auditGroup))).filter((a): a is GroupAudit => a !== null)
  provider.setAudits(audits, groups)
  const count = provider.outOfSyncCount()
  treeView.badge = count > 0 ? { value: count, tooltip: `${count} resx group(s) out of sync` } : undefined
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

export function registerResxCheckCommands(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(SOURCE)
  const provider = new ResxTreeProvider()
  const treeView = vscode.window.createTreeView<ResxNode>(VIEW_ID, { treeDataProvider: provider })

  context.subscriptions.push(
    diagnostics,
    treeView,
    vscode.workspace.onDidOpenTextDocument(doc => void analyzeDocument(doc, diagnostics)),
    vscode.workspace.onDidSaveTextDocument(doc => {
      void analyzeDocument(doc, diagnostics)
      if (parseResxName(path.basename(doc.uri.fsPath))) {
        void refreshTree(provider, treeView)
      }
    }),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file', pattern: '**/*.resx' },
      new ResxCodeActionProvider(),
      { providedCodeActionKinds: ResxCodeActionProvider.providedCodeActionKinds }
    ),
    vscode.commands.registerCommand('toolkit.resx.checkWorkspace', () => checkWorkspace()),
    vscode.commands.registerCommand('toolkit.resx.syncGroup', () => syncActiveGroup(diagnostics)),
    vscode.commands.registerCommand('toolkit.resx.refresh', () => refreshTree(provider, treeView))
  )

  for (const doc of vscode.workspace.textDocuments) {
    void analyzeDocument(doc, diagnostics)
  }

  // Populate the tree lazily when it first becomes visible.
  let scanned = false
  const runScan = () => {
    if (scanned) {
      return
    }
    scanned = true
    void refreshTree(provider, treeView)
  }
  if (treeView.visible) {
    runScan()
  } else {
    context.subscriptions.push(treeView.onDidChangeVisibility(e => e.visible && runScan()))
  }
}
