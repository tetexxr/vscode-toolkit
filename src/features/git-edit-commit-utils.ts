import type { CommitFileInfo } from '../utils/git'

export const LARGE_DIFF_LINE_THRESHOLD = 5000

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderFileList(files: CommitFileInfo[]): string {
  const html: string[] = []
  for (const file of files) {
    const statusClass = file.status === 'A' ? 'added' : file.status === 'D' ? 'deleted' : 'modified'
    const lastSlash = file.path.lastIndexOf('/')
    const dir = lastSlash >= 0 ? file.path.substring(0, lastSlash + 1) : ''
    const name = lastSlash >= 0 ? file.path.substring(lastSlash + 1) : file.path
    const additions = file.additions > 0 ? `<span class="stat-add">+${file.additions}</span>` : ''
    const deletions = file.deletions > 0 ? `<span class="stat-del">-${file.deletions}</span>` : ''

    html.push(
      `<div class="file-entry" data-path="${escapeHtml(file.path)}">` +
        `<span class="file-status ${statusClass}">${escapeHtml(file.status)}</span>` +
        `<span class="file-path"><span class="file-dir">${escapeHtml(dir)}</span>${escapeHtml(name)}</span>` +
        `<span class="file-stats">${additions}${deletions}</span>` +
        `</div>`
    )
  }
  return html.join('\n')
}

export function renderDiffContent(raw: string): string {
  const lines = raw.split('\n')
  const html: string[] = []
  let started = false

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      html.push(`<div class="diff-header">${escapeHtml(line)}</div>`)
      started = true
      continue
    }

    if (!started) continue

    if (line.startsWith('@@')) {
      html.push(`<div class="hunk-header">${escapeHtml(line)}</div>`)
    } else if (line.startsWith('+')) {
      html.push(`<div class="line-add">${escapeHtml(line)}</div>`)
    } else if (line.startsWith('-')) {
      html.push(`<div class="line-del">${escapeHtml(line)}</div>`)
    } else if (
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('similarity') ||
      line.startsWith('rename') ||
      line.startsWith('Binary')
    ) {
      html.push(`<div class="diff-meta">${escapeHtml(line)}</div>`)
    } else {
      html.push(`<div class="line-ctx">${escapeHtml(line)}</div>`)
    }
  }

  return html.join('\n')
}

export function renderDiffPlaceholders(files: CommitFileInfo[]): string {
  const html: string[] = []
  for (const file of files) {
    const totalLines = file.additions + file.deletions
    let status: 'idle' | 'large' | 'binary'
    let inner: string
    if (file.isBinary) {
      status = 'binary'
      inner = '<div class="diff-placeholder">Binary file (no diff available)</div>'
    } else if (totalLines > LARGE_DIFF_LINE_THRESHOLD) {
      status = 'large'
      inner =
        `<div class="diff-placeholder large">` +
        `<span>Diff grande (${totalLines} líneas modificadas)</span>` +
        `<button class="secondary load-large">Cargar diff</button>` +
        `</div>`
    } else {
      status = 'idle'
      inner = '<div class="diff-placeholder">Cargando diff…</div>'
    }
    html.push(
      `<div class="diff-block" data-diff-path="${escapeHtml(file.path)}" data-diff-status="${status}">${inner}</div>`
    )
  }
  return html.join('\n')
}
