export type ReIntroRow = {
  id: string
  sector: string
  city: string
  asset_class: string
  counterparty_name: string
  member_name: string
}

export function parseReIntros(raw: unknown): ReIntroRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const counterparty = typeof row.counterparty_name === 'string' ? row.counterparty_name.trim() : ''
    const sector = typeof row.sector === 'string' ? row.sector.trim() : ''
    const city = typeof row.city === 'string' ? row.city.trim() : ''
    const asset = typeof row.asset_class === 'string' ? row.asset_class.trim() : ''
    const member = typeof row.member_name === 'string' ? row.member_name.trim() : ''
    if (!id || !counterparty) return []
    return [
      {
        id,
        counterparty_name: counterparty,
        sector,
        city,
        asset_class: asset,
        member_name: member || 'Member',
      },
    ]
  })
}
