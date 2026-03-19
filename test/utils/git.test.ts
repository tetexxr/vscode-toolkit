import { strict as assert } from 'assert';
import { parseRemoteUrl } from '../../src/utils/git';

describe('parseRemoteUrl', () => {
  it('should parse SSH remote URL', () => {
    const result = parseRemoteUrl('git@github.com:owner/repo.git');
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' });
  });

  it('should parse HTTPS remote URL', () => {
    const result = parseRemoteUrl('https://github.com/owner/repo.git');
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' });
  });

  it('should parse HTTPS remote URL without .git suffix', () => {
    const result = parseRemoteUrl('https://github.com/owner/repo');
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' });
  });

  it('should parse ssh:// protocol URL', () => {
    const result = parseRemoteUrl('ssh://git@github.com/owner/repo.git');
    assert.deepEqual(result, { domain: 'github.com', owner: 'owner', repo: 'repo' });
  });

  it('should parse GitHub Enterprise URL', () => {
    const result = parseRemoteUrl('git@github.corp.com:team/project.git');
    assert.deepEqual(result, { domain: 'github.corp.com', owner: 'team', repo: 'project' });
  });

  it('should handle hyphens in owner and repo names', () => {
    const result = parseRemoteUrl('git@github.com:my-org/my-repo.git');
    assert.deepEqual(result, { domain: 'github.com', owner: 'my-org', repo: 'my-repo' });
  });

  it('should return undefined for an invalid URL', () => {
    assert.equal(parseRemoteUrl('not-a-url'), undefined);
  });

  it('should return undefined for an empty string', () => {
    assert.equal(parseRemoteUrl(''), undefined);
  });
});
