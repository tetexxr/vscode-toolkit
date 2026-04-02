import { strict as assert } from 'assert';
import {
  skipString,
  findClosingParen,
  findClosingBrace,
  findStatementEnd,
  nextNonWhitespace,
  findBracelessControl,
  findBracedSingleStatementControl,
  computeAddBraces,
  computeRemoveBraces,
} from '../../src/utils/braces';

// ── Helper ─────────────────────────────────────────────────────────

function applyEdit(
  input: string,
  edit: { startLine: number; startCol: number; endLine: number; endCol: number; text: string },
): string {
  const lines = input.split('\n');
  const before = lines.slice(0, edit.startLine).join('\n')
    + (edit.startLine > 0 ? '\n' : '')
    + lines[edit.startLine].substring(0, edit.startCol);
  const after = lines[edit.endLine].substring(edit.endCol)
    + (edit.endLine < lines.length - 1 ? '\n' : '')
    + lines.slice(edit.endLine + 1).join('\n');
  return before + edit.text + after;
}

function addBraces(input: string, cursorLine: number, indent = '  '): string | null {
  const lines = input.split('\n');
  const info = findBracelessControl(lines, cursorLine);
  if (!info) return null;
  const edit = computeAddBraces(lines, info, indent, '\n');
  return applyEdit(input, edit);
}

function removeBraces(input: string, cursorLine: number, indent = '  '): string | null {
  const lines = input.split('\n');
  const info = findBracedSingleStatementControl(lines, cursorLine);
  if (!info) return null;
  const edit = computeRemoveBraces(lines, info, indent, '\n');
  return applyEdit(input, edit);
}

// ── skipString ─────────────────────────────────────────────────────

describe('skipString', () => {
  it('should skip double-quoted string', () => {
    assert.equal(skipString('"hello" rest', 0), 6);
  });

  it('should skip single-quoted string', () => {
    assert.equal(skipString("'hello' rest", 0), 6);
  });

  it('should skip template literal', () => {
    assert.equal(skipString('`hello` rest', 0), 6);
  });

  it('should handle escaped quotes', () => {
    assert.equal(skipString('"he\\"llo"', 0), 8);
  });

  it('should handle unclosed string', () => {
    assert.equal(skipString('"hello', 0), 5);
  });
});

// ── nextNonWhitespace ──────────────────────────────────────────────

describe('nextNonWhitespace', () => {
  it('should find on same line', () => {
    assert.deepEqual(nextNonWhitespace(['  hello'], 0, 0), { line: 0, col: 2, ch: 'h' });
  });

  it('should find on next line', () => {
    assert.deepEqual(nextNonWhitespace(['   ', '  x'], 0, 0), { line: 1, col: 2, ch: 'x' });
  });

  it('should return null when nothing found', () => {
    assert.equal(nextNonWhitespace(['   ', '  '], 0, 0), null);
  });

  it('should start from given column', () => {
    assert.deepEqual(nextNonWhitespace(['ab cd'], 0, 3), { line: 0, col: 3, ch: 'c' });
  });
});

// ── findClosingParen ───────────────────────────────────────────────

describe('findClosingParen', () => {
  it('should find closing paren on same line', () => {
    assert.deepEqual(findClosingParen(['(a + b)'], 0, 0), { line: 0, col: 6 });
  });

  it('should handle nested parens', () => {
    assert.deepEqual(findClosingParen(['(a + (b * c))'], 0, 0), { line: 0, col: 12 });
  });

  it('should handle multi-line', () => {
    assert.deepEqual(findClosingParen(['(a &&', '  b)'], 0, 0), { line: 1, col: 3 });
  });

  it('should ignore parens inside strings', () => {
    assert.deepEqual(findClosingParen(['(")" + x)'], 0, 0), { line: 0, col: 8 });
  });

  it('should ignore parens in line comments', () => {
    assert.deepEqual(findClosingParen(['(a // )', '  )'], 0, 0), { line: 1, col: 2 });
  });

  it('should return null for unmatched', () => {
    assert.equal(findClosingParen(['(a + b'], 0, 0), null);
  });
});

