import { strict as assert } from 'assert'
import type * as vscode from 'vscode'
import { dropOverlappingEdits } from '../../src/utils/edits'

// Minimal stand-ins for vscode.Position / vscode.Range — the function only
// uses start.compareTo and start.isBefore(end).
class FakePosition {
  constructor(public readonly offset: number) {}
  compareTo(other: FakePosition): number {
    return this.offset - other.offset
  }
  isBefore(other: FakePosition): boolean {
    return this.offset < other.offset
  }
}

function edit(start: number, end: number, replacement = ''): { range: vscode.Range; replacement: string } {
  return {
    range: { start: new FakePosition(start), end: new FakePosition(end) } as unknown as vscode.Range,
    replacement
  }
}

function spans(edits: Array<{ range: vscode.Range }>): Array<[number, number]> {
  return edits.map(e => [
    (e.range.start as unknown as FakePosition).offset,
    (e.range.end as unknown as FakePosition).offset
  ])
}

describe('utils/edits', () => {
  describe('dropOverlappingEdits', () => {
    it('should keep non-overlapping edits in position order', () => {
      const result = dropOverlappingEdits([edit(10, 20), edit(0, 5)])
      assert.deepEqual(spans(result), [
        [0, 5],
        [10, 20]
      ])
    })

    it('should collapse identical ranges to one', () => {
      const result = dropOverlappingEdits([edit(3, 8, 'a'), edit(3, 8, 'b')])
      assert.equal(result.length, 1)
    })

    it('should drop a range that overlaps the previous one', () => {
      const result = dropOverlappingEdits([edit(0, 10), edit(5, 15), edit(20, 25)])
      assert.deepEqual(spans(result), [
        [0, 10],
        [20, 25]
      ])
    })

    it('should keep merely adjacent ranges', () => {
      const result = dropOverlappingEdits([edit(0, 5), edit(5, 10)])
      assert.equal(result.length, 2)
    })

    it('should return an empty array for no edits', () => {
      assert.deepEqual(dropOverlappingEdits([]), [])
    })
  })
})
