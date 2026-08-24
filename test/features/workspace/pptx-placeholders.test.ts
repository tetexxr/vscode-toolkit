import { strict as assert } from 'assert'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import {
  analyzeXmlPart,
  analysisToRows,
  fixXmlPart,
  analyzePptx,
  fixPptx,
  isPptxXmlPart,
  partLabel
} from '../../../src/features/workspace/pptx-placeholders-utils'

const RPR = '<a:rPr lang="es-ES" sz="850" dirty="0"/>'
const BOLD = '<a:rPr lang="es-ES" sz="850" b="1"/>'

function run(text: string, rPr = RPR): string {
  return `<a:r>${rPr}<a:t>${text}</a:t></a:r>`
}

function paragraph(inner: string): string {
  return `<a:p>${inner}</a:p>`
}

function slideXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="x" xmlns:p="y"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`
}

function pptxBuffer(parts: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = { '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>') }
  for (const [name, xml] of Object.entries(parts)) {
    entries[name] = strToU8(xml)
  }
  return zipSync(entries)
}

function texts(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1])
}

function runProperties(xml: string): string[] {
  return [...xml.matchAll(/<a:r>([\s\S]*?)<a:t>/g)].map(m => m[1])
}

describe('isPptxXmlPart', () => {
  it('matches slides, layouts, masters and notes', () => {
    assert.ok(isPptxXmlPart('ppt/slides/slide9.xml'))
    assert.ok(isPptxXmlPart('ppt/slideLayouts/slideLayout3.xml'))
    assert.ok(isPptxXmlPart('ppt/slideMasters/slideMaster1.xml'))
    assert.ok(isPptxXmlPart('ppt/notesSlides/notesSlide2.xml'))
  })

  it('ignores rels, media and presentation metadata', () => {
    assert.ok(!isPptxXmlPart('ppt/presentation.xml'))
    assert.ok(!isPptxXmlPart('ppt/slides/_rels/slide1.xml.rels'))
    assert.ok(!isPptxXmlPart('ppt/theme/theme1.xml'))
    assert.ok(!isPptxXmlPart('[Content_Types].xml'))
  })
})

describe('partLabel', () => {
  it('names the part the way the slide is numbered', () => {
    assert.equal(partLabel('ppt/slides/slide9.xml'), 'slide 9')
    assert.equal(partLabel('ppt/slideLayouts/slideLayout3.xml'), 'layout 3')
    assert.equal(partLabel('ppt/slideMasters/slideMaster1.xml'), 'master 1')
    assert.equal(partLabel('ppt/notesSlides/notesSlide2.xml'), 'notes 2')
  })

  it('falls back to the raw part when it is not a known one', () => {
    assert.equal(partLabel('ppt/presentation.xml'), 'ppt/presentation.xml')
  })
})

describe('analyzeXmlPart', () => {
  const part = 'ppt/slides/slide1.xml'

  it('reports a placeholder held in a single run as clean', () => {
    const xml = slideXml(paragraph(run('Fecha envío, ') + run('{{SendDate}}')))
    const analysis = analyzeXmlPart(xml, part)
    assert.deepEqual(
      analysis.placeholders.map(p => ({ name: p.name, runCount: p.runCount })),
      [{ name: 'SendDate', runCount: 1 }]
    )
    assert.deepEqual(analysis.issues, [])
  })

  it('flags a placeholder stored across runs as fixable', () => {
    const xml = slideXml(paragraph(run('Fecha envío, {{Send') + run('Date') + run('}}')))
    const analysis = analyzeXmlPart(xml, part)
    assert.deepEqual(analysis.placeholders.map(p => p.runCount), [3])
    assert.equal(analysis.issues.length, 1)
    assert.equal(analysis.issues[0].kind, 'split-runs')
    assert.equal(analysis.issues[0].name, 'SendDate')
    assert.ok(analysis.issues[0].fixable)
  })

  it('refuses to fix a placeholder with a line break between the braces', () => {
    const xml = slideXml(paragraph(run('{{Send') + '<a:br/>' + run('Date}}')))
    const analysis = analyzeXmlPart(xml, part)
    assert.equal(analysis.issues.length, 1)
    assert.equal(analysis.issues[0].kind, 'crosses-break')
    assert.ok(!analysis.issues[0].fixable)
  })

  it('refuses to fix a placeholder wrapped around a field', () => {
    const xml = slideXml(paragraph(run('{{Slide') + '<a:fld id="1" type="slidenum"><a:t>9</a:t></a:fld>' + run('Number}}')))
    const analysis = analyzeXmlPart(xml, part)
    assert.equal(analysis.issues[0].kind, 'crosses-break')
    assert.ok(!analysis.issues[0].fixable)
  })

  it('reports braces that are not a single word', () => {
    const xml = slideXml(paragraph(run('{{ Company }} y {{Company Name}}')))
    const analysis = analyzeXmlPart(xml, part)
    assert.deepEqual(analysis.placeholders, [])
    assert.deepEqual(
      analysis.issues.map(i => ({ kind: i.kind, name: i.name })),
      [
        { kind: 'malformed', name: '{{ Company }}' },
        { kind: 'malformed', name: '{{Company Name}}' }
      ]
    )
  })

  it('reports braces with no counterpart in the paragraph', () => {
    const xml = slideXml(paragraph(run('Importe {{Price')) + paragraph(run('cerrado}} aparte')))
    const analysis = analyzeXmlPart(xml, part)
    assert.deepEqual(analysis.issues.map(i => i.kind), ['unclosed', 'unclosed'])
    assert.deepEqual(analysis.placeholders, [])
  })

  it('reports every use of the same placeholder', () => {
    const xml = slideXml(paragraph(run('{{Company}}')) + paragraph(run('{{Company}} otra vez')))
    const analysis = analyzeXmlPart(xml, part)
    assert.deepEqual(analysis.placeholders.map(p => p.name), ['Company', 'Company'])
  })
})

describe('fixXmlPart', () => {
  it('merges the placeholder without disturbing the text around it', () => {
    const xml = slideXml(paragraph(run('Fecha envío, {{Send', RPR) + run('Date', BOLD) + run('}} — final', BOLD)))
    const result = fixXmlPart(xml)

    assert.deepEqual(result.fixed, ['SendDate'])
    assert.deepEqual(texts(result.xml), ['Fecha envío, ', '{{SendDate}}', ' — final'])
    // The placeholder takes the formatting of the run it starts in; the tail keeps its own.
    assert.deepEqual(runProperties(result.xml), [RPR, RPR, BOLD])
  })

  it('drops empty edges instead of writing blank runs', () => {
    const xml = slideXml(paragraph(run('{{Send') + run('Date}}')))
    const result = fixXmlPart(xml)
    assert.deepEqual(texts(result.xml), ['{{SendDate}}'])
  })

  it('merges every split placeholder in the same paragraph', () => {
    const xml = slideXml(paragraph(run('{{Work') + run('Centers}} centros y {{Collective') + run('Agreements}} convenios')))
    const result = fixXmlPart(xml)
    assert.deepEqual(result.fixed.sort(), ['CollectiveAgreements', 'WorkCenters'])
    assert.deepEqual(texts(result.xml), ['{{WorkCenters}}', ' centros y ', '{{CollectiveAgreements}}', ' convenios'])
  })

  it('leaves a placeholder that crosses a break untouched', () => {
    const xml = slideXml(paragraph(run('{{Send') + '<a:br/>' + run('Date}}')))
    const result = fixXmlPart(xml)
    assert.deepEqual(result.fixed, [])
    assert.equal(result.xml, xml)
  })

  it('only merges the placeholders the caller asks for', () => {
    const xml = slideXml(paragraph(run('{{Com') + run('pany}} ') + run('{{Pri') + run('ce}}')))
    const result = fixXmlPart(xml, name => name === 'Price')
    assert.deepEqual(result.fixed, ['Price'])
    assert.deepEqual(texts(result.xml), ['{{Com', 'pany}} ', '{{Price}}'])
  })

  it('leaves a presentation with nothing to merge byte for byte', () => {
    const xml = slideXml(paragraph(run('{{Company}}')) + paragraph(run('Sin marcadores')))
    assert.equal(fixXmlPart(xml).xml, xml)
  })
})

describe('analyzePptx', () => {
  it('walks slides, layouts and notes, in slide order', () => {
    const buffer = pptxBuffer({
      'ppt/slides/slide10.xml': slideXml(paragraph(run('{{Price}}'))),
      'ppt/slides/slide2.xml': slideXml(paragraph(run('{{Company}}'))),
      'ppt/notesSlides/notesSlide1.xml': slideXml(paragraph(run('{{Year}}'))),
      'ppt/theme/theme1.xml': '<a:theme><a:p><a:r><a:t>{{NotAPlaceholder}}</a:t></a:r></a:p></a:theme>'
    })
    const analysis = analyzePptx(buffer)
    assert.deepEqual(
      analysis.placeholders.map(p => `${partLabel(p.part)}:${p.name}`),
      ['slide 2:Company', 'slide 10:Price', 'notes 1:Year']
    )
  })
})

describe('fixPptx', () => {
  it('rewrites only the parts it merged and keeps the rest of the ZIP', () => {
    const split = slideXml(paragraph(run('{{Com') + run('pany}}')))
    const clean = slideXml(paragraph(run('{{Price}}')))
    const buffer = pptxBuffer({ 'ppt/slides/slide1.xml': split, 'ppt/slides/slide2.xml': clean })

    const result = fixPptx(buffer)
    assert.deepEqual(result.fixed, [{ part: 'ppt/slides/slide1.xml', name: 'Company' }])

    const entries = unzipSync(result.buffer)
    assert.deepEqual(texts(strFromU8(entries['ppt/slides/slide1.xml'])), ['{{Company}}'])
    assert.equal(strFromU8(entries['ppt/slides/slide2.xml']), clean)
    assert.ok(entries['[Content_Types].xml'])
  })

  it('honours a single target', () => {
    const buffer = pptxBuffer({
      'ppt/slides/slide1.xml': slideXml(paragraph(run('{{Com') + run('pany}}'))),
      'ppt/slides/slide2.xml': slideXml(paragraph(run('{{Pri') + run('ce}}')))
    })
    const result = fixPptx(buffer, [{ part: 'ppt/slides/slide2.xml', name: 'Price' }])
    assert.deepEqual(result.fixed, [{ part: 'ppt/slides/slide2.xml', name: 'Price' }])

    const entries = unzipSync(result.buffer)
    assert.deepEqual(texts(strFromU8(entries['ppt/slides/slide1.xml'])), ['{{Com', 'pany}}'])
  })
})

describe('analysisToRows', () => {
  it('gives a placeholder one row per part and counts repeats', () => {
    const buffer = pptxBuffer({
      'ppt/slides/slide1.xml': slideXml(paragraph(run('{{Company}}'))),
      'ppt/slides/slide9.xml': slideXml(paragraph(run('{{Company}} y {{Company}}')))
    })
    const rows = analysisToRows('/tmp/deck.pptx', 'deck.pptx', analyzePptx(buffer))
    assert.deepEqual(
      rows.map(r => ({ name: r.name, location: r.location, uses: r.uses })),
      [
        { name: 'Company', location: 'slide 1', uses: 1 },
        { name: 'Company', location: 'slide 9', uses: 2 }
      ]
    )
  })

  it('carries the split status and its Fix affordance onto the row', () => {
    const buffer = pptxBuffer({ 'ppt/slides/slide1.xml': slideXml(paragraph(run('{{Com') + run('pany}}'))) })
    const [row] = analysisToRows('/tmp/deck.pptx', 'deck.pptx', analyzePptx(buffer))
    assert.equal(row.kind, 'split-runs')
    assert.equal(row.runCount, 2)
    assert.ok(row.fixable)
  })

  it('gives malformed braces a row of their own', () => {
    const buffer = pptxBuffer({ 'ppt/slides/slide1.xml': slideXml(paragraph(run('{{ Company }}'))) })
    const rows = analysisToRows('/tmp/deck.pptx', 'deck.pptx', analyzePptx(buffer))
    assert.deepEqual(rows.map(r => ({ name: r.name, kind: r.kind, fixable: r.fixable })), [
      { name: '{{ Company }}', kind: 'malformed', fixable: false }
    ])
  })
})