// ── findClosingBrace ───────────────────────────────────────────────

describe('findClosingBrace', () => {
  it('should find closing brace on same line', () => {
    assert.deepEqual(findClosingBrace(['{ x }'], 0, 0), { line: 0, col: 4 });
  });

  it('should handle nested braces', () => {
    assert.deepEqual(findClosingBrace(['{', '  { inner }', '}'], 0, 0), { line: 2, col: 0 });
  });

  it('should ignore braces inside strings', () => {
    assert.deepEqual(findClosingBrace(['{ "}" }'], 0, 0), { line: 0, col: 6 });
  });
});

// ── findStatementEnd ───────────────────────────────────────────────

describe('findStatementEnd', () => {
  it('should find semicolon', () => {
    assert.deepEqual(findStatementEnd(['return value;'], 0, 0), { line: 0, col: 12 });
  });

  it('should find end of line without semicolons', () => {
    assert.deepEqual(findStatementEnd(['return value'], 0, 0), { line: 0, col: 11 });
  });

  it('should wait for closing parens before ending', () => {
    const lines = ['doSomething(', '  arg1,', '  arg2', ')'];
    assert.deepEqual(findStatementEnd(lines, 0, 0), { line: 3, col: 0 });
  });

  it('should handle method chaining across lines', () => {
    const lines = ['arr', '  .filter(x => x > 0)', '  .map(x => x * 2)'];
    assert.deepEqual(findStatementEnd(lines, 0, 0), { line: 2, col: 17 });
  });

  it('should handle optional chaining continuation', () => {
    const lines = ['obj', '  ?.prop', '  ?.method()'];
    assert.deepEqual(findStatementEnd(lines, 0, 0), { line: 2, col: 11 });
  });

  it('should stop before enclosing closing brace', () => {
    assert.deepEqual(findStatementEnd(['return value }'], 0, 0), { line: 0, col: 11 });
  });

  it('should handle semicolons inside parens', () => {
    assert.deepEqual(
      findStatementEnd(['for (let i = 0; i < n; i++) doSomething();'], 0, 28),
      { line: 0, col: 41 },
    );
  });

  it('should ignore semicolons inside strings', () => {
    assert.deepEqual(findStatementEnd(['"a;b";'], 0, 0), { line: 0, col: 5 });
  });

  it('should handle object literals without semicolons', () => {
    assert.deepEqual(
      findStatementEnd(['return { a: 1 }'], 0, 0),
      { line: 0, col: 14 },
    );
  });
});

// ── findBracelessControl ───────────────────────────────────────────

describe('findBracelessControl', () => {
  it('should detect if on same line with semicolons', () => {
    const result = findBracelessControl(['if (cond) return value;'], 0);
    assert.notEqual(result, null);
    assert.equal(result!.keywordLine, 0);
    assert.equal(result!.indent, '');
  });

  it('should detect if on same line without semicolons', () => {
    const result = findBracelessControl(['if (cond) return value'], 0);
    assert.notEqual(result, null);
    assert.equal(result!.keywordLine, 0);
  });

  it('should detect if with body on next line', () => {
    const result = findBracelessControl(['if (cond)', '  return value'], 1);
    assert.notEqual(result, null);
    assert.equal(result!.keywordLine, 0);
  });

  it('should detect cursor on keyword line with body on next line', () => {
    const result = findBracelessControl(['if (cond)', '  return value'], 0);
    assert.notEqual(result, null);
  });

  it('should detect else', () => {
    const result = findBracelessControl(['else return value'], 0);
    assert.notEqual(result, null);
    assert.equal(result!.keywordLine, 0);
  });

  it('should detect else if', () => {
    const result = findBracelessControl(['else if (cond) return value'], 0);
    assert.notEqual(result, null);
  });

  it('should detect } else', () => {
    const result = findBracelessControl(['} else return value'], 0);
    assert.notEqual(result, null);
  });

  it('should detect for', () => {
    const result = findBracelessControl(['for (const x of arr) doSomething(x)'], 0);
    assert.notEqual(result, null);
  });

  it('should detect while', () => {
    const result = findBracelessControl(['while (cond) doSomething()'], 0);
    assert.notEqual(result, null);
  });

  it('should return null when braces are present', () => {
    assert.equal(findBracelessControl(['if (cond) { return value }'], 0), null);
  });

  it('should return null when cursor is outside range', () => {
    assert.equal(findBracelessControl(['if (cond) return value', 'other()'], 1), null);
  });

  it('should handle multi-line condition', () => {
    const lines = ['if (', '  cond1 &&', '  cond2', ')', '  stmt'];
    const result = findBracelessControl(lines, 4);
    assert.notEqual(result, null);
    assert.equal(result!.keywordLine, 0);
  });

  it('should capture correct indent', () => {
    const result = findBracelessControl(['    if (cond) return value'], 0);
    assert.equal(result!.indent, '    ');
  });
});

