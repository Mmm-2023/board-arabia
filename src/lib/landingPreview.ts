/** Public landing cards. Sector, one-line ask, and status only. */

export type LandingDeal = {
  id: string
  is_demo: boolean
  sector: string
  ask: string
  status: string
}

/**
 * First three published W1 sample mandates, clear fields only.
 * The server returns the same shape from list_landing_preview_deals.
 */
export const LANDING_PREVIEW_EXAMPLES: LandingDeal[] = [
  {
    id: 'a2000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Energy transition',
    ask: 'Growth capital for a Saudi industrial services platform.',
    status: 'Diligence',
  },
  {
    id: 'a2000001-0000-4000-8000-000000000002',
    is_demo: true,
    sector: 'Health',
    ask: 'A control stake in a private clinic network along the west coast.',
    status: 'Sourcing',
  },
  {
    id: 'a2000001-0000-4000-8000-000000000003',
    is_demo: true,
    sector: 'Tourism',
    ask: 'An advisory seat beside a hospitality operator on the Red Sea.',
    status: 'Closing',
  },
]

const MAX_CARDS = 3

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function safeLine(value: string): boolean {
  if (!value) return false
  if (value.includes('@')) return false
  if (/https?:/i.test(value)) return false
  return true
}

export function presentLandingDeal(raw: unknown): LandingDeal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const sector = text(row.sector, 120)
  const ask = text(row.ask, 280)
  const status = text(row.status, 40)
  if (!id || !safeLine(sector) || !safeLine(ask) || !safeLine(status)) return null
  return {
    id,
    is_demo: row.is_demo === true,
    sector,
    ask,
    status,
  }
}

export function presentLandingDealList(raw: unknown): LandingDeal[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map(presentLandingDeal)
    .filter((row): row is LandingDeal => row != null)
    .slice(0, MAX_CARDS)
}

export function previewIntro(deals: LandingDeal[]): string {
  if (deals.some((deal) => deal.is_demo)) {
    return 'The frame shows the shape of the member dashboard. Sample opportunities are marked Example. It contains no member names and no photographs.'
  }
  if (deals.length === 0) {
    return 'The frame shows the shape of the member dashboard. It contains no member names and no photographs.'
  }
  return 'The frame shows the shape of the member dashboard. Each opportunity lists a sector, an ask, and a status. It contains no member names and no photographs.'
}
