/** Single partner category list. The database seed matches this file. */
export type PartnerCategory = {
  slug: string
  name: string
  gloss: string
}

export const PARTNER_CATEGORIES: PartnerCategory[] = [
  {
    slug: 'investment-banking',
    name: 'Investment banking',
    gloss: 'Coverage, mandates, and sell-side work.',
  },
  {
    slug: 'private-equity',
    name: 'Private equity',
    gloss: 'Firms acquiring or governing companies.',
  },
  {
    slug: 'venture-capital',
    name: 'Venture capital',
    gloss: 'Funds backing companies that will need boards.',
  },
  {
    slug: 'family-offices',
    name: 'Family offices',
    gloss: 'Principals investing their own capital.',
  },
  {
    slug: 'sovereign-and-development-finance',
    name: 'Sovereign and development finance',
    gloss: 'Public and development capital with a Saudi nexus.',
  },
  {
    slug: 'asset-management',
    name: 'Asset management',
    gloss: 'Long-only and alternative managers.',
  },
  {
    slug: 'private-credit-and-direct-lending',
    name: 'Private credit and direct lending',
    gloss: 'Lenders inside a capital structure.',
  },
  {
    slug: 'mergers-and-acquisitions-advisory',
    name: 'Mergers and acquisitions advisory',
    gloss: 'Boutiques running a live process.',
  },
  {
    slug: 'equity-and-debt-capital-markets',
    name: 'Equity and debt capital markets',
    gloss: 'Issuance for companies and funds.',
  },
  {
    slug: 'project-and-infrastructure-finance',
    name: 'Project and infrastructure finance',
    gloss: 'Capital for long-lived assets.',
  },
  {
    slug: 'custody-escrow-and-fund-administration',
    name: 'Custody, escrow, and fund administration',
    gloss: 'The pipes a closing actually uses.',
  },
  {
    slug: 'placement-and-capital-introduction',
    name: 'Placement and capital introduction',
    gloss: 'Raising a fund from the right rooms.',
  },
  {
    slug: 'transaction-counsel',
    name: 'Transaction counsel',
    gloss: 'Counsel on the transaction itself.',
  },
  {
    slug: 'financial-due-diligence-and-tax',
    name: 'Financial due diligence and tax',
    gloss: 'The work that sits under a price.',
  },
  {
    slug: 'corporate-finance-advisory',
    name: 'Corporate finance advisory',
    gloss: 'Independent advice to boards and owners.',
  },
]

export function presentPartnerCategories(raw: unknown): PartnerCategory[] {
  if (!Array.isArray(raw)) return []
  const rows: PartnerCategory[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const gloss = typeof row.gloss === 'string' ? row.gloss.trim() : ''
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || name.length < 1 || name.length > 120) continue
    if (gloss.length < 1 || gloss.length > 200) continue
    rows.push({ slug, name, gloss })
  }
  return rows
}
