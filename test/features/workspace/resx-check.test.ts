import { strict as assert } from 'assert'
import {
  detectFormat,
  diffResx,
  isDesignerResx,
  parseResx,
  parseResxName,
  planInsertions,
  renderEmptyEntry,
  reorderToNeutral,
  sameResxGroup,
  stringEntries
} from '../../../src/features/workspace/resx-check-utils'

const NEUTRAL = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Title" xml:space="preserve"><value>Horas mensuales</value></data>
  <data name="Filter" xml:space="preserve"><value>Filtrar</value></data>
  <data name="Pagination" xml:space="preserve"><value>{0} - {1} de {2:N0}</value></data>
</root>`

describe('parseResx', () => {
  it('should parse compact one-line entries with their values', () => {
    const entries = parseResx(NEUTRAL)
    assert.deepEqual(
      entries.map(e => [e.name, e.value]),
      [
        ['Title', 'Horas mensuales'],
        ['Filter', 'Filtrar'],
        ['Pagination', '{0} - {1} de {2:N0}']
      ]
    )
  })

  it('should parse multi-line standard entries spanning several lines', () => {
    const text = `<root>
  <data name="Greeting" xml:space="preserve">
    <value>Hello</value>
    <comment>shown on login</comment>
  </data>
</root>`
    const entries = parseResx(text)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'Greeting')
    assert.equal(entries[0].value, 'Hello')
    assert.equal(entries[0].startLine, 1)
    assert.equal(entries[0].endLine, 4)
  })

  it('should flag designer entries carrying a type or mimetype', () => {
    const text = `<root>
  <data name="$this.Icon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>AAA=</value>
  </data>
  <data name="Label1.Text" xml:space="preserve"><value>Name</value></data>
</root>`
    const entries = parseResx(text)
    assert.equal(entries[0].designer, true)
    assert.equal(entries[1].designer, false)
    assert.deepEqual(
      stringEntries(entries).map(e => e.name),
      ['Label1.Text']
    )
  })
})

describe('isDesignerResx', () => {
  it('should treat a plain string resx as not designer', () => {
    assert.equal(isDesignerResx(NEUTRAL), false)
  })

  it('should treat a resx with a metadata block as designer', () => {
    const text = `<root>
  <metadata name="x" type="System.Windows.Forms.X"><value>17, 17</value></metadata>
  <data name="Label1.Text" xml:space="preserve"><value>Name</value></data>
</root>`
    assert.equal(isDesignerResx(text), true)
  })
})

describe('parseResxName', () => {
  it('should treat a name with no locale segment as neutral', () => {
    assert.deepEqual(parseResxName('List.resx'), { base: 'List', locale: null })
  })

  it('should extract a two-letter locale', () => {
    assert.deepEqual(parseResxName('List.en.resx'), { base: 'List', locale: 'en' })
  })

  it('should extract a region-qualified locale and keep dotted bases', () => {
    assert.deepEqual(parseResxName('A.B.es-ES.resx'), { base: 'A.B', locale: 'es-ES' })
  })

  it('should not mistake a capitalized name segment for a locale', () => {
    assert.deepEqual(parseResxName('UserViewModelValidations.resx'), {
      base: 'UserViewModelValidations',
      locale: null
    })
  })

  it('should return null for non-resx files', () => {
    assert.equal(parseResxName('List.txt'), null)
  })
})

describe('sameResxGroup', () => {
  it('should group a neutral file with its locale satellites', () => {
    assert.equal(sameResxGroup('List.resx', 'List.en.resx'), true)
    assert.equal(sameResxGroup('List.en.resx', 'List.ca.resx'), true)
  })

  it('should not group different bases', () => {
    assert.equal(sameResxGroup('List.resx', 'Detail.resx'), false)
  })
})

describe('diffResx', () => {
  it('should report keys missing from the locale file', () => {
    const locale = `<root>
  <data name="Title" xml:space="preserve"><value>Monthly hours</value></data>
</root>`
    assert.deepEqual(diffResx(NEUTRAL, locale).missing, ['Filter', 'Pagination'])
  })

  it('should report orphan keys not declared in the neutral file', () => {
    const locale = `<root>
  <data name="Title" xml:space="preserve"><value>x</value></data>
  <data name="Filter" xml:space="preserve"><value>x</value></data>
  <data name="Pagination" xml:space="preserve"><value>{0}{1}{2}</value></data>
  <data name="Extra" xml:space="preserve"><value>x</value></data>
