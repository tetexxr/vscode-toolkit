/**
 * Pure password-generation logic. The randomness source is injected so the
 * generator can be unit-tested deterministically; production code passes a
 * CSPRNG-backed function (crypto.randomInt). vscode-free for mocha.
 */

export interface PasswordOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
  /** Drop look-alike characters (I, l, 1, O, 0, o, |). */
  excludeAmbiguous: boolean
  /** Extra characters to exclude from every class. */
  excludeChars: string
  /** Guarantee at least one character from each selected class. */
  requireEachClass: boolean
}

export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/'
export const AMBIGUOUS = 'Il1O0o|'

/** A function returning a uniformly-random integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number

/** The per-class character pools after removing ambiguous / excluded characters. */
export function classPools(options: PasswordOptions): string[] {
  const removed = new Set<string>([...(options.excludeAmbiguous ? AMBIGUOUS : ''), ...options.excludeChars])
  const clean = (chars: string): string => [...chars].filter(c => !removed.has(c)).join('')
  const pools: string[] = []
  if (options.lowercase) {
    pools.push(clean(LOWERCASE))
  }
  if (options.uppercase) {
    pools.push(clean(UPPERCASE))
  }
  if (options.digits) {
    pools.push(clean(DIGITS))
  }
  if (options.symbols) {
    pools.push(clean(SYMBOLS))
  }
  return pools.filter(p => p.length > 0)
}

/** The full character pool (all selected classes combined). */
export function buildPool(options: PasswordOptions): string {
  return classPools(options).join('')
}

export interface GeneratedPassword {
  password: string
  entropyBits: number
  poolSize: number
}

/**
 * Generates a password from the selected classes using `rng` for every choice.
 * With `requireEachClass`, one character of each class is placed first and the
 * result is shuffled so those aren't predictably positioned.
 */
export function generatePassword(options: PasswordOptions, rng: RandomInt): GeneratedPassword {
  const pools = classPools(options)
  const pool = pools.join('')
  if (pool.length === 0 || options.length <= 0) {
    return { password: '', entropyBits: 0, poolSize: pool.length }
  }
  const chars: string[] = []
  if (options.requireEachClass) {
    for (const p of pools) {
      if (chars.length < options.length) {
        chars.push(p[rng(p.length)])
      }
    }
  }
  while (chars.length < options.length) {
    chars.push(pool[rng(pool.length)])
  }
  // Fisher-Yates shuffle so required-class characters aren't front-loaded.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rng(i + 1)
    const tmp = chars[i]
    chars[i] = chars[j]
    chars[j] = tmp
  }
  const entropyBits = Math.round(options.length * Math.log2(pool.length))
  return { password: chars.join(''), entropyBits, poolSize: pool.length }
}

export interface Strength {
  label: string
  /** 0 (Poor) … 4 (Excellent), for a five-segment meter. */
  score: number
}

/** Maps exact entropy (bits) to a strength label and a 0–4 score. */
export function estimateStrength(entropyBits: number): Strength {
  if (entropyBits < 40) {
    return { label: 'Poor', score: 0 }
  }
  if (entropyBits < 64) {
    return { label: 'Weak', score: 1 }
  }
  if (entropyBits < 96) {
    return { label: 'Good', score: 2 }
  }
  if (entropyBits < 128) {
    return { label: 'Strong', score: 3 }
  }
  return { label: 'Excellent', score: 4 }
}
