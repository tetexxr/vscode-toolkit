import { strict as assert } from 'assert'
import { PDFDocument, PDFName } from 'pdf-lib'
import { readPdfFields, clearPdfFields } from '../../../src/features/workspace/pdf-fields-utils'

/** Build an in-memory PDF with a filled AcroForm to exercise the utils. */
async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 400])
  const form = doc.getForm()

  const text = form.createTextField('person.name')
  text.setText('Ada Lovelace')
  text.addToPage(page, { x: 10, y: 350, width: 200, height: 20 })

  const empty = form.createTextField('person.notes')
  empty.addToPage(page, { x: 10, y: 320, width: 200, height: 20 })

  const check = form.createCheckBox('person.active')
  check.check()
  check.addToPage(page, { x: 10, y: 290, width: 15, height: 15 })

  const dropdown = form.createDropdown('person.role')
  dropdown.addOptions(['admin', 'user'])
  dropdown.select('admin')
  dropdown.addToPage(page, { x: 10, y: 260, width: 120, height: 20 })

  return doc.save()
}

async function noFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc.save()
}

describe('readPdfFields', () => {
  it('lists every field with name, type and value', async () => {
    const result = await readPdfFields(await formPdf())
    assert.equal(result.hasForm, true)

    const byName = new Map(result.fields.map(f => [f.name, f]))
    assert.equal(byName.get('person.name')?.type, 'Text')
    assert.equal(byName.get('person.name')?.value, 'Ada Lovelace')
    assert.equal(byName.get('person.name')?.hasValue, true)

    assert.equal(byName.get('person.active')?.type, 'CheckBox')
    assert.equal(byName.get('person.active')?.hasValue, true)

    assert.equal(byName.get('person.role')?.type, 'Dropdown')
    assert.equal(byName.get('person.role')?.value, 'admin')
  })

  it('marks empty fields as having no value', async () => {
    const result = await readPdfFields(await formPdf())
    const notes = result.fields.find(f => f.name === 'person.notes')
    assert.ok(notes)
    assert.equal(notes?.value, '')
    assert.equal(notes?.hasValue, false)
  })

  it('reports hasForm false for a PDF without form fields', async () => {
    const result = await readPdfFields(await noFormPdf())
    assert.equal(result.hasForm, false)
    assert.equal(result.fields.length, 0)
  })
})

describe('clearPdfFields', () => {
  it('clears only the selected fields, leaving the rest intact', async () => {
    const cleared = await clearPdfFields(await formPdf(), ['person.name', 'person.active'])
    const result = await readPdfFields(cleared)
    const byName = new Map(result.fields.map(f => [f.name, f]))

    assert.equal(byName.get('person.name')?.value, '')
    assert.equal(byName.get('person.name')?.hasValue, false)
    assert.equal(byName.get('person.active')?.hasValue, false)

    // Untouched fields keep their values.
    assert.equal(byName.get('person.role')?.value, 'admin')
  })

  it('clears dropdowns and keeps the document readable', async () => {
    const cleared = await clearPdfFields(await formPdf(), ['person.role'])
    const result = await readPdfFields(cleared)
    assert.equal(result.fields.find(f => f.name === 'person.role')?.hasValue, false)
    assert.equal(result.fields.find(f => f.name === 'person.name')?.value, 'Ada Lovelace')
  })

  it('is a no-op when no field names match', async () => {
    const cleared = await clearPdfFields(await formPdf(), ['does.not.exist'])
    const result = await readPdfFields(cleared)
    assert.equal(result.fields.find(f => f.name === 'person.name')?.value, 'Ada Lovelace')
  })

  it('sets NeedAppearances so the viewer keeps the field styling', async () => {
    const cleared = await clearPdfFields(await formPdf(), ['person.name'])
    const doc = await PDFDocument.load(cleared)
    const needAppearances = doc.getForm().acroForm.dict.get(PDFName.of('NeedAppearances'))
    assert.ok(needAppearances, 'NeedAppearances flag should be present after clearing')
  })
})
