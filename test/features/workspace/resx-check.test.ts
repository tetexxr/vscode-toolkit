import { strict as assert } from 'assert'
import {
  detectFormat,
  diffResx,
  escapeXmlText,
  findEntryLineRange,
  findValueOffsets,
  isDesignerResx,
  normalizeResx,
  parseResx,
  parseResxName,
  planInsertions,
  renameKeyInText,
  renderEmptyEntry,
  reorderToNeutral,
  stringEntries,
  unescapeXml
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

describe('escapeXmlText / unescapeXml', () => {
  it('should escape the XML-significant characters in a value', () => {
    assert.equal(escapeXmlText('a < b & c > d'), 'a &lt; b &amp; c &gt; d')
  })

  it('should round-trip through unescape', () => {
    const original = 'Tom & Jerry < "x" >'
    assert.equal(unescapeXml(escapeXmlText(original)), original)
  })
})

describe('findValueOffsets', () => {
  it('should locate the inner value text of a compact entry', () => {
    const offsets = findValueOffsets(NEUTRAL, 'Filter')!
    assert.equal(NEUTRAL.slice(offsets.start, offsets.end), 'Filtrar')
  })

  it('should not confuse a key with a longer key sharing its prefix', () => {
    const text = `<root>
  <data name="Title" xml:space="preserve"><value>short</value></data>
  <data name="TitleLong" xml:space="preserve"><value>longer</value></data>
</root>`
    const offsets = findValueOffsets(text, 'Title')!
    assert.equal(text.slice(offsets.start, offsets.end), 'short')
  })

  it('should return null for an absent key', () => {
    assert.equal(findValueOffsets(NEUTRAL, 'Nope'), null)
  })
})

describe('findEntryLineRange', () => {
  it('should return the line span of a one-line entry', () => {
    assert.deepEqual(findEntryLineRange(NEUTRAL, 'Filter'), { startLine: 3, endLine: 3 })
  })

  it('should span a multi-line entry', () => {
    const text = `<root>
  <data name="A" xml:space="preserve">
    <value>x</value>
  </data>
</root>`
    assert.deepEqual(findEntryLineRange(text, 'A'), { startLine: 1, endLine: 3 })
  })

  it('should return null for an absent key', () => {
    assert.equal(findEntryLineRange(NEUTRAL, 'Nope'), null)
  })
})

describe('renameKeyInText', () => {
  it('should rename a key, keeping its value untouched', () => {
    const renamed = renameKeyInText(NEUTRAL, 'Filter', 'FilterBy')
    const entries = parseResx(renamed)
    assert.ok(entries.some(e => e.name === 'FilterBy'))
    assert.ok(!entries.some(e => e.name === 'Filter'))
    assert.equal(entries.find(e => e.name === 'FilterBy')!.value, 'Filtrar')
  })

  it('should not touch a longer key that contains the old name', () => {
    const text = `<root>
  <data name="Filter" xml:space="preserve"><value>a</value></data>
  <data name="FilterBy" xml:space="preserve"><value>b</value></data>
</root>`
    const renamed = renameKeyInText(text, 'Filter', 'Search')
    const names = parseResx(renamed).map(e => e.name)
    assert.deepEqual(names, ['Search', 'FilterBy'])
  })

  it('should escape special characters in the new key', () => {
    const renamed = renameKeyInText(NEUTRAL, 'Filter', 'A&B')
    assert.ok(parseResx(renamed).some(e => e.name === 'A&amp;B'))
  })
})

describe('normalizeResx', () => {
  it('should leave an already-canonical file unchanged', () => {
    assert.equal(normalizeResx(NEUTRAL), NEUTRAL)
  })

  it('should collapse a multi-line entry into the compact one-line form', () => {
    const text = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="A" xml:space="preserve">
        <value>hello</value>
  </data>
</root>`
    const normalized = normalizeResx(text)
    assert.ok(normalized.includes('  <data name="A" xml:space="preserve"><value>hello</value></data>'))
    assert.deepEqual(parseResx(normalized).map(e => [e.name, e.value]), [['A', 'hello']])
  })

  it('should preserve a comment when collapsing', () => {
    const text = `<root>
  <data name="A" xml:space="preserve">
    <value>hi</value>
    <comment>note</comment>
  </data>
</root>`
    assert.ok(normalizeResx(text).includes('<value>hi</value><comment>note</comment></data>'))
  })

  it('should leave designer entries untouched', () => {
    const text = `<root>
  <data name="$img" type="System.Drawing.Bitmap" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>AAAA</value>
  </data>
</root>`
    assert.equal(normalizeResx(text), text)
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
