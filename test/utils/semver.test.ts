import { strict as assert } from 'assert';
import { parseSemVer, compareSemVer, isPrerelease, formatDownloads } from '../../src/utils/semver';

describe('parseSemVer', () => {
  it('should parse a standard 3-part version', () => {
    const v = parseSemVer('1.2.3');
    assert.deepEqual(v, { major: 1, minor: 2, patch: 3, revision: 0, prerelease: '', original: '1.2.3' });
  });

  it('should parse a 4-part NuGet version', () => {
    const v = parseSemVer('1.2.3.4');
    assert.deepEqual(v, { major: 1, minor: 2, patch: 3, revision: 4, prerelease: '', original: '1.2.3.4' });
  });

  it('should parse a prerelease version', () => {
    const v = parseSemVer('1.0.0-beta.1');
    assert.deepEqual(v, { major: 1, minor: 0, patch: 0, revision: 0, prerelease: 'beta.1', original: '1.0.0-beta.1' });
  });

  it('should parse a 4-part prerelease version', () => {
    const v = parseSemVer('2.0.0.1-rc.2');
    assert.deepEqual(v, { major: 2, minor: 0, patch: 0, revision: 1, prerelease: 'rc.2', original: '2.0.0.1-rc.2' });
  });

  it('should return null for invalid version', () => {
    assert.equal(parseSemVer('not-a-version'), null);
  });

  it('should return null for empty string', () => {
    assert.equal(parseSemVer(''), null);
  });

  it('should return null for partial version', () => {
    assert.equal(parseSemVer('1.2'), null);
  });

  it('should parse version with zero components', () => {
    const v = parseSemVer('0.0.0');
    assert.deepEqual(v, { major: 0, minor: 0, patch: 0, revision: 0, prerelease: '', original: '0.0.0' });
  });
});

describe('compareSemVer', () => {
  it('should return 0 for equal versions', () => {
    assert.equal(compareSemVer('1.0.0', '1.0.0'), 0);
  });

  it('should compare major versions', () => {
    assert.ok(compareSemVer('2.0.0', '1.0.0') > 0);
    assert.ok(compareSemVer('1.0.0', '2.0.0') < 0);
  });

  it('should compare minor versions', () => {
    assert.ok(compareSemVer('1.2.0', '1.1.0') > 0);
    assert.ok(compareSemVer('1.1.0', '1.2.0') < 0);
  });

  it('should compare patch versions', () => {
    assert.ok(compareSemVer('1.0.2', '1.0.1') > 0);
    assert.ok(compareSemVer('1.0.1', '1.0.2') < 0);
  });

  it('should compare 4-part versions by revision', () => {
    assert.ok(compareSemVer('1.0.0.2', '1.0.0.1') > 0);
    assert.ok(compareSemVer('1.0.0.1', '1.0.0.2') < 0);
  });

  it('should rank prerelease lower than release', () => {
    assert.ok(compareSemVer('1.0.0-beta', '1.0.0') < 0);
    assert.ok(compareSemVer('1.0.0', '1.0.0-beta') > 0);
  });

  it('should compare prerelease numeric segments', () => {
    assert.ok(compareSemVer('1.0.0-beta.2', '1.0.0-beta.1') > 0);
    assert.ok(compareSemVer('1.0.0-beta.1', '1.0.0-beta.10') < 0);
  });

  it('should compare prerelease string segments lexicographically', () => {
    assert.ok(compareSemVer('1.0.0-rc.1', '1.0.0-beta.1') > 0);
    assert.ok(compareSemVer('1.0.0-alpha', '1.0.0-beta') < 0);
  });

  it('should rank numeric prerelease segment lower than string', () => {
    assert.ok(compareSemVer('1.0.0-1', '1.0.0-alpha') < 0);
  });

  it('should rank fewer prerelease segments lower', () => {
    assert.ok(compareSemVer('1.0.0-beta', '1.0.0-beta.1') < 0);
  });

  it('should handle invalid versions gracefully', () => {
    assert.ok(compareSemVer('invalid', '1.0.0') < 0);
    assert.ok(compareSemVer('1.0.0', 'invalid') > 0);
    assert.equal(compareSemVer('invalid', 'also-invalid'), 0);
  });

  it('should sort a list of versions correctly', () => {
    const versions = ['3.0.0', '1.0.0', '2.0.0-beta', '2.0.0', '1.0.0-alpha'];
    const sorted = [...versions].sort(compareSemVer);
    assert.deepEqual(sorted, ['1.0.0-alpha', '1.0.0', '2.0.0-beta', '2.0.0', '3.0.0']);
  });
});

describe('isPrerelease', () => {
  it('should return false for stable version', () => {
    assert.equal(isPrerelease('1.0.0'), false);
  });

  it('should return false for 4-part stable version', () => {
    assert.equal(isPrerelease('1.0.0.1'), false);
  });

  it('should return true for prerelease version', () => {
    assert.equal(isPrerelease('1.0.0-beta'), true);
  });

  it('should return true for prerelease with numeric segment', () => {
    assert.equal(isPrerelease('1.0.0-rc.1'), true);
  });

  it('should return true for 4-part prerelease', () => {
    assert.equal(isPrerelease('1.0.0.1-preview'), true);
  });
});

describe('formatDownloads', () => {
  it('should format zero', () => {
    assert.equal(formatDownloads(0), '0');
  });

  it('should format numbers under 1000 as-is', () => {
    assert.equal(formatDownloads(42), '42');
    assert.equal(formatDownloads(999), '999');
  });

  it('should format thousands with K suffix', () => {
    assert.equal(formatDownloads(1_000), '1K');
    assert.equal(formatDownloads(1_500), '1.5K');
    assert.equal(formatDownloads(23_400), '23.4K');
    assert.equal(formatDownloads(999_900), '999.9K');
  });

  it('should format millions with M suffix', () => {
    assert.equal(formatDownloads(1_000_000), '1M');
    assert.equal(formatDownloads(1_200_000), '1.2M');
    assert.equal(formatDownloads(350_000_000), '350M');
  });

  it('should format billions with B suffix', () => {
    assert.equal(formatDownloads(1_000_000_000), '1B');
    assert.equal(formatDownloads(5_300_000_000), '5.3B');
  });
});
