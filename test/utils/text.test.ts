import { strict as assert } from 'assert'
import {
  splitWords,
  toCamelCase,
  toSnakeCase,
  toPascalCase,
  toConstantCase,
  toKebabCase,
  toTitleCase,
  toLowerCase,
  toUpperCase,
  toDotCase,
  toPathCase,
  toSentenceCase,
  toSwapCase,
  toNoCase,
  toSlug,
} from '../../src/utils/text'

describe('splitWords', () => {
  it('should split on camelCase boundaries', () => {
    assert.deepEqual(splitWords('helloWorld'), ['hello', 'World'])
  })

  it('should keep consecutive uppercase as a single word when followed by lowercase', () => {
    assert.deepEqual(splitWords('HTMLParser'), ['HTML', 'Parser'])
  })

  it('should split on underscores', () => {
    assert.deepEqual(splitWords('hello_world'), ['hello', 'world'])
  })

  it('should split on hyphens', () => {
    assert.deepEqual(splitWords('hello-world'), ['hello', 'world'])
  })

  it('should split on dots', () => {
    assert.deepEqual(splitWords('hello.world'), ['hello', 'world'])
  })

  it('should split on spaces', () => {
    assert.deepEqual(splitWords('hello world'), ['hello', 'world'])
  })

  it('should split on mixed delimiters', () => {
    assert.deepEqual(splitWords('hello_world-foo.bar'), ['hello', 'world', 'foo', 'bar'])
  })

  it('should return a single element when input has no boundaries', () => {
    assert.deepEqual(splitWords('hello'), ['hello'])
  })

  it('should treat all-uppercase as a single word', () => {
    assert.deepEqual(splitWords('HELLO'), ['HELLO'])
  })

  it('should return an empty array when input is empty', () => {
    assert.deepEqual(splitWords(''), [])
  })

  it('should keep digits attached to the preceding word', () => {
    assert.deepEqual(splitWords('item2Count'), ['item2', 'Count'])
  })
})

describe('case converters', () => {
  it('should convert to camelCase', () => {
    assert.equal(toCamelCase('hello world'), 'helloWorld')
    assert.equal(toCamelCase('HELLO_WORLD'), 'helloWorld')
    assert.equal(toCamelCase('PascalCase'), 'pascalCase')
  })

  it('should convert to snake_case', () => {
    assert.equal(toSnakeCase('helloWorld'), 'hello_world')
    assert.equal(toSnakeCase('Hello World'), 'hello_world')
  })

  it('should convert to PascalCase', () => {
    assert.equal(toPascalCase('hello world'), 'HelloWorld')
    assert.equal(toPascalCase('hello_world'), 'HelloWorld')
  })

  it('should convert to CONSTANT_CASE', () => {
    assert.equal(toConstantCase('helloWorld'), 'HELLO_WORLD')
    assert.equal(toConstantCase('hello world'), 'HELLO_WORLD')
  })

  it('should convert to kebab-case', () => {
    assert.equal(toKebabCase('helloWorld'), 'hello-world')
    assert.equal(toKebabCase('Hello World'), 'hello-world')
  })

  it('should convert to Title Case', () => {
    assert.equal(toTitleCase('helloWorld'), 'Hello World')
    assert.equal(toTitleCase('hello_world'), 'Hello World')
  })

  it('should convert to lowercase', () => {
    assert.equal(toLowerCase('Hello World'), 'hello world')
  })

  it('should convert to UPPERCASE', () => {
    assert.equal(toUpperCase('Hello World'), 'HELLO WORLD')
  })

  it('should convert to dot.case', () => {
    assert.equal(toDotCase('helloWorld'), 'hello.world')
  })

  it('should convert to path/case', () => {
    assert.equal(toPathCase('helloWorld'), 'hello/world')
  })

  it('should convert to Sentence case', () => {
    assert.equal(toSentenceCase('helloWorld'), 'Hello world')
    assert.equal(toSentenceCase('HELLO_WORLD'), 'Hello world')
  })

  it('should swap case for each character', () => {
    assert.equal(toSwapCase('Hello'), 'hELLO')
    assert.equal(toSwapCase('hELLO wORLD'), 'Hello World')
  })

  it('should convert to no case', () => {
    assert.equal(toNoCase('helloWorld'), 'hello world')
    assert.equal(toNoCase('HELLO_WORLD'), 'hello world')
  })
})

describe('toSlug', () => {
  it('should generate a basic slug from spaced text', () => {
    assert.equal(toSlug('Hello World'), 'hello-world')
  })

  it('should strip diacritics', () => {
    assert.equal(toSlug('Café Résumé'), 'cafe-resume')
  })

  it('should replace special characters using the char map', () => {
    assert.equal(toSlug('Rock & Roll'), 'rock-and-roll')
    assert.equal(toSlug('user@home'), 'user-at-home')
  })

  it('should split camelCase words when decamelize is enabled', () => {
    assert.equal(toSlug('myVariableName'), 'my-variable-name')
  })

  it('should collapse consecutive special characters into a single separator', () => {
    assert.equal(toSlug('hello!!!world'), 'hello-world')
  })

  it('should trim leading and trailing separators', () => {
    assert.equal(toSlug('  hello world  '), 'hello-world')
    assert.equal(toSlug('---hello---'), 'hello')
  })

  it('should handle spanish characters', () => {
    assert.equal(toSlug('Ñoño más allá'), 'nono-mas-alla')
  })

  it('should use custom separator when provided', () => {
    assert.equal(toSlug('Hello World', { separator: '_' }), 'hello_world')
  })

  it('should preserve case when lowercase is false', () => {
    assert.equal(toSlug('Hello World', { lowercase: false }), 'Hello-World')
  })

  it('should keep camelCase intact when decamelize is false', () => {
    assert.equal(toSlug('myVariable', { decamelize: false }), 'myvariable')
  })
})
