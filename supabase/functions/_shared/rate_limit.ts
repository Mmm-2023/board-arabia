export type RateRow = { windowStartMs: number; hitCount: number } | null

export type RateNext = {
  limited: boolean
  windowStartMs: number
  hitCount: number
}

/** Same window shape as apply_rate_limits: reset after the window, stop at max. */
export function nextRateHit(row: RateRow, nowMs: number, windowMs: number, max: number): RateNext {
  if (!row || nowMs - row.windowStartMs >= windowMs) {
    return { limited: false, windowStartMs: nowMs, hitCount: 1 }
  }
  if (row.hitCount >= max) {
    return { limited: true, windowStartMs: row.windowStartMs, hitCount: row.hitCount }
  }
  return { limited: false, windowStartMs: row.windowStartMs, hitCount: row.hitCount + 1 }
}

type RateAdmin = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { window_start: string; hit_count: number } | null
          error: { message: string } | null
        }>
      }
    }
    insert: (row: { rate_key: string; window_start: string; hit_count: number }) => PromiseLike<{
      error: { message: string } | null
    }>
    update: (row: { window_start: string; hit_count: number }) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export async function bumpKeyedLimit(
  admin: RateAdmin,
  table: string,
  key: string,
  windowMs: number,
  max: number,
  nowMs = Date.now(),
): Promise<'ok' | 'limited' | 'error'> {
  const { data, error } = await admin
    .from(table)
    .select('window_start, hit_count')
    .eq('rate_key', key)
    .maybeSingle()
  if (error) return 'error'
  const row = data
    ? { windowStartMs: new Date(data.window_start).getTime(), hitCount: data.hit_count }
    : null
  const next = nextRateHit(row, nowMs, windowMs, max)
  if (!data) {
    const inserted = await admin.from(table).insert({
      rate_key: key,
      window_start: new Date(next.windowStartMs).toISOString(),
      hit_count: next.hitCount,
    })
    if (inserted.error) return 'error'
    return next.limited ? 'limited' : 'ok'
  }
  if (next.limited && next.hitCount === data.hit_count && next.windowStartMs === row?.windowStartMs) {
    return 'limited'
  }
  const updated = await admin
    .from(table)
    .update({
      window_start: new Date(next.windowStartMs).toISOString(),
      hit_count: next.hitCount,
    })
    .eq('rate_key', key)
  if (updated.error) return 'error'
  return next.limited ? 'limited' : 'ok'
}
