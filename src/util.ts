export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, x) => a + x, 0) / xs.length
}

export function stdDev(xs: number[]): number {
  if (xs.length <= 1) return 0
  const mean = avg(xs)
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await fn(items[i]!, i)
    }
  }
  const count = Math.min(Math.max(limit, 1), items.length)
  await Promise.all(Array.from({ length: count }, worker))
  return results
}
