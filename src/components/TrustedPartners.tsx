import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExampleMark } from './ExampleMark'
import { presentPartnerList, schemaMissing, type PartnerCard } from '../lib/demoRows'
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
  const partners = state.status === 'ready' ? state.partners : []

  return (
    <section id="trusted-partners" className="border-t border-ink/10 bg-pearl py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Eyebrow>Trusted Partners</Eyebrow>
        <DisplayHeading className="max-w-3xl">The finance rails around the room.</DisplayHeading>
        <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink/60">
          Sponsors on the finance rails of a deal. Sample cards, when shown, are marked Example.
        </p>

        {state.status === 'loading' ? (
          <ul aria-busy="true" aria-label="Loading partners" className="mt-12 grid gap-4 md:grid-cols-3">
            {['a', 'b', 'c'].map((id) => (
              <li key={id} className="h-40 animate-pulse bg-[var(--ba-lavender-mist)] motion-reduce:animate-none" />
            ))}
          </ul>
        ) : null}

        {state.status === 'error' ? (
          <div className="mt-10 border border-[var(--ba-line)] bg-white px-5 py-6" role="alert">
            <p className="text-[1.02rem] leading-relaxed text-ink/70">
              Could not load partners.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex min-h-11 items-center border-b border-[var(--ba-copper)] text-[0.78rem] font-semibold tracking-[0.08em] uppercase"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {state.status === 'ready' && partners.length === 0 ? (
          <div className="mt-10 max-w-xl border border-[var(--ba-line)] bg-white px-5 py-6">
            <p className="text-[1.02rem] leading-relaxed text-ink/70">
              No partners are listed yet. Live sponsors appear here after they are admitted.
            </p>
            <Link
              to="/partners"
              className="mt-5 inline-flex min-h-11 items-center text-[0.78rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase"
            >
              Partner with us
            </Link>
          </div>
        ) : null}

        {state.status === 'ready' && partners.length > 0 ? (
          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {partners.map((partner) => (
              <li key={partner.id} className="border border-[var(--ba-line)] bg-white px-5 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div
                    aria-hidden="true"
                    className="flex h-14 w-14 items-center justify-center border border-[var(--ba-copper)] bg-[var(--ba-indigo-deep)] font-display text-[1rem] font-semibold text-[var(--ba-porcelain)]"
                  >
                    {partner.monogram}
                  </div>
                  {partner.is_demo ? <ExampleMark /> : null}
                </div>
                <h3 className="mt-5 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                  {partner.name}
                </h3>
                <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/65">{partner.blurb}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
