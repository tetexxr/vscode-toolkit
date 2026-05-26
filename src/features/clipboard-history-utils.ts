export interface ClipboardHistoryItem {
  text: string
  addedAt: number
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
    while (this.items.length > this.limits.maxItems) {
      this.items.pop()
    }
    return true
  }

  getAll(): ClipboardHistoryItem[] {
    return [...this.items]
  }

  clear(): void {
    this.items = []
  }

  size(): number {
    return this.items.length
  }

  setLimits(limits: ClipboardHistoryLimits): void {
    this.limits = { ...limits }
    while (this.items.length > this.limits.maxItems) {
      this.items.pop()
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Item presentation                                                         */
/* -------------------------------------------------------------------------- */

export interface FormattedItem {
  label: string
  description: string
  detail: string
}

const LABEL_MAX = 80
const DETAIL_MAX = 200

export function formatItem(item: ClipboardHistoryItem, now: number = Date.now()): FormattedItem {
  const firstLine = item.text.split(/\r?\n/, 1)[0] ?? ''
  const label = truncate(firstLine, LABEL_MAX)
  const lineCount = item.text.split(/\r?\n/).length
  const lineLabel = lineCount === 1 ? '1 line' : `${lineCount} lines`
  const description = `${lineLabel} · ${formatAge(now - item.addedAt)}`
  const detail = truncate(item.text, DETAIL_MAX)
  return { label, description, detail }
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
