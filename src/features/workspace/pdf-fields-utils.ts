import {
  PDFDocument,
  PDFName,
  PDFBool,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
  type PDFField
} from 'pdf-lib'

/**
 * AcroForm field inspection and selective clearing for PDF files.
 *
 * Mirrors the talento admin "PDF Fields" page: read a form's field names, types
 * and current values, and blank out selected fields. pdf-lib is the JS analogue
 * of PdfSharpCore here — a PDF is a binary object graph (xref tables, object
 * streams, Flate compression), so unlike the .docx ZIP case there is no
 * reasonable regex/zero-dependency path; a real PDF library is required.
 *
 * Everything here is pure (no vscode) and operates on byte buffers, so it can
 * be unit-tested against forms generated in-memory. Type detection uses
 * `instanceof` rather than `constructor.name`, which the production bundle
 * would minify.
 */

export interface PdfFieldInfo {
  name: string
  /** Friendly field type: Text, CheckBox, RadioGroup, Dropdown, OptionList, Button, Signature. */
  type: string
  /** Current value, shown in the table; empty when the field holds nothing. */
  value: string
  hasValue: boolean
  /** Whether the field's value can be edited (false for buttons, signatures and read-only fields). */
  editable: boolean
  /** True when the PDF marks the field read-only. */
  readOnly: boolean
  /** Available options for RadioGroup / Dropdown / OptionList. */
  options?: string[]
  /** Currently selected options (RadioGroup / Dropdown / OptionList). */
  selected?: string[]
  /** Current checkbox state. */
  checked?: boolean
  /** True for OptionList (multiple selection allowed). */
  multi?: boolean
}

export interface PdfFieldsResult {
  fields: PdfFieldInfo[]
  /** False when the document has no AcroForm fields at all. */
  hasForm: boolean
}

interface FieldReading {
  type: string
  value: string
  editable: boolean
  options?: string[]
  selected?: string[]
  checked?: boolean
  multi?: boolean
}

function readField(field: PDFField): FieldReading {
  if (field instanceof PDFTextField) {
    return { type: 'Text', value: field.getText() ?? '', editable: true }
  }
  if (field instanceof PDFCheckBox) {
    const checked = field.isChecked()
    return { type: 'CheckBox', value: checked ? 'checked' : '', checked, editable: true }
  }
  if (field instanceof PDFRadioGroup) {
    const selected = field.getSelected()
    return { type: 'RadioGroup', value: selected ?? '', options: field.getOptions(), selected: selected ? [selected] : [], editable: true }
  }
  if (field instanceof PDFDropdown) {
    const selected = field.getSelected()
    return { type: 'Dropdown', value: selected.join(', '), options: field.getOptions(), selected, editable: true }
  }
  if (field instanceof PDFOptionList) {
    const selected = field.getSelected()
    return { type: 'OptionList', value: selected.join(', '), options: field.getOptions(), selected, multi: true, editable: true }
  }
  if (field instanceof PDFSignature) {
    return { type: 'Signature', value: '', editable: false }
  }
  if (field instanceof PDFButton) {
    return { type: 'Button', value: '', editable: false }
  }
  return { type: 'Unknown', value: '', editable: false }
}

export async function readPdfFields(bytes: Uint8Array): Promise<PdfFieldsResult> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const form = document.getForm()
  const fields = form.getFields()
  const infos: PdfFieldInfo[] = fields.map(field => {
    const reading = readField(field)
    // Editability is decided by type only. A field marked read-only in the PDF
    // just can't be changed by an end-user in a viewer — this is a template
    // editor, so we can still rewrite its value programmatically.
    const readOnly = field.isReadOnly()
    return {
      name: field.getName(),
      type: reading.type,
      value: reading.value,
      hasValue: reading.value !== '',
      editable: reading.editable,
      readOnly,
      options: reading.options,
      selected: reading.selected,
      checked: reading.checked,
      multi: reading.multi
    }
  })
  return { fields: infos, hasForm: fields.length > 0 }
}

/** Text-rendered fields whose appearance is a text stream, not a baked on/off state. */
function isTextRendered(field: PDFField): boolean {
  return field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList
}

/**
 * Keep each touched field's original look. Text-rendered fields (Text,
 * Dropdown, OptionList) get their stale `/AP` stream removed so the viewer
 * redraws them from `/DA` and `/MK` instead of pdf-lib's generic generator;
 * checkbox/radio keep their `/AP` (their on/off appearance states are baked in
 * and carry the value mapping, so removing them would break it). Setting the
 * form's `/NeedAppearances` flag asks the viewer to (re)build what it needs.
 */
function refreshAppearances(form: ReturnType<PDFDocument['getForm']>, touched: PDFField[]): void {
  for (const field of touched) {
    if (!isTextRendered(field)) {
      continue
    }
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('AP'))
    }
  }
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)
}

/** A value to write into a form field; the shape depends on the field type. */
export interface PdfFieldValue {
  name: string
  /** string for Text/RadioGroup/Dropdown, boolean for CheckBox, string[] for OptionList. */
  value: string | boolean | string[]
}

function applyValue(field: PDFField, value: string | boolean | string[]): void {
  if (field instanceof PDFTextField) {
    field.setText(typeof value === 'string' ? value : String(value))
  } else if (field instanceof PDFCheckBox) {
    if (value) {
      field.check()
    } else {
      field.uncheck()
    }
  } else if (field instanceof PDFRadioGroup) {
    const option = Array.isArray(value) ? value[0] : value
    if (typeof option === 'string' && option) {
      field.select(option)
    } else {
      field.clear()
    }
  } else if (field instanceof PDFDropdown) {
    const option = Array.isArray(value) ? value[0] : value
    if (typeof option === 'string' && option) {
      field.select(option)
    } else {
      field.clear()
    }
  } else if (field instanceof PDFOptionList) {
    const options = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
    if (options.length > 0) {
      field.select(options)
    } else {
      field.clear()
    }
  }
}

/**
 * Write values into the named fields and return the re-saved PDF bytes. Text
 * fields are set (an empty string clears them); checkboxes toggled; radio
 * groups, dropdowns and option lists selected or cleared. Preserves each field's
 * original look via {@link refreshAppearances}.
 */
export async function setPdfFields(bytes: Uint8Array, values: PdfFieldValue[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes)
  const form = document.getForm()
  const byName = new Map(values.map(v => [v.name, v.value]))

  const touched: PDFField[] = []
  for (const field of form.getFields()) {
    if (!byName.has(field.getName())) {
      continue
    }
    const value = byName.get(field.getName())
    if (value === undefined) {
      continue
    }
    applyValue(field, value)
    touched.push(field)
  }

  refreshAppearances(form, touched)
  return document.save({ updateFieldAppearances: false })
}
