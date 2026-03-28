/**
 * HTTP utilities using Node.js built-in modules.
 * Zero external dependencies — replaces node-fetch / axios.
 * Handles gzip/deflate/br responses (required by NuGet API).
 */

import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { pipeline, Readable, Transform } from 'stream';

export interface HttpRequestOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Makes an HTTP/HTTPS GET request and parses the JSON response.
 * Automatically decompresses gzip, deflate, and br responses.
 */
export function httpGetJson<T>(options: HttpRequestOptions): Promise<T> {
  const { url, headers = {}, timeout = 10_000 } = options;

  const lib = url.startsWith('https') ? https : http;
  const requestHeaders = { ...headers, 'Accept-Encoding': 'gzip, deflate' };

  return new Promise((resolve, reject) => {
    const req = lib.get(url, { headers: requestHeaders, timeout }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      // Decompress if needed
      let stream: Readable = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(new Error(`Failed to parse JSON from ${url}: ${err}`));
        }
      });
      stream.on('error', (err) => reject(new Error(`Decompression failed for ${url}: ${err.message}`)));
    });

    req.on('error', (err) => reject(new Error(`Request failed for ${url}: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms for ${url}`));
    });
  });
}
