import { formatRelative } from './timestamp-utils'

export interface BlameInfo {
  sha: string
  author: string
  authorEmail: string
  authorTime: number
  summary: string
  uncommitted: boolean
}

export function isUncommittedSha(sha: string): boolean {
  return /^0+$/.test(sha) && sha.length >= 7
}

/**
 * Parses a single-entry output of `git blame -L X,X --porcelain`. Returns null
 * when the input doesn't start with a valid header.
 */
export function parseBlamePorcelain(output: string): BlameInfo | null {
  const lines = output.split('\n')
  if (lines.length === 0) {
    return null
  }
  const header = lines[0].match(/^([0-9a-f]+) (\d+) (\d+)/)
  if (!header) {
    return null
  }
  const sha = header[1]
  const props: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('\t')) {
      break
    }
    const space = line.indexOf(' ')
    if (space < 0) {
      props[line] = ''
      continue
    }
    props[line.slice(0, space)] = line.slice(space + 1)
  }
  const authorTime = parseInt(props['author-time'] ?? '0', 10)
  const authorMail = (props['author-mail'] ?? '').replace(/^<|>$/g, '')
  return {
    sha,
    author: props.author ?? 'Unknown',
    authorEmail: authorMail,
    authorTime: Number.isFinite(authorTime) ? authorTime : 0,
    summary: props.summary ?? '',
    uncommitted: isUncommittedSha(sha)
  }
}

/* -------------------------------------------------------------------------- */
/*  Commit message helpers                                                    */
/* -------------------------------------------------------------------------- */

export function extractSubject(message: string): string {
  if (!message) {
    return ''
  }
  const idx = message.indexOf('\n')
  return (idx < 0 ? message : message.slice(0, idx)).trim()
}

export function extractBody(message: string): string {
  if (!message) {
    return ''
  }
  const idx = message.indexOf('\n')
  if (idx < 0) {
    return ''
  }
  return message.slice(idx + 1).trim()
}

/* -------------------------------------------------------------------------- */
/*  Hover formatting                                                          */
/* -------------------------------------------------------------------------- */

export interface FormatHoverOptions {
  /** Full commit message (subject + body). When undefined, falls back to blame summary. */
  fullMessage?: string
  /** Unix-ms reference time for the relative date — useful for testing. */
  now?: number
}

export function formatHover(blame: BlameInfo, options: FormatHoverOptions = {}): string {
  // Non-breaking space at the start gives a small visual gap so the popup doesn't sit
  // flush against the previous hover provider's content. Regular spaces are trimmed
  // by the markdown renderer at the start of a paragraph.
  const PREFIX = '\n'

  if (blame.uncommitted) {
    return PREFIX + '**Not committed yet** — *uncommitted changes on this line.*'
  }
  const message = options.fullMessage ?? blame.summary
  const subject = extractSubject(message) || '(no message)'
  const body = extractBody(message)
  const shortSha = blame.sha.slice(0, 7)
  const date = formatRelative(new Date(blame.authorTime * 1000), options.now ? new Date(options.now) : undefined)
  const showArgs = encodeURIComponent(JSON.stringify([blame.sha]))

  // Subject + metadata + link share a single paragraph block so the markdown renderer
  // doesn't insert visible spacing between them. The body, when present, gets a paragraph
  // of its own for readability.
  const header = `**${escapeMd(subject)}**  \n\`${shortSha}\` · ${escapeMd(blame.author)} · ${date}`
  const link = `[Show full commit](command:toolkit.peekCommit.showFull?${showArgs})`

  if (body) {
    const bodyFormatted = body
      .split(/\r?\n/)
      .map(line => escapeMd(line))
      .join('  \n')
    return PREFIX + [header, bodyFormatted, link].join('\n\n')
  }
  return PREFIX + `${header}  \n${link}`
}

function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, m => `\\${m}`)
}
