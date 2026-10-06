import { useEffect, useState } from 'react'
import { PartnerLogo } from '../../components/TrustedPartners'
import { schemaMissing } from '../../lib/demoRows'
import { isPartnerLogoPath } from '../../lib/partnerLogo'
import { SPONSOR_LABEL } from '../../lib/sponsorLabel'
import { usePartnerCategories } from '../../lib/usePartnerCategories'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, FormSkeleton } from '../../shell/ViewState'

type ShowcaseCard = {
  id: string
  name: string
  blurb: string
  offer: string | null
  monogram: string
  logo_path: string | null
  category_slug: string | null
  my_request: 'pending' | 'approved' | 'declined' | null
}

type Counts = { pending: number; approved: number }

export function SponsorShowcasePage({
  preview,
}: {
  preview?: { cards: ShowcaseCard[]; counts: Counts | null }
} = {}) {
  useNoIndex('Sponsors | Board Arabia')
  const categories = usePartnerCategories()
  const [cards, setCards] = useState<ShowcaseCard[] | null>(preview?.cards ?? null)
  const [counts, setCounts] = useState<Counts | null>(preview?.counts ?? null)
  const [error, setError] = useState(false)
  const [category, setCategory] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void Promise.all([supabase.rpc('list_sponsor_showcase'), supabase.rpc('sponsor_intro_counts')]).then(
      ([list, count]) => {
        if (cancelled) return
        if (list.error) {
          if (schemaMissing(list.error.message)) {
            setCards([])
            setError(false)
            return
          }
          setError(true)
          setCards([])
          return
        }
        setError(false)
        setCards(parseShowcase(list.data))
        setCounts(parseCounts(count.data))
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt, preview])

  async function requestIntro(id: string) {
    setBusyId(id)
    const { error: rpcError } = await supabase.rpc('request_sponsor_intro', { p_partner_id: id })
    setBusyId(null)
    if (rpcError) {
      setError(true)
      return
    }
    setAttempt((value) => value + 1)
  }

  const names = new Map(categories.map((item) => [item.slug, item.name]))
  const slugs = categories.map((item) => item.slug).filter((slug) => (cards ?? []).some((card) => card.category_slug === slug))
  const shown = (cards ?? []).filter((card) => !category || card.category_slug === category)

  return (
    <div className="max-w-3xl" data-sponsor-showcase="">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">{SPONSOR_LABEL}</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">{SPONSOR_LABEL} showcase</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        Logo, one line, and what they offer. Request an intro and our admin team reviews it. This page does not share contact details.
      </p>

      {counts ? (
        <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Intro counts">
          <article className="border border-[var(--ba-line)] bg-white px-4 py-4">
            <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Pending</p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">{counts.pending}</p>
          </article>
          <article className="border border-[var(--ba-line)] bg-white px-4 py-4">
            <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Approved</p>
            <p className="mt-2 font-display text-[1.6rem] font-semibold">{counts.approved}</p>
          </article>
          <p className="text-[0.92rem] text-ink/60 sm:col-span-2">Names stay off this count.</p>
        </section>
      ) : null}

      {error ? (
        <div className="mt-6">
          <ErrorBanner tone="member" message="Could not load the showcase." retryLabel="Retry" onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      ) : null}

      {cards == null ? <div className="mt-6"><FormSkeleton tone="member" /></div> : null}

      {slugs.length > 1 ? (
        <div className="mt-6 max-w-xs">
          <label htmlFor="showcase-category" className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase">
            Category
          </label>
          <select
            id="showcase-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-2 w-full min-h-11 border border-ink/15 bg-white px-3 text-[1rem]"
          >
            <option value="">All</option>
            {slugs.map((slug) => (
              <option key={slug} value={slug}>
                {names.get(slug) ?? slug}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {cards && shown.length === 0 && !error ? (
        <p className="mt-6 text-[1rem] text-ink/70">No sponsor is listed yet.</p>
      ) : null}

      <ul className="mt-6 space-y-3">
        {shown.map((card) => (
          <li key={card.id} className="border border-[var(--ba-line)] bg-white px-4 py-4" data-sponsor-card={card.name}>
            <div className="flex items-start gap-3">
              <PartnerLogo name={card.name} monogram={card.monogram} logoPath={card.logo_path} />
              <div className="min-w-0">
                <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">{card.name}</h2>
                <p className="mt-1 text-[0.98rem] text-ink/75">{card.blurb}</p>
                {card.offer ? <p className="mt-2 text-[0.95rem] text-ink/70">{card.offer}</p> : null}
              </div>
            </div>
            <div className="mt-4">
              {card.my_request === 'pending' ? <p className="text-[0.95rem] text-ink/70">Pending admin review.</p> : null}
              {card.my_request === 'approved' ? (
                <p className="text-[0.95rem] text-ink/70">Approved. Our admin team will make the introduction.</p>
              ) : null}
              {card.my_request === 'declined' ? <p className="text-[0.95rem] text-ink/70">Declined.</p> : null}
              {card.my_request == null ? (
                <button
                  type="button"
                  disabled={busyId === card.id}
                  onClick={() => void requestIntro(card.id)}
                  className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
                >
                  Request an intro
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function parseShowcase(raw: unknown): ShowcaseCard[] {
  if (!Array.isArray(raw)) return []
  const rows: ShowcaseCard[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name : ''
    const blurb = typeof row.blurb === 'string' ? row.blurb : ''
    const monogram = typeof row.monogram === 'string' ? row.monogram : ''
    if (!id || !name || !blurb || !monogram) continue
    const request = row.my_request
    rows.push({
      id,
      name,
      blurb,
      offer: typeof row.offer === 'string' ? row.offer : null,
      monogram,
      logo_path: isPartnerLogoPath(typeof row.logo_path === 'string' ? row.logo_path : null) ? String(row.logo_path) : null,
      category_slug: typeof row.category_slug === 'string' ? row.category_slug : null,
      my_request: request === 'pending' || request === 'approved' || request === 'declined' ? request : null,
    })
  }
  return rows
}

function parseCounts(raw: unknown): Counts | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.pending !== 'number' || typeof row.approved !== 'number') return null
  return { pending: row.pending, approved: row.approved }
}
