/**
 * SemVer parsing and comparison utilities for NuGet package versions.
 * Zero external dependencies — replaces the npm `semver` package.
 *
 * Supports standard SemVer 2.0 (1.2.3, 1.2.3-beta.1) and
 * NuGet's 4-part versions (1.2.3.4).
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  revision: number;
  prerelease: string;
  original: string;
}

/**
 * Parses a version string into its components.
 * Returns null if the string cannot be parsed.
 *
 * Accepted formats:
 *   "1.2.3"           → { major: 1, minor: 2, patch: 3, revision: 0, prerelease: '' }
 *   "1.2.3.4"         → { major: 1, minor: 2, patch: 3, revision: 4, prerelease: '' }
 *   "1.2.3-beta.1"    → { major: 1, minor: 2, patch: 3, revision: 0, prerelease: 'beta.1' }
 *   "1.2.3.4-rc.2"    → { major: 1, minor: 2, patch: 3, revision: 4, prerelease: 'rc.2' }
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+))?$/
  );
  if (!match) { return null; }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    revision: match[4] !== undefined ? Number(match[4]) : 0,
    prerelease: match[5] || '',
    original: version,
  };
}

/**
 * Compares two version strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 *
 * Comparison order: major → minor → patch → revision → prerelease.
 * A prerelease version is considered less than the release version
 * (e.g. 1.0.0-beta < 1.0.0). Prerelease strings are compared
 * segment by segment (split on '.'), numerically if both are numbers,
 * lexicographically otherwise.
 */
export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);

  // Unparseable versions sort to the end
  if (!pa && !pb) { return 0; }
  if (!pa) { return -1; }
  if (!pb) { return 1; }

  const diff =
    (pa.major - pb.major) ||
    (pa.minor - pb.minor) ||
    (pa.patch - pb.patch) ||
    (pa.revision - pb.revision);

  if (diff !== 0) { return diff; }

  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** Compares prerelease strings segment by segment. */
function comparePrerelease(a: string, b: string): number {
  // No prerelease on either — equal
  if (!a && !b) { return 0; }
  // Having a prerelease is less than not having one (1.0.0-beta < 1.0.0)
  if (a && !b) { return -1; }
  if (!a && b) { return 1; }

  const partsA = a.split('.');
  const partsB = b.split('.');
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const segA = partsA[i];
    const segB = partsB[i];

    // Fewer segments means lower precedence
    if (segA === undefined) { return -1; }
    if (segB === undefined) { return 1; }

    const numA = Number(segA);
    const numB = Number(segB);
    const aIsNum = !isNaN(numA);
    const bIsNum = !isNaN(numB);

    if (aIsNum && bIsNum) {
      if (numA !== numB) { return numA - numB; }
    } else if (aIsNum) {
      return -1; // numeric < string
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = segA.localeCompare(segB);
      if (cmp !== 0) { return cmp; }
    }
  }

  return 0;
}

/** Returns true if the version string contains a prerelease tag. */
export function isPrerelease(version: string): boolean {
  return /-/.test(version.replace(/^\d+\.\d+\.\d+(?:\.\d+)?/, ''));
}

/**
 * Formats a download count into a human-readable short string.
 *   0        → "0"
 *   999      → "999"
 *   1_500    → "1.5K"
 *   23_400   → "23.4K"
 *   1_200_000→ "1.2M"
 *   5_000_000_000 → "5B"
 */
export function formatDownloads(count: number): string {
  if (count < 1_000) { return String(count); }
  if (count < 1_000_000) { return trimTrailingZero((count / 1_000).toFixed(1)) + 'K'; }
  if (count < 1_000_000_000) { return trimTrailingZero((count / 1_000_000).toFixed(1)) + 'M'; }
  return trimTrailingZero((count / 1_000_000_000).toFixed(1)) + 'B';
}

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '');
}
