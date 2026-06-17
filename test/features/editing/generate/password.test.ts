import { strict as assert } from 'assert'
import {
  AMBIGUOUS,
  buildPool,
  classPools,
  estimateStrength,
  generatePassword,
  type PasswordOptions
} from '../../../../src/features/editing/generate/password-utils'

const base: PasswordOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: false,
  excludeAmbiguous: false,
  excludeChars: '',
  requireEachClass: false
}

/** Deterministic RNG cycling 0,1,2,… for reproducible tests. */
function counterRng(): (max: number) => number {
  let c = 0
  return (max: number) => c++ % max
}

describe('classPools / buildPool', () => {
  it('should include only the selected classes', () => {
    const pools = classPools({ ...base, symbols: false })
    assert.equal(pools.length, 3)
    assert.equal(buildPool({ ...base, uppercase: false, digits: false, symbols: false }), 'abcdefghijklmnopqrstuvwxyz')
  })

  it('should drop ambiguous characters when requested', () => {
    const pool = buildPool({ ...base, excludeAmbiguous: true })
    for (const ch of AMBIGUOUS) {
      assert.ok(!pool.includes(ch), `pool should not contain "${ch}"`)
    }
  })

  it('should drop custom excluded characters', () => {
    const pool = buildPool({ ...base, excludeChars: 'abc' })
    assert.ok(!pool.includes('a') && !pool.includes('b') && !pool.includes('c'))
  })
})

describe('generatePassword', () => {
  it('should produce a password of the requested length', () => {
    const result = generatePassword(base, counterRng())
    assert.equal(result.password.length, 16)
  })

  it('should only use characters from the pool', () => {
    const pool = buildPool(base)
    const result = generatePassword(base, counterRng())
    for (const ch of result.password) {
      assert.ok(pool.includes(ch))
    }
  })

  it('should include each class when requireEachClass is set', () => {
    const result = generatePassword({ ...base, requireEachClass: true, length: 6 }, () => 0)
    assert.match(result.password, /[a-z]/)
    assert.match(result.password, /[A-Z]/)
    assert.match(result.password, /[0-9]/)
  })

  it('should compute exact entropy from length and pool size', () => {
    // lowercase+uppercase+digits = 62 chars, length 16 → 16 * log2(62) ≈ 95
    const result = generatePassword(base, counterRng())
    assert.equal(result.poolSize, 62)
    assert.equal(result.entropyBits, Math.round(16 * Math.log2(62)))
  })

  it('should return an empty result when no class is selected', () => {
    const result = generatePassword({ ...base, lowercase: false, uppercase: false, digits: false, symbols: false }, counterRng())
    assert.equal(result.password, '')
    assert.equal(result.entropyBits, 0)
  })
})

describe('estimateStrength', () => {
  it('should bucket entropy into labelled scores', () => {
    assert.deepEqual(estimateStrength(20), { label: 'Poor', score: 0 })
    assert.deepEqual(estimateStrength(50), { label: 'Weak', score: 1 })
    assert.deepEqual(estimateStrength(80), { label: 'Good', score: 2 })
    assert.deepEqual(estimateStrength(100), { label: 'Strong', score: 3 })
    assert.deepEqual(estimateStrength(140), { label: 'Excellent', score: 4 })
  })
})
