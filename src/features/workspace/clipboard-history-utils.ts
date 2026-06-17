export interface ClipboardHistoryItem {
  text: string
  addedAt: number
  /** Pinned entries are exempt from FIFO eviction and survive a soft clear. */
  pinned?: boolean
}

export interface ClipboardHistoryLimits {
  maxItems: number
  maxItemLength: number
}

export class ClipboardHistory {
  private items: ClipboardHistoryItem[] = []
  private limits: ClipboardHistoryLimits

  constructor(limits: ClipboardHistoryLimits) {
    this.limits = { ...limits }
  }

  /**
   * Adds an entry to the history. Returns true if it was added (or moved to
   * the front for an existing duplicate); false if the input is rejected
   * (empty or beyond the per-item length limit).
   */
  add(text: string, now: number = Date.now()): boolean {
    if (text.length === 0) {
      return false
    }
    if (text.length > this.limits.maxItemLength) {
      return false
    }
    const existingIndex = this.items.findIndex(item => item.text === text)
    if (existingIndex >= 0) {
      const [existing] = this.items.splice(existingIndex, 1)
      existing.addedAt = now
      this.items.unshift(existing)
      return true
    }
    this.items.unshift({ text, addedAt: now })
    this.evictOverflow()
    return true
  }

  /** Removes the oldest UNPINNED entries until the cap is respected. */
  private evictOverflow(): void {
    let unpinned = this.items.filter(item => !item.pinned).length
    for (let i = this.items.length - 1; i >= 0 && unpinned > this.limits.maxItems; i--) {
      if (!this.items[i].pinned) {
        this.items.splice(i, 1)
        unpinned--
      }
    }
  }

  /**
   * Toggles the pinned state of the entry with this text.
   * Returns the new state, or null when the entry doesn't exist.
   */
  togglePin(text: string): boolean | null {
    const item = this.items.find(i => i.text === text)
    if (!item) {
      return null
    }
    item.pinned = !item.pinned
    if (!item.pinned) {
      this.evictOverflow()
    }
    return item.pinned
  }

  getAll(): ClipboardHistoryItem[] {
    return [...this.items]
  }

  /** Clears the history; with `keepPinned`, pinned entries survive. */
  clear(keepPinned = false): void {
    this.items = keepPinned ? this.items.filter(item => item.pinned) : []
  }

  size(): number {
    return this.items.length
  }

  pinnedCount(): number {
    return this.items.filter(item => item.pinned).length
  }

  setLimits(limits: ClipboardHistoryLimits): void {
    this.limits = { ...limits }
    this.evictOverflow()
  }
}

/* -------------------------------------------------------------------------- */
/*  Item presentation                                                         */
/* -------------------------------------------------------------------------- */

export interface FormattedItem {
  label: string
  description: string
  /** Optional. Only set when there is content beyond what fits in `label`. */
  detail?: string
}

const LABEL_MAX = 80
const DETAIL_MAX = 200
const NEWLINE_GLYPH = '↵ '

export function formatItem(item: ClipboardHistoryItem, now: number = Date.now()): FormattedItem {
  const lines = item.text.split(/\r?\n/)
  const firstLine = lines[0] ?? ''
  const restLines = lines.slice(1)

  const firstLineTruncated = firstLine.length > LABEL_MAX
  const label = firstLineTruncated ? firstLine.slice(0, LABEL_MAX) + '…' : firstLine

  const lineCount = lines.length
  const lineLabel = lineCount === 1 ? '1 line' : `${lineCount} lines`
  const description = `${lineLabel} · ${formatAge(now - item.addedAt)}`

  // Build the continuation: leftover of the first line + the remaining lines.
  let detail = ''
  if (firstLineTruncated) {
    detail = '…' + firstLine.slice(LABEL_MAX)
  }
  if (restLines.length > 0) {
    const rest = restLines.map(line => NEWLINE_GLYPH + line).join(' ')
    detail = detail.length > 0 ? `${detail} ${rest}` : rest
  }
  if (detail.length > DETAIL_MAX) {
    detail = detail.slice(0, DETAIL_MAX) + '…'
  }

  return detail ? { label, description, detail } : { label, description }
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }
  return text.slice(0, max) + '…'
}

export function formatAge(ms: number): string {
  if (ms < 0) {
    return 'just now'
  }
  const sec = Math.floor(ms / 1000)
  if (sec < 5) {
    return 'just now'
  }
  if (sec < 60) {
    return `${sec}s ago`
  }
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return `${min}m ago`
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    return `${hr}h ago`
  }
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
