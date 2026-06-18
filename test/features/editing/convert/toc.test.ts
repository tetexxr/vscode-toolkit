import { strict as assert } from 'assert'
import {
  buildTocBlock,
  extractHeadings,
  findTocBlock,
  generateToc,
  githubSlug,
  stripInlineMarkdown
} from '../../../../src/features/editing/convert/toc-utils'

describe('stripInlineMarkdown', () => {
  it('should unwrap links to their label', () => {
    assert.equal(stripInlineMarkdown('See [the docs](https://x.test)'), 'See the docs')
  })

  it('should drop code and emphasis markers', () => {
    assert.equal(stripInlineMarkdown('Use `npm` for **builds**'), 'Use npm for builds')
  })
})

describe('githubSlug', () => {
  it('should lowercase and hyphenate', () => {
    assert.equal(githubSlug('Getting Started', new Map()), 'getting-started')
  })

  it('should drop punctuation but keep underscores', () => {
    assert.equal(githubSlug("What's new_here?", new Map()), 'whats-new_here')
  })

  it('should keep accented letters', () => {
    assert.equal(githubSlug('Configuración', new Map()), 'configuración')
  })

  it('should suffix duplicates incrementally', () => {
    const used = new Map<string, number>()
    assert.equal(githubSlug('Setup', used), 'setup')
    assert.equal(githubSlug('Setup', used), 'setup-1')
    assert.equal(githubSlug('Setup', used), 'setup-2')
  })

  it('should slug from the rendered text, ignoring markdown', () => {
    assert.equal(githubSlug('Use `code` here', new Map()), 'use-code-here')
  })

  it('should drop & and keep the double hyphen from the surrounding spaces', () => {
    // Matches the anchor GitHub / VS Code preview actually generate.
    assert.equal(githubSlug('Appearance & Viewers', new Map()), 'appearance--viewers')
  })

  it('should treat other removed punctuation between spaces the same way', () => {
    assert.equal(githubSlug('Get / Post', new Map()), 'get--post')
    assert.equal(githubSlug('Code Generation & Refactoring', new Map()), 'code-generation--refactoring')
  })

  it('should not collapse a real double space either', () => {
    assert.equal(githubSlug('a  b', new Map()), 'a--b')
  })
})

describe('extractHeadings', () => {
  it('should collect ATX headings with levels and slugs', () => {
    const lines = ['# Title', 'intro', '## Section A', '### Sub', '## Section B']
    assert.deepEqual(extractHeadings(lines), [
      { level: 1, text: 'Title', slug: 'title' },
      { level: 2, text: 'Section A', slug: 'section-a' },
      { level: 3, text: 'Sub', slug: 'sub' },
      { level: 2, text: 'Section B', slug: 'section-b' }
    ])
  })

  it('should ignore headings inside fenced code blocks', () => {
    const lines = ['# Real', '```', '# Not a heading', '## Also not', '```', '## Real Two']
    assert.deepEqual(
      extractHeadings(lines).map(h => h.text),
      ['Real', 'Real Two']
    )
  })

  it('should handle tilde fences too', () => {
    const lines = ['~~~', '# fake', '~~~', '# done']
    assert.deepEqual(
      extractHeadings(lines).map(h => h.text),
      ['done']
    )
  })

  it('should not treat # without a space as a heading', () => {
    assert.deepEqual(extractHeadings(['#nospace', '#tag-like']), [])
  })

  it('should keep anchor dedupe consistent across all heading levels', () => {
    const lines = ['# Setup', '## Setup']
    assert.deepEqual(
      extractHeadings(lines).map(h => h.slug),
      ['setup', 'setup-1']
    )
  })
})

describe('generateToc', () => {
  const doc = ['# Title', '## Install', '### macOS', '### Windows', '## Usage', '#### Deep'].join('\n').split('\n')

  it('should nest by relative heading depth up to maxLevel', () => {
    assert.equal(
      generateToc(doc, { maxLevel: 3 }),
      [
        '- [Title](#title)',
        '  - [Install](#install)',
        '    - [macOS](#macos)',
        '    - [Windows](#windows)',
        '  - [Usage](#usage)'
      ].join('\n')
    )
  })

  it('should cut off below the requested max level', () => {
    assert.equal(generateToc(doc, { maxLevel: 1 }), '- [Title](#title)')
  })

  it('should indent relative to the shallowest included heading', () => {
    const lines = ['## A', '### B'].join('\n').split('\n')
    assert.equal(generateToc(lines, { maxLevel: 3 }), ['- [A](#a)', '  - [B](#b)'].join('\n'))
  })

  it('should return an empty string when there are no headings', () => {
    assert.equal(generateToc(['just text', 'more text'], { maxLevel: 6 }), '')
  })
})

describe('findTocBlock / buildTocBlock', () => {
  it('should wrap a TOC in marker comments', () => {
    assert.equal(buildTocBlock('- [A](#a)'), '<!-- toc -->\n\n- [A](#a)\n\n<!-- /toc -->')
  })

  it('should locate an existing marker block (case-insensitive)', () => {
    const lines = ['# Title', '<!-- TOC -->', '- [old](#old)', '<!-- /TOC -->', 'body']
    assert.deepEqual(findTocBlock(lines), { start: 1, end: 3 })
  })

  it('should return null without both markers', () => {
    assert.equal(findTocBlock(['# Title', '<!-- toc -->', 'no end']), null)
  })
})
