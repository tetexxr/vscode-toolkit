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
  if (blame.uncommitted) {
    return '**Not committed yet**\n\n*This line has uncommitted changes.*'
  }
  const message = options.fullMessage ?? blame.summary
  const subject = extractSubject(message) || '(no message)'
  const body = extractBody(message)
  const shortSha = blame.sha.slice(0, 7)
  const date = formatRelative(new Date(blame.authorTime * 1000), options.now ? new Date(options.now) : undefined)

  const lines: string[] = [`**${escapeMd(subject)}**`, '', `\`${shortSha}\` · ${escapeMd(blame.author)} · ${date}`]
  if (body) {
    lines.push('', escapeMd(body))
  }
  const showArgs = encodeURIComponent(JSON.stringify([blame.sha]))
  lines.push('', '---', '', `[Show full commit](command:toolkit.peekCommit.showFull?${showArgs})`)
  return lines.join('\n')
}

function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, m => `\\${m}`)
}
