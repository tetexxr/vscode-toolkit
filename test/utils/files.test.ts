import { strict as assert } from 'assert';
import { isExcluded } from '../../src/utils/files';

describe('isExcluded', () => {
  it('should match exact folder name case-insensitively', () => {
    assert.equal(isExcluded('node_modules', ['node_modules']), true);
    assert.equal(isExcluded('Node_Modules', ['node_modules']), true);
  });

  it('should return false when name does not match any pattern', () => {
    assert.equal(isExcluded('src', ['node_modules', '.git', 'dist']), false);
  });

  it('should support wildcard patterns', () => {
    assert.equal(isExcluded('.hidden', ['.*']), true);
    assert.equal(isExcluded('.git', ['.*']), true);
    assert.equal(isExcluded('visible', ['vis*']), true);
    assert.equal(isExcluded('lib-output', ['lib-*']), true);
    assert.equal(isExcluded('src', ['lib-*']), false);
  });

  it('should support wildcard in the middle of a pattern', () => {
    assert.equal(isExcluded('test_output', ['test_*']), true);
    assert.equal(isExcluded('test_', ['test_*']), true);
    assert.equal(isExcluded('my_test', ['test_*']), false);
  });

  it('should return false when exclude list is empty', () => {
    assert.equal(isExcluded('anything', []), false);
  });

  it('should match against multiple patterns', () => {
    const patterns = ['.git', 'node_modules', 'dist'];
    assert.equal(isExcluded('.git', patterns), true);
    assert.equal(isExcluded('dist', patterns), true);
    assert.equal(isExcluded('src', patterns), false);
  });
});
