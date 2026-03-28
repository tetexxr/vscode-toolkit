/**
 * HTTP utilities using Node.js built-in modules.
 * Zero external dependencies — replaces node-fetch / axios.
 */

import * as https from 'https';
import * as http from 'http';

export interface HttpRequestOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Makes an HTTP/HTTPS GET request and parses the JSON response.
 * Uses the built-in Node.js http/https modules (no external dependencies).
 */
export function httpGetJson<T>(options: HttpRequestOptions): Promise<T> {
  const { url, headers = {}, timeout = 10_000 } = options;

  const lib = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(url, { headers, timeout }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        // Consume the response to free up memory
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(new Error(`Failed to parse JSON from ${url}: ${err}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed for ${url}: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms for ${url}`));
    });
  });
}
