import { strict as assert } from 'assert'
import {
  findClassAtOffset,
  findMatchingBrace,
  findProperties
} from '../../../../src/features/codegen/csharp/csharp-code-actions-utils'

const TWO_CLASSES = `namespace Demo;

public class Address
{
    public string Street { get; set; }
    public string City { get; set; }
}

public class Person
{
    public string Name { get; set; }
}
`

describe('findMatchingBrace', () => {
  it('should find the matching brace of a flat block', () => {
    const text = 'a { b } c'
    assert.equal(findMatchingBrace(text, 2), 6)
  })

  it('should skip nested blocks', () => {
    const text = '{ { } { { } } }'
    assert.equal(findMatchingBrace(text, 0), 14)
  })

  it('should return -1 for an unbalanced block', () => {
    assert.equal(findMatchingBrace('{ { }', 0), -1)
  })
})

describe('findClassAtOffset', () => {
  it('should return the class whose body contains the offset', () => {
    const offsetInAddress = TWO_CLASSES.indexOf('Street')
    const cls = findClassAtOffset(TWO_CLASSES, offsetInAddress)
    assert.ok(cls)
    assert.equal(cls!.name, 'Address')
  })

  it('should return the second class when the offset is inside it', () => {
    const offsetInPerson = TWO_CLASSES.indexOf('Name')
    const cls = findClassAtOffset(TWO_CLASSES, offsetInPerson)
    assert.ok(cls)
    assert.equal(cls!.name, 'Person')
  })

  it('should return null when the offset is between two classes', () => {
    const betweenClasses = TWO_CLASSES.indexOf('public class Person') - 1
    assert.equal(findClassAtOffset(TWO_CLASSES, betweenClasses), null)
  })

  it('should return null when the offset is before any class', () => {
    assert.equal(findClassAtOffset(TWO_CLASSES, 0), null)
  })

  it('should return the innermost class for nested classes', () => {
    const text = `public class Outer
{
    public string A { get; set; }

    public class Inner
    {
        public string B { get; set; }
    }
}
`
    const cls = findClassAtOffset(text, text.indexOf('B {'))
    assert.ok(cls)
    assert.equal(cls!.name, 'Inner')
  })

  it('should expose the body range delimited by braces', () => {
    const cls = findClassAtOffset(TWO_CLASSES, TWO_CLASSES.indexOf('Street'))
    assert.ok(cls)
    assert.equal(TWO_CLASSES[cls!.bodyStart], '{')
    assert.equal(TWO_CLASSES[cls!.bodyEnd], '}')
    assert.ok(cls!.bodyEnd > cls!.bodyStart)
  })
})

describe('findProperties', () => {
  it('should find all auto-properties in the full text', () => {
    const props = findProperties(TWO_CLASSES)
    assert.deepEqual(
      props.map(p => p.name),
      ['Street', 'City', 'Name']
    )
  })

  it('should only find properties inside the given range', () => {
    const cls = findClassAtOffset(TWO_CLASSES, TWO_CLASSES.indexOf('Street'))!
    const props = findProperties(TWO_CLASSES, cls.bodyStart, cls.bodyEnd)
    assert.deepEqual(
      props.map(p => p.name),
      ['Street', 'City']
    )
  })

  it('should not include properties of an earlier class when scoped to the second one', () => {
    const cls = findClassAtOffset(TWO_CLASSES, TWO_CLASSES.indexOf('Name'))!
    const props = findProperties(TWO_CLASSES, cls.bodyStart, cls.bodyEnd)
    assert.deepEqual(
      props.map(p => p.name),
      ['Name']
    )
  })

  it('should report end offsets relative to the full document when scoped', () => {
    const cls = findClassAtOffset(TWO_CLASSES, TWO_CLASSES.indexOf('Name'))!
    const props = findProperties(TWO_CLASSES, cls.bodyStart, cls.bodyEnd)
    const declEnd = TWO_CLASSES.indexOf('public string Name { get; set; }') + 'public string Name { get; set; }'.length
    assert.equal(props[0].end, declEnd)
  })

  it('should parse generic, nullable, and init-only properties', () => {
    const text = `public class Box
{
    public List<int> Items { get; set; }
    public string? Label { get; init; }
    public required int[] Sizes { get; set; }
}
`
    const props = findProperties(text)
    assert.deepEqual(
      props.map(p => `${p.type} ${p.name}`),
      ['List<int> Items', 'string? Label', 'int[] Sizes']
    )
  })
})
