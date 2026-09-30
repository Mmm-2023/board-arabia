import type { HistoryItem } from './dueDiligence.ts'
import { reportListTitle } from './recentReports.ts'

export type PriorNote = HistoryItem & { title: string }

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