// ── findBracedSingleStatementControl ───────────────────────────────

describe('findBracedSingleStatementControl', () => {
  it('should detect single-statement block with semicolons', () => {
    const lines = ['if (cond) {', '  return value;', '}'];
    const result = findBracedSingleStatementControl(lines, 1);
    assert.notEqual(result, null);
    assert.equal(result!.stmtText, 'return value;');
  });

  it('should detect single-statement block without semicolons', () => {
    const lines = ['if (cond) {', '  return value', '}'];
    const result = findBracedSingleStatementControl(lines, 1);
    assert.notEqual(result, null);
    assert.equal(result!.stmtText, 'return value');
  });

  it('should detect single-line braced block', () => {
    const result = findBracedSingleStatementControl(['if (cond) { return value; }'], 0);
    assert.notEqual(result, null);
  });

  it('should detect from keyword line', () => {
    const lines = ['if (cond) {', '  return value', '}'];
    assert.notEqual(findBracedSingleStatementControl(lines, 0), null);
  });

  it('should detect from closing brace line', () => {
    const lines = ['if (cond) {', '  return value', '}'];
    assert.notEqual(findBracedSingleStatementControl(lines, 2), null);
  });

  it('should return null for multi-statement blocks', () => {
    const lines = ['if (cond) {', '  stmt1', '  stmt2', '}'];
    assert.equal(findBracedSingleStatementControl(lines, 1), null);
  });

  it('should return null when followed by else', () => {
    const lines = ['if (cond) {', '  return value', '} else {', '  other', '}'];
    assert.equal(findBracedSingleStatementControl(lines, 1), null);
  });

  it('should detect else block not followed by else', () => {
    const lines = ['} else {', '  return value', '}'];
    const result = findBracedSingleStatementControl(lines, 1);
    assert.notEqual(result, null);
  });

  it('should return null for empty blocks', () => {
    assert.equal(findBracedSingleStatementControl(['if (cond) {}'], 0), null);
  });
});

// ── Add braces (end-to-end) ────────────────────────────────────────

