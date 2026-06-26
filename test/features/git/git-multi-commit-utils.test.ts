import { strict as assert } from 'assert'
import { computePrechecked, StagedRepo } from '../../../src/features/git/git-multi-commit-utils'

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
