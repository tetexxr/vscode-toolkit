/**
 * Pure logic for Local History — the JetBrains-style per-file revision store.
 * Everything here is filesystem- and vscode-free so it can be unit-tested under
 * mocha; the actual disk I/O and editor wiring live in `local-history.ts`.
 */

import { createHash } from 'node:crypto'

export interface RevisionMeta {
  /** Unique id; also the basename of the stored (gzipped) content file. */
  id: string
  /** Epoch millis when the snapshot was taken. */
  timestamp: number
  /** Byte length of the uncompressed content. */
  size: number
  /** Content fingerprint, used to skip storing an unchanged snapshot. */
  hash: string
}

export interface FileHistory {
  /** The file URI string this history belongs to. */
  uri: string
  /** Revisions, newest first. */
  revisions: RevisionMeta[]
}

/** Stable, filesystem-safe directory name for a file URI. */
export function historyKey(uriString: string): string {
  return createHash('sha1').update(uriString).digest('hex')
}

export function contentHash(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

/** Builds a revision id that stays sortable by time and unique within a millisecond. */
export function makeRevisionId(timestamp: number, counter: number): string {
  return `${timestamp}-${counter.toString(36)}`
}

export function isDuplicateOfLatest(revisions: RevisionMeta[], hash: string): boolean {
  return revisions.length > 0 && revisions[0].hash === hash
}

export interface PruneOptions {
  /** Keep at most this many revisions (<= 0 means unlimited). */
  maxRevisions: number
  /** Drop revisions older than this (<= 0 means no age limit). */
  maxAgeMs: number
}

export interface PruneResult {
  kept: RevisionMeta[]
  removed: RevisionMeta[]
}

/**
 * Splits revisions (newest first) into the ones to keep and the ones to drop,
 * applying the age limit first and then the count cap. The newest revision is
 * always kept, even when it is already older than `maxAgeMs`, so a file you
 * stopped touching never loses its last known good state.
 */
export function pruneRevisions(revisions: RevisionMeta[], options: PruneOptions, now: number): PruneResult {
  const maxAge = options.maxAgeMs > 0 ? options.maxAgeMs : Infinity
  const maxCount = options.maxRevisions > 0 ? options.maxRevisions : Infinity
  const kept: RevisionMeta[] = []
  const removed: RevisionMeta[] = []
  revisions.forEach((rev, index) => {
    const tooOld = now - rev.timestamp > maxAge
    const overflow = kept.length >= maxCount
    if (index > 0 && (tooOld || overflow)) {
      removed.push(rev)
    } else {
      kept.push(rev)
    }
  })
  return { kept, removed }
}

/** Human-friendly age, e.g. "just now", "5 min ago", "2 h ago", "3 d ago". */
export function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 10) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days} d ago`
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months} mo ago`
  }
  return `${Math.floor(months / 12)} y ago`
}

/** Human-friendly byte size, e.g. "812 B", "4.2 KB", "1.3 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
