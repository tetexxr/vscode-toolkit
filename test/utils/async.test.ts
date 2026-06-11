import { strict as assert } from 'assert'
import { mapWithConcurrency } from '../../src/utils/async'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('utils/async', () => {
  describe('mapWithConcurrency', () => {
    it('should map every item preserving input order', async () => {
      const result = await mapWithConcurrency([3, 1, 2], 2, async n => {
        await sleep(n)
        return n * 10
      })
      assert.deepEqual(result, [30, 10, 20])
    })

    it('should never exceed the concurrency limit', async () => {
      let inFlight = 0
      let peak = 0
      await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await sleep(5)
        inFlight--
      })
      assert.ok(peak <= 4, `peak concurrency was ${peak}`)
    })

    it('should handle an empty input', async () => {
      assert.deepEqual(await mapWithConcurrency([], 8, async () => 1), [])
    })

    it('should handle a limit larger than the input', async () => {
      const result = await mapWithConcurrency([1, 2], 100, async n => n + 1)
      assert.deepEqual(result, [2, 3])
    })

    it('should treat a limit below one as one', async () => {
      const result = await mapWithConcurrency([1, 2, 3], 0, async n => n)
      assert.deepEqual(result, [1, 2, 3])
    })

    it('should propagate rejections', async () => {
      await assert.rejects(
        () =>
          mapWithConcurrency([1, 2], 2, async n => {
            if (n === 2) {
              throw new Error('boom')
            }
            return n
          }),
        /boom/
      )
    })
  })
})
