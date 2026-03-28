import { strict as assert } from 'assert';
import { shouldProvide, guessVariableName } from '../../src/features/npm-intellisense-utils';

describe('shouldProvide', () => {
  function cursor(line: string): [string, number] {
    const pos = line.indexOf('|');
    return [line.replace('|', ''), pos];
  }

  // --- import ... from ---

  it('should provide for import from with single quotes', () => {
    const [line, pos] = cursor("import { x } from '|'");
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for import from with double quotes', () => {
    const [line, pos] = cursor('import { x } from "|"');
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for import from without spaces around braces', () => {
    const [line, pos] = cursor("import {x}from '|'");
    assert.equal(shouldProvide(line, pos), true);
  });

  // --- direct import ---

  it('should provide for direct import with single quotes', () => {
    const [line, pos] = cursor("import '|'");
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for direct import with double quotes', () => {
    const [line, pos] = cursor('import "|"');
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for direct import without space', () => {
    const [line, pos] = cursor("import'|'");
    assert.equal(shouldProvide(line, pos), true);
  });

  // --- require ---

  it('should provide for require with single quotes', () => {
    const [line, pos] = cursor("const x = require('|')");
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for require with double quotes', () => {
    const [line, pos] = cursor('const x = require("|")');
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for var require', () => {
    const [line, pos] = cursor("var xy = require('|')");
    assert.equal(shouldProvide(line, pos), true);
  });

  // --- should NOT provide ---

  it('should not provide for non-import lines', () => {
    const [line, pos] = cursor("anything '|'");
    assert.equal(shouldProvide(line, pos), false);
  });

  it('should not provide for empty line', () => {
    assert.equal(shouldProvide('', 0), false);
  });

  it('should not provide for plain variable assignment', () => {
    const [line, pos] = cursor("const x = '|'");
    assert.equal(shouldProvide(line, pos), false);
  });

  // --- relative paths (dot) ---

  it('should not provide when import starts with a dot', () => {
    const [line, pos] = cursor("import { x } from './|'");
    assert.equal(shouldProvide(line, pos), false);
  });

  it('should not provide when direct import starts with a dot', () => {
    const [line, pos] = cursor("import './|'");
    assert.equal(shouldProvide(line, pos), false);
  });

  it('should not provide when require starts with a dot', () => {
    const [line, pos] = cursor("const x = require('./|')");
    assert.equal(shouldProvide(line, pos), false);
  });

  it('should not provide for parent relative path', () => {
    const [line, pos] = cursor("import { x } from '../|'");
    assert.equal(shouldProvide(line, pos), false);
  });

  // --- partially typed package names ---

  it('should provide when package name is partially typed', () => {
    const [line, pos] = cursor("import { x } from 'lod|'");
    assert.equal(shouldProvide(line, pos), true);
  });

  it('should provide for scoped package', () => {
    const [line, pos] = cursor("import { x } from '@angular/|'");
    assert.equal(shouldProvide(line, pos), true);
  });
});

describe('guessVariableName', () => {
  it('should return simple name unchanged', () => {
    assert.equal(guessVariableName('express'), 'express');
  });

  it('should convert kebab-case to camelCase', () => {
    assert.equal(guessVariableName('body-parser'), 'bodyParser');
  });

  it('should handle multiple hyphens', () => {
    assert.equal(guessVariableName('my-long-package'), 'myLongPackage');
  });

  it('should handle single character after hyphen', () => {
    assert.equal(guessVariableName('a-b'), 'aB');
  });

  it('should return name without hyphens unchanged', () => {
    assert.equal(guessVariableName('lodash'), 'lodash');
  });
});
