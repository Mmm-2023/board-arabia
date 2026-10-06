export type RiyadhDay = { year: number; month: number; day: number }

export function riyadhDay(iso: string): RiyadhDay | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  if (!year || !month || !day) return null
  return { year, month, day }
}

export function dayKey(day: RiyadhDay): string {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
}

export function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = first.getUTCDay()
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: Array<number | null> = []
  for (let i = 0; i < lead; i += 1) cells.push(null)
  for (let day = 1; day <= count; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  const next = ((index % 12) + 12) % 12
  return { year: Math.floor(index / 12), month: next + 1 }
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
