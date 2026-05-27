/**
 * HTML / webview helpers shared across features.
 *
 * `escapeHtml` does a full HTML-entity escape so the output is safe for both
 * text nodes and attribute values. `createNonce` returns a cryptographically
 * random nonce suitable for the `nonce-…` directive in a webview Content
 * Security Policy.
 */

import * as crypto from 'crypto'

/** Escape every HTML metacharacter — safe for both text content and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Cryptographically random nonce for the `script-src 'nonce-…'` directive in a webview CSP. */
export function createNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}
