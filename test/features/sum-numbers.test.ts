import { strict as assert } from 'assert'
import { extractLeadingNumbers, sumNumbers, formatSum } from '../../src/features/sum-numbers-utils'

describe('extractLeadingNumbers', () => {
  it('should extract the leading number of each line in a list with descriptions', () => {
    const text = [
      '2,5 h Sprint planning meeting',
      '1,75 h Code review session',
      '0,5 h Daily standup',
      '3 h Backlog grooming'
    ].join('\n')
    assert.deepEqual(extractLeadingNumbers(text), [2.5, 1.75, 0.5, 3])
  })

  it('should ignore numbers that appear inside the line description', () => {
    const text = [
      '4,5 h Migrate auth service to support up to 500 concurrent sessions',
      '2 h Patch module 3 of the billing pipeline'
    ].join('\n')
    assert.deepEqual(extractLeadingNumbers(text), [4.5, 2])
  })

  it('should handle a clean list of numbers', () => {
    assert.deepEqual(extractLeadingNumbers('8\n6,5\n4,25\n2'), [8, 6.5, 4.25, 2])
  })

  it('should handle dot decimals', () => {
    assert.deepEqual(extractLeadingNumbers('1.5\n2.25\n3.0'), [1.5, 2.25, 3.0])
  })

  it('should handle leading whitespace before the number', () => {
    assert.deepEqual(extractLeadingNumbers('   1,25 h kickoff call\n\t0,75 h retro'), [1.25, 0.75])
  })

  it('should handle a single line starting with a number', () => {
    assert.deepEqual(extractLeadingNumbers('40 hours allocated to onboarding'), [40])
  })

  it('should extract a leading negative number', () => {
    assert.deepEqual(extractLeadingNumbers('-2,5 h budget rollback'), [-2.5])
  })

  it('should skip lines that do not start with a number', () => {
    const text = ['Project kickoff', '3 h Architecture design', '   ', 'TBD', '1,5 h Risk review'].join('\n')
    assert.deepEqual(extractLeadingNumbers(text), [3, 1.5])
  })

  it('should return empty array when no line starts with a number', () => {
    assert.deepEqual(extractLeadingNumbers('Project kickoff\nNotes only'), [])
  })

  it('should handle CRLF line endings', () => {
    assert.deepEqual(extractLeadingNumbers('5 h QA pass\r\n2,5 h release notes'), [5, 2.5])
  })
})

describe('sumNumbers', () => {
  it('should sum a list of decimal values', () => {
    assert.equal(sumNumbers([2.5, 1.75, 0.5, 0.25]), 5)
  })

  it('should return 0 for an empty list', () => {
    assert.equal(sumNumbers([]), 0)
  })

  it('should round floating-point artifacts', () => {
    assert.equal(sumNumbers([0.1, 0.2]), 0.3)
  })
})

describe('formatSum', () => {
  it('should use comma as decimal separator', () => {
    assert.equal(formatSum(7.5), '7,5')
  })

  it('should format integers without a decimal separator', () => {
    assert.equal(formatSum(12), '12')
  })

  it('should format negative values', () => {
    assert.equal(formatSum(-3.25), '-3,25')
  })
})
