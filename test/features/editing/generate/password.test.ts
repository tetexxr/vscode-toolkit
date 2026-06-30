import { strict as assert } from 'assert'
import {
  AMBIGUOUS,
  analyzePassword,
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

describe('analyzePassword', () => {
  it('should return zero for an empty password', () => {
    const result = analyzePassword('')
    assert.equal(result.password, '')
    assert.equal(result.poolSize, 0)
    assert.equal(result.entropyBits, 0)
  })

  it('should infer the pool from the classes present', () => {
    assert.equal(analyzePassword('abcdef').poolSize, 26)
    assert.equal(analyzePassword('ABCabc').poolSize, 52)
    assert.equal(analyzePassword('Abc123').poolSize, 62)
    // lowercase + uppercase + digits + symbols = 26 + 26 + 10 + 26
    assert.equal(analyzePassword('Abc123!@').poolSize, 88)
  })

  it('should compute entropy as length × log2(poolSize)', () => {
    const result = analyzePassword('abcdefghij') // 10 lowercase chars, pool 26
    assert.equal(result.poolSize, 26)
    assert.equal(result.entropyBits, Math.round(10 * Math.log2(26)))
  })

  it('should credit each distinct out-of-class character once', () => {
    // two lowercase + two distinct unknown chars (space, é) → pool 26 + 2
    assert.equal(analyzePassword('ab é').poolSize, 26 + 2)
    // repeated unknown chars are not double-counted
    assert.equal(analyzePassword('a   ').poolSize, 26 + 1)
  })

  it('should preserve the analysed password on the result', () => {
    assert.equal(analyzePassword('Hunter2!').password, 'Hunter2!')
  })

  it('should agree with generatePassword when every class is present', () => {
    // An all-classes generated password has the same inferred pool as the
    // exact pool, so the meter stays consistent across generate vs. edit.
    const options: PasswordOptions = { ...base, symbols: true, requireEachClass: true, length: 20 }
    const generated = generatePassword(options, (max: number) => max - 1)
    const analysed = analyzePassword(generated.password)
    assert.equal(analysed.poolSize, generated.poolSize)
    assert.equal(analysed.entropyBits, generated.entropyBits)
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
