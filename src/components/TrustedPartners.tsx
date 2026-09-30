import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExampleMark } from './ExampleMark'
import { presentPartnerList, schemaMissing, type PartnerCard } from '../lib/demoRows'

const EXAMPLE_PARTNERS: PartnerCard[] = [
  {
    id: 'a4000001-0000-4000-8000-000000000001',
    is_demo: true,
    name: 'Qaf Ledger',
    blurb: 'Custody and fund administration for Gulf closings.',
    monogram: 'QL',
  },
  {
    id: 'a4000001-0000-4000-8000-000000000002',
    is_demo: true,
    name: 'Mirsad Advisory',
    blurb: 'Independent corporate finance advice to boards.',
    monogram: 'MA',
  },
  {
    id: 'a4000001-0000-4000-8000-000000000003',
    is_demo: true,
    name: 'Dar Escrow House',
    blurb: 'Escrow and settlement for private transactions.',
    monogram: 'DE',
  },
]
import { supabase } from '../lib/supabase'
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

  return (
    <TrustedPartnersGallery
      state={state}
      onRetry={() => {
        setState({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
    />
  )
}

export function TrustedPartnersGallery({
  state,
  onRetry,
}: {
  state: LoadState
  onRetry?: () => void
}) {
  const loaded = state.status === 'ready' ? state.partners : []
  const partners = loaded.length > 0 ? loaded : EXAMPLE_PARTNERS

  return (
    <section id="partners" className="border-t border-ink/10 bg-pearl py-5 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Eyebrow>Trusted Partners</Eyebrow>
        <DisplayHeading compact className="max-w-3xl">
          Three seats a year.
        </DisplayHeading>
        <p className="ba-quiet mt-3 max-w-xl text-[0.9375rem] leading-relaxed">
          Three annual seats for firms on the finance rails of a deal, not a wall of logos.
        </p>

        <ul className="mt-3 grid gap-2 md:mt-5 md:grid-cols-3 md:gap-3" aria-busy={state.status === 'loading' ? true : undefined}>
          {partners.map((partner) => (
            <li key={partner.id} className="ba-card px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center bg-[var(--ba-indigo-deep)] font-display text-[0.95rem] font-semibold text-[var(--ba-porcelain)]"
                >
                  {partner.monogram}
                </div>
                {partner.is_demo ? <ExampleMark /> : null}
              </div>
              <h3 className="mt-3 font-display text-[1.05rem] font-semibold tracking-[-0.03em]">
                {partner.name}
              </h3>
              <p className="ba-quiet mt-1 text-[0.875rem] leading-relaxed">{partner.blurb}</p>
            </li>
          ))}
        </ul>

        {state.status === 'error' ? (
          <p className="ba-quiet mt-3 text-[0.875rem]" role="alert">
            Could not load partners.{' '}
            {onRetry ? (
              <button type="button" onClick={onRetry} className="ba-textlink inline-flex min-h-11 items-center">
                Retry
              </button>
            ) : null}
          </p>
        ) : null}

        <Link to="/partners" className="ba-secondary mt-4 inline-flex min-h-11 items-center justify-center px-5 text-[0.9375rem] font-semibold">
          Partner with us
        </Link>
      </div>
    </section>
  )
}
