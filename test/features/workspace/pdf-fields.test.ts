import { strict as assert } from 'assert'
import { PDFDocument, PDFName } from 'pdf-lib'
import { readPdfFields, setPdfFields } from '../../../src/features/workspace/pdf-fields-utils'

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

  const radio = form.createRadioGroup('person.plan')
  radio.addOptionToPage('free', page, { x: 10, y: 230, width: 15, height: 15 })
  radio.addOptionToPage('pro', page, { x: 40, y: 230, width: 15, height: 15 })
  radio.select('free')

  const list = form.createOptionList('person.langs')
  list.setOptions(['es', 'en', 'ca'])
  list.select(['es'])
  list.addToPage(page, { x: 10, y: 180, width: 120, height: 40 })

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

describe('readPdfFields metadata', () => {
  it('exposes options, selection and editability per type', async () => {
    const byName = new Map((await readPdfFields(await formPdf())).fields.map(f => [f.name, f]))

    assert.equal(byName.get('person.name')?.editable, true)

    const role = byName.get('person.role')
    assert.deepEqual(role?.options, ['admin', 'user'])
    assert.deepEqual(role?.selected, ['admin'])

    const plan = byName.get('person.plan')
    assert.equal(plan?.type, 'RadioGroup')
    assert.deepEqual(plan?.options, ['free', 'pro'])
    assert.deepEqual(plan?.selected, ['free'])

    const langs = byName.get('person.langs')
    assert.equal(langs?.multi, true)
    assert.deepEqual(langs?.options, ['es', 'en', 'ca'])
  })
})

describe('setPdfFields', () => {
  const read = async (bytes: Uint8Array) => new Map((await readPdfFields(bytes)).fields.map(f => [f.name, f]))

  it('writes values across every field type', async () => {
    const out = await setPdfFields(await formPdf(), [
      { name: 'person.name', value: 'Grace Hopper' },
      { name: 'person.active', value: false },
      { name: 'person.role', value: 'user' },
      { name: 'person.plan', value: 'pro' },
      { name: 'person.langs', value: ['en', 'ca'] }
    ])
    const byName = await read(out)

    assert.equal(byName.get('person.name')?.value, 'Grace Hopper')
    assert.equal(byName.get('person.active')?.checked, false)
    assert.deepEqual(byName.get('person.role')?.selected, ['user'])
    assert.deepEqual(byName.get('person.plan')?.selected, ['pro'])
    assert.deepEqual(byName.get('person.langs')?.selected, ['en', 'ca'])
  })

  it('treats an empty value as clearing the field', async () => {
    const out = await setPdfFields(await formPdf(), [{ name: 'person.name', value: '' }])
    const byName = await read(out)
    assert.equal(byName.get('person.name')?.hasValue, false)
  })

  it('leaves untouched fields alone and sets NeedAppearances', async () => {
    const out = await setPdfFields(await formPdf(), [{ name: 'person.name', value: 'Edsger' }])
    const byName = await read(out)
    assert.equal(byName.get('person.role')?.value, 'admin')

    const needAppearances = (await PDFDocument.load(out)).getForm().acroForm.dict.get(PDFName.of('NeedAppearances'))
    assert.ok(needAppearances)
  })
})
