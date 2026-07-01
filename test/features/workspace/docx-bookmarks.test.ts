import { strict as assert } from 'assert'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import {
  analyzeXmlPart,
  fixXmlPart,
  analyzeDocx,
  fixDocx,
  isInternalBookmark,
  isWordXmlPart
} from '../../../src/features/workspace/docx-bookmarks-utils'

const RPR = '<w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana"/><w:sz w:val="18"/></w:rPr>'

function run(text: string, rPr = RPR): string {
  return `<w:r>${rPr}<w:t>${text}</w:t></w:r>`
}

function bookmark(id: string, name: string, inner: string): string {
  return `<w:bookmarkStart w:id="${id}" w:name="${name}"/>${inner}<w:bookmarkEnd w:id="${id}"/>`
}

function paragraph(inner: string): string {
  return `<w:p>${inner}</w:p>`
}

function docXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`
}

function docxBuffer(documentXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'word/document.xml': strToU8(documentXml)
  })
}

describe('isWordXmlPart', () => {
  it('matches document, headers and footers', () => {
    assert.ok(isWordXmlPart('word/document.xml'))
    assert.ok(isWordXmlPart('word/header2.xml'))
    assert.ok(isWordXmlPart('word/footer1.xml'))
  })

  it('ignores styles, rels and media', () => {
    assert.ok(!isWordXmlPart('word/styles.xml'))
    assert.ok(!isWordXmlPart('word/_rels/document.xml.rels'))
    assert.ok(!isWordXmlPart('[Content_Types].xml'))
  })
})

describe('isInternalBookmark', () => {
  it('flags Word structural bookmarks', () => {
    assert.ok(isInternalBookmark('_GoBack'))
    assert.ok(isInternalBookmark('_Toc12345'))
    assert.ok(!isInternalBookmark('TrainersFullName'))
  })
})

describe('analyzeXmlPart', () => {
  it('flags a bookmark split across multiple runs as fixable', () => {
    const xml = docXml(
      paragraph(bookmark('7', 'TrainersFullName', run('T') + run('rainer') + run('s') + run('FullName')))
    )
    const { bookmarks, issues } = analyzeXmlPart(xml, 'word/document.xml')

    assert.equal(bookmarks.length, 1)
    assert.equal(bookmarks[0].runCount, 4)
    assert.equal(bookmarks[0].text, 'TrainersFullName')
    assert.equal(issues.length, 1)
    assert.equal(issues[0].kind, 'split-runs')
    assert.equal(issues[0].fixable, true)
  })

  it('does not flag a bookmark contained in a single run', () => {
    const xml = docXml(paragraph(bookmark('1', 'ServiceName', run('ServiceName'))))
    const { issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.equal(issues.length, 0)
  })

  it('ignores Word internal bookmarks', () => {
    const xml = docXml(paragraph(bookmark('1', '_GoBack', run('a') + run('b'))))
    const { bookmarks, issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.equal(bookmarks.length, 0)
    assert.equal(issues.length, 0)
  })

  it('reports a split bookmark with breaks as not fixable', () => {
    const withBreak = `<w:r>${RPR}<w:t>Line1</w:t><w:br/></w:r>` + run('Line2')
    const xml = docXml(paragraph(bookmark('3', 'Notes', withBreak)))
    const { issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.equal(issues.length, 1)
    assert.equal(issues[0].kind, 'split-runs')
    assert.equal(issues[0].fixable, false)
  })

  it('flags names longer than 40 characters', () => {
    const longName = 'A'.repeat(41)
    const xml = docXml(paragraph(bookmark('1', longName, run(longName))))
    const { issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.ok(issues.some(i => i.kind === 'name-too-long'))
  })

  it('flags duplicate bookmark names', () => {
    const xml = docXml(
      paragraph(bookmark('1', 'Dup', run('x'))) + paragraph(bookmark('2', 'Dup', run('y')))
    )
    const { issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.equal(issues.filter(i => i.kind === 'duplicate-name').length, 1)
  })

  it('flags an orphan bookmarkStart and orphan bookmarkEnd', () => {
    const xml = docXml(
      paragraph('<w:bookmarkStart w:id="9" w:name="Lonely"/>' + run('x')) +
        paragraph('<w:bookmarkEnd w:id="42"/>')
    )
    const { issues } = analyzeXmlPart(xml, 'word/document.xml')
    assert.ok(issues.some(i => i.kind === 'orphan-start' && i.name === 'Lonely'))
    assert.ok(issues.some(i => i.kind === 'orphan-end'))
  })
})

describe('fixXmlPart', () => {
  it('consolidates split runs into one, preserving formatting', () => {
    const xml = docXml(
      paragraph(bookmark('7', 'TrainersFullName', run('T') + run('rainer') + run('s') + run('FullName')))
    )
    const { xml: fixedXml, fixed } = fixXmlPart(xml)

    assert.deepEqual(fixed, ['TrainersFullName'])
    const reanalyzed = analyzeXmlPart(fixedXml, 'word/document.xml')
    assert.equal(reanalyzed.issues.length, 0)
    assert.equal(reanalyzed.bookmarks[0].runCount, 1)
    assert.equal(reanalyzed.bookmarks[0].text, 'TrainersFullName')
    assert.ok(fixedXml.includes('w:ascii="Verdana"'), 'run formatting must be preserved')
  })

  it('is idempotent', () => {
    const xml = docXml(paragraph(bookmark('7', 'Trainers', run('Trai') + run('ners'))))
    const once = fixXmlPart(xml).xml
    const twice = fixXmlPart(once)
    assert.equal(twice.fixed.length, 0)
    assert.equal(twice.xml, once)
  })

  it('leaves single-run bookmarks untouched', () => {
    const xml = docXml(paragraph(bookmark('1', 'ServiceName', run('ServiceName'))))
    const { xml: out, fixed } = fixXmlPart(xml)
    assert.equal(fixed.length, 0)
    assert.equal(out, xml)
  })

  it('does not touch a split bookmark containing a break', () => {
    const withBreak = `<w:r>${RPR}<w:t>Line1</w:t><w:br/></w:r>` + run('Line2')
    const xml = docXml(paragraph(bookmark('3', 'Notes', withBreak)))
    const { fixed } = fixXmlPart(xml)
    assert.equal(fixed.length, 0)
  })

  it('preserves xml:space when text has leading/trailing whitespace', () => {
    const xml = docXml(paragraph(bookmark('5', 'Spaced', run(' Full ') + run('Name '))))
    const { xml: out } = fixXmlPart(xml)
    assert.ok(out.includes('xml:space="preserve"'))
    assert.equal(analyzeXmlPart(out, 'word/document.xml').bookmarks[0].text, ' Full Name ')
  })

  it('fixes several bookmarks in the same part without offset drift', () => {
    const xml = docXml(
      paragraph(bookmark('1', 'First', run('Fir') + run('st'))) +
        paragraph(bookmark('2', 'Second', run('Sec') + run('ond')))
    )
    const { fixed } = fixXmlPart(xml)
    assert.deepEqual(fixed, ['First', 'Second'])
    const out = fixXmlPart(xml).xml
    assert.equal(analyzeXmlPart(out, 'word/document.xml').issues.length, 0)
  })

  it('fixes only the bookmarks accepted by shouldFix', () => {
    const xml = docXml(
      paragraph(bookmark('1', 'First', run('Fir') + run('st'))) +
        paragraph(bookmark('2', 'Second', run('Sec') + run('ond')))
    )
    const { xml: out, fixed } = fixXmlPart(xml, name => name === 'Second')
    assert.deepEqual(fixed, ['Second'])
    const issues = analyzeXmlPart(out, 'word/document.xml').issues
    assert.deepEqual(issues.map(i => i.name), ['First'])
  })
})

describe('analyzeDocx / fixDocx', () => {
  it('analyzes bookmarks from a real .docx buffer', () => {
    const buffer = docxBuffer(
      docXml(paragraph(bookmark('7', 'TrainersFullName', run('T') + run('rainer') + run('s') + run('FullName'))))
    )
    const { issues } = analyzeDocx(buffer)
    assert.equal(issues.length, 1)
    assert.equal(issues[0].kind, 'split-runs')
    assert.equal(issues[0].part, 'word/document.xml')
  })

  it('fixes a .docx buffer and keeps it a valid, complete ZIP', () => {
    const buffer = docxBuffer(
      docXml(paragraph(bookmark('7', 'TrainersFullName', run('T') + run('rainer') + run('s') + run('FullName'))))
    )
    const { buffer: fixedBuffer, fixed } = fixDocx(buffer)

    assert.deepEqual(fixed, [{ part: 'word/document.xml', name: 'TrainersFullName' }])

    const entries = unzipSync(fixedBuffer)
    assert.ok('[Content_Types].xml' in entries, 'untouched entries must survive the rewrite')
    assert.ok('word/document.xml' in entries)

    const reanalyzed = analyzeDocx(fixedBuffer)
    assert.equal(reanalyzed.issues.length, 0)
    assert.equal(strFromU8(entries['word/document.xml']).match(/<w:r\b/g)?.length, 1)
  })

  it('reports nothing to fix on a clean document', () => {
    const buffer = docxBuffer(docXml(paragraph(bookmark('1', 'ServiceName', run('ServiceName')))))
    const { fixed } = fixDocx(buffer)
    assert.equal(fixed.length, 0)
  })

  it('fixes only the targeted bookmark when targets are given', () => {
    const buffer = docxBuffer(
      docXml(
        paragraph(bookmark('1', 'First', run('Fir') + run('st'))) +
          paragraph(bookmark('2', 'Second', run('Sec') + run('ond')))
      )
    )
    const { buffer: out, fixed } = fixDocx(buffer, [{ part: 'word/document.xml', name: 'Second' }])
    assert.deepEqual(fixed, [{ part: 'word/document.xml', name: 'Second' }])

    const remaining = analyzeDocx(out).issues
    assert.deepEqual(remaining.map(i => i.name), ['First'])
  })
})