</root>`
    assert.deepEqual(diffResx(NEUTRAL, locale).orphan, ['Extra'])
  })

  it('should report when the shared keys are in a different order', () => {
    const locale = `<root>
  <data name="Filter" xml:space="preserve"><value>x</value></data>
  <data name="Title" xml:space="preserve"><value>x</value></data>
  <data name="Pagination" xml:space="preserve"><value>{0}{1}{2}</value></data>
</root>`
    assert.equal(diffResx(NEUTRAL, locale).orderDiffers, true)
  })

  it('should report duplicate keys in the locale file', () => {
    const locale = `<root>
  <data name="Title" xml:space="preserve"><value>x</value></data>
  <data name="Title" xml:space="preserve"><value>y</value></data>
  <data name="Filter" xml:space="preserve"><value>x</value></data>
  <data name="Pagination" xml:space="preserve"><value>{0}{1}{2}</value></data>
</root>`
    assert.deepEqual(diffResx(NEUTRAL, locale).duplicates, ['Title'])
  })

  it('should report placeholder mismatches against the neutral value', () => {
    const locale = `<root>
  <data name="Title" xml:space="preserve"><value>x</value></data>
  <data name="Filter" xml:space="preserve"><value>x</value></data>
  <data name="Pagination" xml:space="preserve"><value>{0} of {1}</value></data>
</root>`
    assert.deepEqual(diffResx(NEUTRAL, locale).placeholderMismatch, ['Pagination'])
  })

  it('should report nothing when the locale is in sync', () => {
    const diff = diffResx(NEUTRAL, NEUTRAL)
    assert.deepEqual(diff, {
      missing: [],
      orphan: [],
      duplicates: [],
      orderDiffers: false,
      placeholderMismatch: []
    })
  })
})

describe('detectFormat', () => {
  it('should detect the compact one-line style and its indentation', () => {
    const format = detectFormat(NEUTRAL)
    assert.equal(format.oneLine, true)
    assert.equal(format.indent, '  ')
  })
})

describe('renderEmptyEntry', () => {
  it('should render an empty compact entry', () => {
    assert.equal(
      renderEmptyEntry('Sended', { indent: '  ', oneLine: true }),
      '  <data name="Sended" xml:space="preserve"><value></value></data>'
    )
  })

  it('should escape special characters in the key name', () => {
    assert.equal(
      renderEmptyEntry('A&B', { indent: '  ', oneLine: true }),
      '  <data name="A&amp;B" xml:space="preserve"><value></value></data>'
    )
  })
})

describe('planInsertions', () => {
  const neutralKeys = ['Title', 'Filter', 'Pagination']

  it('should insert a missing key before its neutral successor', () => {
    const locale = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Title" xml:space="preserve"><value>x</value></data>
  <data name="Pagination" xml:space="preserve"><value>x</value></data>
</root>`
    const plan = planInsertions(locale, neutralKeys, ['Filter'])
    assert.equal(plan.length, 1)
    // "Pagination" sits on line 3 (0-based); Filter goes before it.
    assert.equal(plan[0].atLine, 3)
    assert.equal(plan[0].text, '  <data name="Filter" xml:space="preserve"><value></value></data>')
  })

  it('should append before </root> when no later anchor exists', () => {
    const locale = `<root>
  <data name="Title" xml:space="preserve"><value>x</value></data>
</root>`
    const plan = planInsertions(locale, neutralKeys, ['Pagination'])
    assert.equal(plan.length, 1)
    assert.equal(plan[0].atLine, 2)
  })
})

describe('reorderToNeutral', () => {
  it('should reorder locale entries to match the neutral key order', () => {
    const neutralKeys = ['Title', 'Filter', 'Pagination']
    const locale = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Filter" xml:space="preserve"><value>Filtrar</value></data>
  <data name="Pagination" xml:space="preserve"><value>p</value></data>
  <data name="Title" xml:space="preserve"><value>Titulo</value></data>
</root>`
    const result = reorderToNeutral(locale, neutralKeys)
    assert.deepEqual(
      parseResx(result).map(e => e.name),
      ['Title', 'Filter', 'Pagination']
    )
    // Values travel with their entry, verbatim.
    assert.equal(parseResx(result).find(e => e.name === 'Title')!.value, 'Titulo')
  })

  it('should keep locale-only keys after the neutral ones', () => {
    const neutralKeys = ['Title', 'Filter']
    const locale = `<root>
  <data name="Extra" xml:space="preserve"><value>e</value></data>
  <data name="Filter" xml:space="preserve"><value>f</value></data>
  <data name="Title" xml:space="preserve"><value>t</value></data>
</root>`
    assert.deepEqual(
      parseResx(reorderToNeutral(locale, neutralKeys)).map(e => e.name),
      ['Title', 'Filter', 'Extra']
    )
  })
})
