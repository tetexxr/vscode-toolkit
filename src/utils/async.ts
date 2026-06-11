/**
 * Maps `items` through an async `fn` with at most `limit` calls in flight.
 * Results keep the input order. Rejections propagate like Promise.all.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) {
        return
      }
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
