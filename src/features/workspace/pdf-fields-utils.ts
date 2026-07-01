import {
  PDFDocument,
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
}

export interface PdfFieldsResult {
  fields: PdfFieldInfo[]
  /** False when the document has no AcroForm fields at all. */
  hasForm: boolean
}

interface FieldReading {
  type: string
  value: string
}

function readField(field: PDFField): FieldReading {
  if (field instanceof PDFTextField) {
    return { type: 'Text', value: field.getText() ?? '' }
  }
  if (field instanceof PDFCheckBox) {
    return { type: 'CheckBox', value: field.isChecked() ? 'checked' : '' }
  }
  if (field instanceof PDFRadioGroup) {
    return { type: 'RadioGroup', value: field.getSelected() ?? '' }
  }
  if (field instanceof PDFDropdown) {
    return { type: 'Dropdown', value: field.getSelected().join(', ') }
  }
  if (field instanceof PDFOptionList) {
    return { type: 'OptionList', value: field.getSelected().join(', ') }
  }
  if (field instanceof PDFSignature) {
    return { type: 'Signature', value: '' }
  }
  if (field instanceof PDFButton) {
    return { type: 'Button', value: '' }
  }
  return { type: 'Unknown', value: '' }
}

/** Read every AcroForm field's name, type and current value. */
export async function readPdfFields(bytes: Uint8Array): Promise<PdfFieldsResult> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const form = document.getForm()
  const fields = form.getFields()
  const infos: PdfFieldInfo[] = fields.map(field => {
    const reading = readField(field)
    return { name: field.getName(), type: reading.type, value: reading.value, hasValue: reading.value !== '' }
  })
  return { fields: infos, hasForm: fields.length > 0 }
}

/**
 * Blank out the named fields and return the re-saved PDF bytes. Text fields are
 * emptied; checkboxes unchecked; radio groups, dropdowns and option lists
 * deselected. pdf-lib regenerates field appearances on save, so cleared fields
 * render blank without the NeedAppearances workaround PdfSharpCore needs.
 */
export async function clearPdfFields(bytes: Uint8Array, fieldsToClear: string[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes)
  const form = document.getForm()
  const wanted = new Set(fieldsToClear)

  for (const field of form.getFields()) {
    if (!wanted.has(field.getName())) {
      continue
    }
    if (field instanceof PDFTextField) {
      field.setText('')
    } else if (field instanceof PDFCheckBox) {
      field.uncheck()
    } else if (field instanceof PDFRadioGroup) {
      field.clear()
    } else if (field instanceof PDFDropdown) {
      field.clear()
    } else if (field instanceof PDFOptionList) {
      field.clear()
    }
  }

  return document.save()
}
