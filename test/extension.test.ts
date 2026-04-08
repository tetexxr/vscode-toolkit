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
    'registerNpmCommands'
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
