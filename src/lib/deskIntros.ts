export type DeskIntroRow = {
  id: string
  requester_name: string
  target_name: string
  reason: string
  desk_status: 'queued' | 'sent'
  desk_note: string
  is_demo: boolean
}

export function presentDeskIntros(raw: unknown): DeskIntroRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const requester = typeof row.requester_name === 'string' ? row.requester_name.trim() : ''
    const target = typeof row.target_name === 'string' ? row.target_name.trim() : ''
    const status = row.desk_status === 'sent' ? 'sent' : row.desk_status === 'queued' ? 'queued' : null
    if (!id || !requester || !target || !status) return []
    if (requester.includes('@') || target.includes('@')) return []
    const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
    if (reason.includes('@')) return []
    const note = typeof row.desk_note === 'string' ? row.desk_note.trim() : ''
    return [
      {
        id,
        requester_name: requester,
        target_name: target,
        reason,
        desk_status: status,
        desk_note: note.includes('@') ? '' : note,
        is_demo: row.is_demo === true,
      },
    ]
  })
}
