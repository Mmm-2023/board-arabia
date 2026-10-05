import type { HistoryItem } from './dueDiligence.ts'
import { reportListTitle } from './recentReports.ts'

export type PriorNote = HistoryItem & { title: string }

export type PriorNoteGroup = {
  key: string
  latest: PriorNote
  earlier: PriorNote[]
}

/** One row per job, with the same title cleanup as Recent reports. */
export function priorNotes(items: readonly HistoryItem[]): PriorNote[] {
  const seen = new Set<string>()
  const rows: PriorNote[] = []
  for (const item of items) {
    const job = (item.job_id || '').trim() || item.id
    if (seen.has(job)) continue
    seen.add(job)
    rows.push({
      ...item,
      title: reportListTitle(item.company_label || '', item.file_name || ''),
    })
  }
  return rows
}

/** Same company, ignoring case and punctuation, so repeat runs share one row. */
export function companyNoteKey(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return key || 'due diligence report'
}

export function earlierRunsLabel(count: number): string {
  if (count === 1) return '1 earlier run'
  return `${count} earlier runs`
}

/**
 * Newest run for a company stays on the row. Earlier runs of that company
 * sit behind "N earlier runs". Input order is newest first.
 */
export function groupPriorNotes(items: readonly HistoryItem[]): PriorNoteGroup[] {
  const groups: PriorNoteGroup[] = []
  const index = new Map<string, PriorNoteGroup>()
  for (const note of priorNotes(items)) {
    const key = companyNoteKey(note.title)
    const found = index.get(key)
    if (!found) {
      const group: PriorNoteGroup = { key, latest: note, earlier: [] }
      index.set(key, group)
      groups.push(group)
      continue
    }
    found.earlier.push(note)
  }
  return groups
}
