import { strict as assert } from 'assert'
import {
  renderFileList,
  renderDiffContent,
  renderDiffPlaceholders,
  LARGE_DIFF_LINE_THRESHOLD
} from '../../src/features/git-edit-commit-utils'
import { CommitFileInfo } from '../../src/utils/git'

function file(overrides: Partial<CommitFileInfo> = {}): CommitFileInfo {
  return {
    status: 'M',
    path: 'src/file.ts',
    additions: 1,
    deletions: 1,
    isBinary: false,
    ...overrides
  }
}

describe('renderFileList', () => {
  it('should render an entry per file', () => {
    const html = renderFileList([file({ path: 'a.ts' }), file({ path: 'b.ts' })])
    const matches = html.match(/class="file-entry"/g)
    assert.equal(matches?.length, 2)
  })

  it('should mark added files with the "added" status class', () => {
    const html = renderFileList([file({ status: 'A' })])
    assert.ok(html.includes('file-status added'))
  })

  it('should mark deleted files with the "deleted" status class', () => {
    const html = renderFileList([file({ status: 'D' })])
    assert.ok(html.includes('file-status deleted'))
  })

  it('should mark modified and other statuses with the "modified" class', () => {
    const html = renderFileList([file({ status: 'M' })])
    assert.ok(html.includes('file-status modified'))
  })

  it('should include data-path attribute', () => {
    const html = renderFileList([file({ path: 'src/utils/git.ts' })])
    assert.ok(html.includes('data-path="src/utils/git.ts"'))
  })

  it('should escape special characters in the file path', () => {
    const html = renderFileList([file({ path: 'src/<x>.ts' })])
    assert.ok(html.includes('data-path="src/&lt;x&gt;.ts"'))
    assert.ok(!html.includes('<x>'))
  })

  it('should split path into directory and filename', () => {
    const html = renderFileList([file({ path: 'src/utils/git.ts' })])
    assert.ok(html.includes('<span class="file-dir">src/utils/</span>git.ts'))
  })

  it('should render filename without dir for root-level files', () => {
    const html = renderFileList([file({ path: 'README.md' })])
    assert.ok(html.includes('<span class="file-dir"></span>README.md'))
  })

  it('should render addition stats when additions > 0', () => {
    const html = renderFileList([file({ additions: 5, deletions: 0 })])
    assert.ok(html.includes('<span class="stat-add">+5</span>'))
    assert.ok(!html.includes('stat-del'))
  })

  it('should render deletion stats when deletions > 0', () => {
    const html = renderFileList([file({ additions: 0, deletions: 3 })])
    assert.ok(html.includes('<span class="stat-del">-3</span>'))
    assert.ok(!html.includes('stat-add'))
  })

  it('should omit stats sections when both additions and deletions are 0', () => {
    const html = renderFileList([file({ additions: 0, deletions: 0 })])
    assert.ok(!html.includes('stat-add'))
    assert.ok(!html.includes('stat-del'))
  })

  it('should return empty string for empty file list', () => {
    assert.equal(renderFileList([]), '')
  })
})

