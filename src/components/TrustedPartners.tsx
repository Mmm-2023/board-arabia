import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { presentPartnerList, schemaMissing, type PartnerCard } from '../lib/demoRows'
import { partnerLogoPublicUrl, withLogoVersion } from '../lib/partnerLogo'
import { adviserGalleryRows, partnerGalleryRows, publicGalleryPartners, visibleMemberPartners } from '../lib/trustedPartners'
import { usePartnerCategories } from '../lib/usePartnerCategories'
import { supabase } from '../lib/supabase'
import { SampleMark } from './SampleMark'
import { DisplayHeading, Eyebrow } from './Type'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; partners: PartnerCard[] }

export function TrustedPartnersSection() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('list_trusted_partners').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (schemaMissing(error.message)) {
          setState({ status: 'ready', partners: [] })
          return
        }
        setState({ status: 'error' })
        return
      }
      setState({ status: 'ready', partners: presentPartnerList(data) })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (state.status === 'loading') return null
  if (state.status === 'error') return null

  return (
    <TrustedPartnersGallery
      partners={state.partners}
      surface="public"
      onRetry={() => {
        setState({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function TrustedPartnersGallery({
  partners,
  surface,
}: {
  partners: PartnerCard[]
  surface: 'public' | 'member'
  onRetry?: () => void
}) {
  const categories = usePartnerCategories()
  const visible = surface === 'public' ? publicGalleryPartners(partners) : visibleMemberPartners(partners)
  const partnerRows = partnerGalleryRows(visible)
  const adviserRows = adviserGalleryRows(visible)
  const real = visible.some((partner) => !partner.is_demo)
  const [category, setCategory] = useState('')
  const names = useMemo(() => new Map(categories.map((item) => [item.slug, item.name])), [categories])
  const shownPartners = category ? partnerRows.filter((partner) => partner.category_slug === category) : partnerRows
  const filterSlugs = categories
    .map((item) => item.slug)
    .filter((slug) => partnerRows.some((partner) => partner.category_slug === slug))

  if (partnerRows.length === 0 && adviserRows.length === 0) return null

  return (
    <>
      {partnerRows.length > 0 ? (
        <section id="partners" className="border-t border-ink/10 bg-pearl py-5 md:py-10" data-trusted-partners={surface} data-gallery="partners">
          <div className="mx-auto max-w-7xl px-5 md:px-10">
            <Eyebrow>Trusted Partners</Eyebrow>
            <DisplayHeading compact className="max-w-3xl">
              Three seats a year.
            </DisplayHeading>
            <p className="ba-quiet mt-3 max-w-xl text-[0.9375rem] leading-relaxed">
              Three annual seats for firms on the finance rails of a deal, not a wall of logos.
            </p>

            {filterSlugs.length > 1 ? (
              <div className="mt-4 max-w-xs">
                <label htmlFor="trusted-partner-category" className="block text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase">
                  Category
                </label>
                <select
                  id="trusted-partner-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-2 w-full min-h-11 border border-ink/15 bg-white px-3 text-[1rem] text-ink"
                >
                  <option value="">All</option>
                  {filterSlugs.map((slug) => (
                    <option key={slug} value={slug}>
                      {names.get(slug) ?? slug}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <ul className="mt-3 grid gap-2 md:mt-5 md:grid-cols-3 md:gap-3">
              {shownPartners.map((partner) => (
                <li key={partner.id} className="ba-card px-3 py-3" data-partner-name={partner.name}>
                  <div className="flex items-start justify-between gap-3">
                    <PartnerLogo name={partner.name} monogram={partner.monogram} logoPath={partner.logo_path} />
                    {surface === 'member' && partner.is_demo && !real ? <SampleMark /> : null}
                  </div>
                  <h3 className="mt-3 font-display text-[1.05rem] font-semibold tracking-[-0.03em]">{partner.name}</h3>
                  <p className="ba-quiet mt-1 text-[0.875rem] leading-relaxed">{partner.blurb}</p>
                </li>
              ))}
            </ul>

            <Link
              to="/partners"
              data-partner-cta="/partners"
              className="ba-secondary mt-4 inline-flex min-h-11 items-center justify-center px-5 text-[0.9375rem] font-semibold"
            >
              Partner with us
            </Link>
          </div>
        </section>
      ) : null}
      {adviserRows.length > 0 ? (
        <section className="border-t border-ink/10 bg-pearl py-5 md:py-10" data-gallery="advisers">
          <div className="mx-auto max-w-7xl px-5 md:px-10">
            <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Trusted advisers</h2>
            <ul className="mt-3 grid gap-2 md:mt-5 md:grid-cols-3 md:gap-3">
              {adviserRows.map((partner) => (
                <li key={partner.id} className="ba-card px-3 py-3" data-adviser-name={partner.name}>
                  <PartnerLogo name={partner.name} monogram={partner.monogram} logoPath={partner.logo_path} />
                  <h3 className="mt-3 font-display text-[1.05rem] font-semibold tracking-[-0.03em]">{partner.name}</h3>
                  <p className="ba-quiet mt-1 text-[0.875rem] leading-relaxed">{partner.blurb}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  )
}

export function PartnerLogo({
  name,
  monogram,
  logoPath,
  logoVersion,
}: {
  name: string
  monogram: string
  logoPath: string | null
  /** Admin preview cache bust. Public tiles omit this. */
  logoVersion?: number
}) {
  const [failed, setFailed] = useState(false)
  const base = !failed ? partnerLogoPublicUrl(logoPath, String(import.meta.env.VITE_SUPABASE_URL || '')) : null
  const src = withLogoVersion(base, logoVersion)
  if (!src) {
    return (
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center bg-[var(--ba-indigo-deep)] font-display text-[0.95rem] font-semibold text-[var(--ba-porcelain)]"
      >
        {monogram}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 border border-ink/15 bg-white object-contain"
      onError={() => setFailed(true)}
    />
  )
}
