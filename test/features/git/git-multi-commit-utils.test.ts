import { strict as assert } from 'assert'
import {
  autoSelectedTargets,
  computePrechecked,
  selectedRootsFromArgs,
  StagedRepo
} from '../../../src/features/git/git-multi-commit-utils'

function sourceControl(fsPath: string): unknown {
  return { rootUri: { fsPath } }
}

function repo(selectedInScm: boolean): StagedRepo {
  return { selectedInScm }
}

describe('computePrechecked', () => {
  it('should pre-check every candidate when none is selected in SCM', () => {
    const result = computePrechecked([repo(false), repo(false), repo(false)])
    assert.deepEqual(result, [true, true, true])
  })

  it('should pre-check only the SCM-selected candidates when some are selected', () => {
    const result = computePrechecked([repo(true), repo(false), repo(true)])
    assert.deepEqual(result, [true, false, true])
  })

  it('should pre-check the single SCM-selected candidate when only one is selected', () => {
    const result = computePrechecked([repo(false), repo(true)])
    assert.deepEqual(result, [false, true])
  })

  it('should return an empty array when there are no candidates', () => {
    assert.deepEqual(computePrechecked([]), [])
  })
})

describe('autoSelectedTargets', () => {
  it('should return the selected candidates when two or more are selected in SCM', () => {
    const candidates = [repo(true), repo(false), repo(true)]
    assert.deepEqual(autoSelectedTargets(candidates), [candidates[0], candidates[2]])
  })

  it('should return null when only one candidate is selected in SCM', () => {
    assert.equal(autoSelectedTargets([repo(true), repo(false)]), null)
  })

  it('should return null when no candidate is selected in SCM', () => {
    assert.equal(autoSelectedTargets([repo(false), repo(false)]), null)
  })

  it('should return null when there are no candidates', () => {
    assert.equal(autoSelectedTargets([]), null)
  })

  it('should return every candidate when all are selected in SCM', () => {
    const candidates = [repo(true), repo(true), repo(true)]
    assert.deepEqual(autoSelectedTargets(candidates), candidates)
  })
})

describe('selectedRootsFromArgs', () => {
  it('should return an empty set when there are no args', () => {
    assert.deepEqual([...selectedRootsFromArgs([])], [])
  })

  it('should collect the root of a single SourceControl arg', () => {
    const roots = selectedRootsFromArgs([sourceControl('/repos/a')])
    assert.deepEqual([...roots], ['/repos/a'])
  })

  it('should collect roots from a focused arg plus an array of the full selection', () => {
    const a = sourceControl('/repos/a')
    const b = sourceControl('/repos/b')
    const roots = selectedRootsFromArgs([a, [a, b]])
    assert.deepEqual([...roots].sort(), ['/repos/a', '/repos/b'])
  })

  it('should deduplicate repeated roots', () => {
    const roots = selectedRootsFromArgs([sourceControl('/repos/a'), sourceControl('/repos/a')])
    assert.deepEqual([...roots], ['/repos/a'])
  })

  it('should tolerate nested arrays', () => {
    const roots = selectedRootsFromArgs([[[sourceControl('/repos/a')], sourceControl('/repos/b')]])
    assert.deepEqual([...roots].sort(), ['/repos/a', '/repos/b'])
  })

  it('should ignore args without a usable rootUri', () => {
    const roots = selectedRootsFromArgs([undefined, null, {}, { rootUri: {} }, { rootUri: { fsPath: 42 } }, 'x'])
    assert.deepEqual([...roots], [])
  })
})