describe('renderDiffContent', () => {
  it('should wrap "diff --git" in a diff-header div', () => {
    const html = renderDiffContent('diff --git a/file.ts b/file.ts')
    assert.ok(html.includes('<div class="diff-header">diff --git a/file.ts b/file.ts</div>'))
  })

  it('should wrap @@ hunk lines in hunk-header divs', () => {
    const html = renderDiffContent('diff --git a/x b/x\n@@ -1,3 +1,3 @@')
    assert.ok(html.includes('<div class="hunk-header">@@ -1,3 +1,3 @@</div>'))
  })

  it('should wrap added lines in line-add divs', () => {
    const html = renderDiffContent('diff --git a/x b/x\n+new line')
    assert.ok(html.includes('<div class="line-add">+new line</div>'))
  })

  it('should wrap deleted lines in line-del divs', () => {
    const html = renderDiffContent('diff --git a/x b/x\n-old line')
    assert.ok(html.includes('<div class="line-del">-old line</div>'))
  })

  it('should wrap context lines in line-ctx divs', () => {
    const html = renderDiffContent('diff --git a/x b/x\n unchanged')
    assert.ok(html.includes('<div class="line-ctx"> unchanged</div>'))
  })

  it('should wrap meta lines (index, new file, similarity, rename, Binary) in diff-meta divs', () => {
    const raw = [
      'diff --git a/x b/x',
      'index abc..def 100644',
      'new file mode 100644',
      'deleted file mode 100644',
      'similarity index 90%',
      'rename from old',
      'Binary files differ'
    ].join('\n')
    const html = renderDiffContent(raw)
    assert.ok(html.includes('<div class="diff-meta">index abc..def 100644</div>'))
    assert.ok(html.includes('<div class="diff-meta">new file mode 100644</div>'))
    assert.ok(html.includes('<div class="diff-meta">deleted file mode 100644</div>'))
    assert.ok(html.includes('<div class="diff-meta">similarity index 90%</div>'))
    assert.ok(html.includes('<div class="diff-meta">rename from old</div>'))
    assert.ok(html.includes('<div class="diff-meta">Binary files differ</div>'))
  })

  it('should classify --- and +++ file headers as line-del / line-add (heredado: + y - se evalúan antes)', () => {
    const html = renderDiffContent('diff --git a/x b/x\n--- a/x\n+++ b/x')
    assert.ok(html.includes('<div class="line-del">--- a/x</div>'))
    assert.ok(html.includes('<div class="line-add">+++ b/x</div>'))
  })

  it('should escape HTML in diff lines', () => {
    const html = renderDiffContent('diff --git a/x b/x\n+<script>alert(1)</script>')
    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })

  it('should not emit any wrapper diff-block div', () => {
    const html = renderDiffContent('diff --git a/x b/x\n+a')
    assert.ok(!html.includes('diff-block'))
  })

  it('should ignore lines before the first "diff --git"', () => {
    const html = renderDiffContent('garbage line\nanother\ndiff --git a/x b/x\n+a')
    assert.ok(!html.includes('garbage line'))
    assert.ok(!html.includes('another'))
    assert.ok(html.includes('diff-header'))
    assert.ok(html.includes('line-add'))
  })

  it('should return empty string for empty input', () => {
    assert.equal(renderDiffContent(''), '')
  })

  it('should return empty string when no "diff --git" line is present', () => {
    assert.equal(renderDiffContent('+a\n-b\n unchanged'), '')
  })
})

describe('renderDiffPlaceholders', () => {
  it('should render one diff-block per file', () => {
    const html = renderDiffPlaceholders([file({ path: 'a.ts' }), file({ path: 'b.ts' })])
    const matches = html.match(/class="diff-block"/g)
    assert.equal(matches?.length, 2)
  })

  it('should mark binary files with status="binary"', () => {
    const html = renderDiffPlaceholders([file({ isBinary: true })])
    assert.ok(html.includes('data-diff-status="binary"'))
    assert.ok(html.includes('Binary file'))
    assert.ok(!html.includes('load-large'))
  })

  it('should mark large files with status="large" and a load button', () => {
    const html = renderDiffPlaceholders([
      file({ additions: LARGE_DIFF_LINE_THRESHOLD + 1, deletions: 0 })
    ])
    assert.ok(html.includes('data-diff-status="large"'))
    assert.ok(html.includes('Cargar diff'))
    assert.ok(html.includes('load-large'))
  })

  it('should sum additions and deletions when checking the large threshold', () => {
    const half = Math.floor(LARGE_DIFF_LINE_THRESHOLD / 2)
    const html = renderDiffPlaceholders([file({ additions: half + 1, deletions: half + 1 })])
    assert.ok(html.includes('data-diff-status="large"'))
  })

  it('should mark files at exactly the threshold as idle (boundary check)', () => {
    const html = renderDiffPlaceholders([
      file({ additions: LARGE_DIFF_LINE_THRESHOLD, deletions: 0 })
    ])
    assert.ok(html.includes('data-diff-status="idle"'))
  })

  it('should mark normal files with status="idle"', () => {
    const html = renderDiffPlaceholders([file({ additions: 5, deletions: 5 })])
    assert.ok(html.includes('data-diff-status="idle"'))
    assert.ok(html.includes('Cargando diff'))
  })

  it('should prioritize binary over large (binary file with high line count)', () => {
    const html = renderDiffPlaceholders([
      file({ isBinary: true, additions: LARGE_DIFF_LINE_THRESHOLD + 100, deletions: 0 })
    ])
    assert.ok(html.includes('data-diff-status="binary"'))
    assert.ok(!html.includes('data-diff-status="large"'))
  })

  it('should include the file path in data-diff-path', () => {
    const html = renderDiffPlaceholders([file({ path: 'src/utils/git.ts' })])
    assert.ok(html.includes('data-diff-path="src/utils/git.ts"'))
  })

  it('should escape HTML in the file path', () => {
    const html = renderDiffPlaceholders([file({ path: 'src/<x>".ts' })])
    assert.ok(html.includes('data-diff-path="src/&lt;x&gt;&quot;.ts"'))
    assert.ok(!html.includes('<x>'))
  })

  it('should return empty string for empty file list', () => {
    assert.equal(renderDiffPlaceholders([]), '')
  })
})
