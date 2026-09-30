export type PricingDraft = {
  company: string
  sector: string
  stage: string
  region: string
  asking: string
  revenue: string
  notes: string
}

export function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, '').slice(0, 15)
}

/** Text file body stored for a pricing run. The retention sweep deletes this file. */
export function pricingSourceFromDraft(draft: PricingDraft): string {
  const lines = [
    `Company: ${oneLine(draft.company) || 'Not stated'}`,
    `Sector: ${oneLine(draft.sector) || 'Not stated'}`,
    `Stage: ${oneLine(draft.stage) || 'Not stated'}`,
    `Region: ${oneLine(draft.region) || 'Not stated'}`,
    `Asking figure SAR: ${digitsOnly(draft.asking)}`,
  ]
  const revenue = digitsOnly(draft.revenue)
  if (revenue) lines.push(`Revenue SAR: ${revenue}`)
  for (const note of draft.notes.split('\n')) {
    const trimmed = oneLine(note)
    if (!trimmed) continue
    lines.push(trimmed.toLowerCase().startsWith('public note:') ? trimmed : `Public note: ${trimmed}`)
  }
  return `${lines.join('\n')}\n`
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
}
