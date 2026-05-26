import { strict as assert } from 'assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '../src/extension.ts'), 'utf-8')

describe('extension entry point', () => {
  const expectedRegistrations = [
    'registerChangeCaseCommands',
    'registerSlugCommands',
    'registerOpenInGitHubCommands',
    'registerFormatFilesCommands',
    'registerExpandRecursivelyCommands',
    'registerNugetCommands',
    'registerCSharpCommands',
    'registerNpmIntellisenseCommands',
    'registerPdfViewer',
    'registerGitHistoryCommands',
    'registerAddBracesCodeActions',
    'registerGitBlameCommands',
    'registerNpmCommands',
    'registerRelativeImportsCommands',
    'registerMoveSymbolCommands',
    'registerExpandChangedFilesCommands',
    'registerDiagnosticHighlightCommands',
    'registerGitEditCommitCommands',
    'registerGitStageCommands',
    'registerFindFileOrFolderCommands',
    'registerSumNumbersCommands',
    'registerCsvRainbowCommands',
    'registerTypeOnlyImportsCommands',
    'registerLinesCommands',
    'registerAlignCommands',
    'registerToggleQuotesCommands',
    'registerTransformCommands',
    'registerInsertCommands',
    'registerTimestampCommands',
    'registerJsonToTypeCommands',
    'registerPasteImageCommands',
    'registerClipboardHistoryCommands',
    'registerBookmarkCommands'
  ]

  for (const fn of expectedRegistrations) {
    it(`should register ${fn}`, () => {
      assert.ok(source.includes(`${fn}(context)`), `Missing call to ${fn}(context) in activate()`)
    })
  }

  it('should export activate function', () => {
    assert.ok(source.includes('export function activate'))
  })

  it('should export deactivate function', () => {
    assert.ok(source.includes('export function deactivate'))
  })
})

describe('package.json contributions', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
  const commands: Array<{ command: string }> = pkg.contributes?.commands ?? []
  const settings = pkg.contributes?.configuration?.properties ?? {}

  it('should declare toolkit.toggleCsvRainbow command', () => {
    assert.ok(
      commands.some(c => c.command === 'toolkit.toggleCsvRainbow'),
      'toolkit.toggleCsvRainbow command not declared in package.json'
    )
  })

  for (const key of [
    'toolkit.csvRainbow.enabled',
    'toolkit.csvRainbow.colors',
    'toolkit.csvRainbow.delimiters',
    'toolkit.csvRainbow.maxLines'
  ]) {
    it(`should declare ${key} setting`, () => {
      assert.ok(settings[key], `${key} not declared in package.json configuration`)
    })
  }
})
