import { strict as assert } from 'assert';
import {
  buildUsings,
  toFileScopedNamespace,
  findCursorPosition,
  buildTemplate,
} from '../../src/features/csharp/csharp-template';
import { BuildTemplateOptions } from '../../src/features/csharp/csharp-types';
import * as path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

describe('buildUsings', () => {
  function opts(overrides: Partial<BuildTemplateOptions> = {}): BuildTemplateOptions {
    return {
      extensionPath: '',
      templateFile: '',
      className: '',
      namespace: '',
      requiredUsings: [],
      optionalUsings: [],
      useFileScopedNamespace: false,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
      ...overrides,
    };
  }

  it('should return empty string when no usings', () => {
    assert.equal(buildUsings(opts()), '');
  });

  it('should format required usings', () => {
    const result = buildUsings(opts({ requiredUsings: ['Xunit'] }));
    assert.equal(result, 'using Xunit;\n\n');
  });

  it('should combine required and optional usings', () => {
    const result = buildUsings(opts({
      requiredUsings: ['Microsoft.AspNetCore.Mvc'],
      optionalUsings: ['System'],
    }));
    assert.equal(result, 'using System;\nusing Microsoft.AspNetCore.Mvc;\n\n');
  });

  it('should sort System namespaces first', () => {
    const result = buildUsings(opts({
      requiredUsings: ['Xunit', 'System.Linq', 'System'],
    }));
    assert.equal(result, 'using System;\nusing System.Linq;\nusing Xunit;\n\n');
  });

  it('should filter out implicit usings', () => {
    const result = buildUsings(opts({
      requiredUsings: ['System', 'Xunit'],
      implicitUsings: ['System'],
    }));
    assert.equal(result, 'using Xunit;\n\n');
  });

  it('should filter out removed usings', () => {
    const result = buildUsings(opts({
      requiredUsings: ['System', 'System.Linq'],
      usingsRemove: ['System.Linq'],
    }));
    assert.equal(result, 'using System;\n\n');
  });

  it('should deduplicate usings', () => {
    const result = buildUsings(opts({
      requiredUsings: ['System', 'Xunit'],
      optionalUsings: ['System'],
    }));
    assert.equal(result, 'using System;\nusing Xunit;\n\n');
  });

  it('should return empty when all usings are implicit', () => {
    const result = buildUsings(opts({
      requiredUsings: ['System'],
      implicitUsings: ['System'],
    }));
    assert.equal(result, '');
  });
});

describe('toFileScopedNamespace', () => {
  it('should convert traditional namespace to file-scoped', () => {
    const input = [
      'using System;',
      '',
      'namespace MyApp',
      '{',
      '    public class Foo',
      '    {',
      '    }',
      '}',
    ].join('\n');
    const expected = [
      'using System;',
      '',
      'namespace MyApp;',
      '',
      'public class Foo',
      '{',
      '}',
    ].join('\n');
    assert.equal(toFileScopedNamespace(input, 4), expected);
  });

  it('should handle content without namespace (no-op)', () => {
    const input = '<h3>Hello</h3>';
    assert.equal(toFileScopedNamespace(input, 4), input);
  });

  it('should preserve content already using file-scoped namespace', () => {
    const input = 'namespace MyApp;\n\npublic class Foo { }';
    assert.equal(toFileScopedNamespace(input, 4), input);
  });

  it('should handle nested braces inside class body', () => {
    const input = [
      'namespace MyApp',
      '{',
      '    public class Foo',
      '    {',
      '        public void Bar()',
      '        {',
      '        }',
      '    }',
      '}',
    ].join('\n');
    const expected = [
      'namespace MyApp;',
      '',
      'public class Foo',
      '{',
      '    public void Bar()',
      '    {',
      '    }',
      '}',
    ].join('\n');
    assert.equal(toFileScopedNamespace(input, 4), expected);
  });

  it('should work with 2-space indentation', () => {
    const input = [
      'namespace MyApp',
      '{',
      '  public class Foo',
      '  {',
      '  }',
      '}',
    ].join('\n');
    const expected = [
      'namespace MyApp;',
      '',
      'public class Foo',
      '{',
      '}',
    ].join('\n');
    assert.equal(toFileScopedNamespace(input, 2), expected);
  });
});

describe('findCursorPosition', () => {
  it('should find cursor on first line', () => {
    assert.deepEqual(findCursorPosition('${cursor}'), [0, 0]);
  });

  it('should find cursor with preceding text on same line', () => {
    assert.deepEqual(findCursorPosition('hello ${cursor}'), [0, 6]);
  });

  it('should find cursor on a later line', () => {
    const content = 'line1\nline2\n    ${cursor}';
    assert.deepEqual(findCursorPosition(content), [2, 4]);
  });

  it('should return null when no cursor placeholder', () => {
    assert.equal(findCursorPosition('no cursor here'), null);
  });

  it('should handle empty lines before cursor', () => {
    const content = '\n\n${cursor}';
    assert.deepEqual(findCursorPosition(content), [2, 0]);
  });
});

describe('buildTemplate', () => {
  it('should build a class template with file-scoped namespace', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'class.tmpl',
      className: 'MyService',
      namespace: 'MyApp.Services',
      requiredUsings: [],
      optionalUsings: ['System'],
      useFileScopedNamespace: true,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('namespace MyApp.Services;'));
    assert.ok(result.content.includes('public class MyService'));
    assert.ok(result.content.includes('using System;'));
    assert.ok(!result.content.includes('${'));
    assert.ok(result.cursorPosition !== null);
  });

  it('should build a class template with traditional namespace', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'class.tmpl',
      className: 'MyService',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: [],
      useFileScopedNamespace: false,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('namespace MyApp\n{'));
    assert.ok(result.content.includes('    public class MyService'));
  });

  it('should build an enum template without usings', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'enum.tmpl',
      className: 'Status',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: ['System'],
      useFileScopedNamespace: true,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('public enum Status'));
    assert.ok(!result.content.includes('using System'));
  });

  it('should build a blazor component template', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'blazor-component.razor.tmpl',
      className: 'Counter',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: [],
      useFileScopedNamespace: false,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('<h3>Counter</h3>'));
    assert.ok(result.content.includes('@code {'));
  });

  it('should filter implicit usings from output', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'class.tmpl',
      className: 'Foo',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: ['System', 'System.Linq'],
      useFileScopedNamespace: true,
      implicitUsings: ['System', 'System.Linq'],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(!result.content.includes('using '));
  });

  it('should apply CRLF line endings', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'class.tmpl',
      className: 'Foo',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: [],
      useFileScopedNamespace: true,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\r\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('\r\n'));
    assert.ok(!result.content.includes('\n\n'));
  });

  it('should build a resx template', () => {
    const result = buildTemplate({
      extensionPath: EXTENSION_PATH,
      templateFile: 'resx.tmpl',
      className: 'Resources',
      namespace: 'MyApp',
      requiredUsings: [],
      optionalUsings: [],
      useFileScopedNamespace: false,
      implicitUsings: [],
      usingsRemove: [],
      eol: '\n',
      tabSize: 4,
    });
    assert.ok(result.content.includes('<?xml version="1.0"'));
    assert.ok(result.content.includes('<root>'));
    assert.ok(!result.content.includes('${'));
  });
});