describe('addBraces', () => {
  it('should add braces to single-line if with semicolons', () => {
    assert.equal(
      addBraces('if (cond) return value;', 0),
      'if (cond) {\n  return value;\n}',
    );
  });

  it('should add braces to single-line if without semicolons', () => {
    assert.equal(
      addBraces('if (cond) return value', 0),
      'if (cond) {\n  return value\n}',
    );
  });

  it('should add braces to multi-line if', () => {
    assert.equal(
      addBraces('if (cond)\n  return value', 1),
      'if (cond) {\n  return value\n}',
    );
  });

  it('should add braces to else', () => {
    assert.equal(
      addBraces('else return value', 0),
      'else {\n  return value\n}',
    );
  });

  it('should add braces to } else', () => {
    assert.equal(
      addBraces('} else return value', 0),
      '} else {\n  return value\n}',
    );
  });

  it('should add braces to else if', () => {
    assert.equal(
      addBraces('else if (cond) return value', 0),
      'else if (cond) {\n  return value\n}',
    );
  });

  it('should add braces to for', () => {
    assert.equal(
      addBraces('for (const x of arr) doSomething(x)', 0),
      'for (const x of arr) {\n  doSomething(x)\n}',
    );
  });

  it('should add braces to while', () => {
    assert.equal(
      addBraces('while (cond) doSomething()', 0),
      'while (cond) {\n  doSomething()\n}',
    );
  });

  it('should preserve indentation', () => {
    assert.equal(
      addBraces('  if (cond) return value', 0),
      '  if (cond) {\n    return value\n  }',
    );
  });

  it('should use custom indent unit', () => {
    assert.equal(
      addBraces('if (cond) return value', 0, '    '),
      'if (cond) {\n    return value\n}',
    );
  });

  it('should use tabs', () => {
    assert.equal(
      addBraces('if (cond) return value', 0, '\t'),
      'if (cond) {\n\treturn value\n}',
    );
  });

  it('should handle function call without semicolons', () => {
    assert.equal(
      addBraces('if (cond) doSomething()', 0),
      'if (cond) {\n  doSomething()\n}',
    );
  });

  it('should handle multi-line function call', () => {
    const input = 'if (cond)\n  doSomething(\n    arg1,\n    arg2\n  )';
    const expected = 'if (cond) {\n  doSomething(\n    arg1,\n    arg2\n  )\n}';
    assert.equal(addBraces(input, 1), expected);
  });

  it('should handle method chaining body', () => {
    const input = 'if (cond)\n  arr\n    .filter(x => x > 0)\n    .map(x => x * 2)';
    const expected = 'if (cond) {\n  arr\n    .filter(x => x > 0)\n    .map(x => x * 2)\n}';
    assert.equal(addBraces(input, 1), expected);
  });

  it('should return null when braces already present', () => {
    assert.equal(addBraces('if (cond) { return value }', 0), null);
  });

  it('should not affect surrounding code', () => {
    const input = 'before()\nif (cond) return value\nafter()';
    const expected = 'before()\nif (cond) {\n  return value\n}\nafter()';
    assert.equal(addBraces(input, 1), expected);
  });
});

// ── Remove braces (end-to-end) ─────────────────────────────────────

describe('removeBraces', () => {
  it('should remove braces from multi-line block with semicolons', () => {
    assert.equal(
      removeBraces('if (cond) {\n  return value;\n}', 1),
      'if (cond)\n  return value;',
    );
  });

  it('should remove braces from multi-line block without semicolons', () => {
    assert.equal(
      removeBraces('if (cond) {\n  return value\n}', 1),
      'if (cond)\n  return value',
    );
  });

  it('should remove braces from single-line block', () => {
    assert.equal(
      removeBraces('if (cond) { return value; }', 0),
      'if (cond)\n  return value;',
    );
  });

  it('should preserve indentation', () => {
    assert.equal(
      removeBraces('  if (cond) {\n    return value\n  }', 1),
      '  if (cond)\n    return value',
    );
  });

  it('should use custom indent unit', () => {
    assert.equal(
      removeBraces('if (cond) {\n    return value\n}', 1, '    '),
      'if (cond)\n    return value',
    );
  });

  it('should return null for multi-statement blocks', () => {
    assert.equal(
      removeBraces('if (cond) {\n  stmt1\n  stmt2\n}', 1),
      null,
    );
  });

  it('should return null when followed by else', () => {
    assert.equal(
      removeBraces('if (cond) {\n  return value\n} else {\n  other\n}', 1),
      null,
    );
  });

  it('should not affect surrounding code', () => {
    const input = 'before()\nif (cond) {\n  return value\n}\nafter()';
    const expected = 'before()\nif (cond)\n  return value\nafter()';
    assert.equal(removeBraces(input, 2), expected);
  });
});
