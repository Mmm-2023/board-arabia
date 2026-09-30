import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCount, parseFunnel, topSource, windowFor, type Bucket } from '../../lib/marketing'
import { fetchMarketingFunnel, fetchMarketingStats } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

export function MarketingHomeCard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [registrations, setRegistrations] = useState<Bucket>(0)
  const [source, setSource] = useState<string | null>(null)
  const [visits, setVisits] = useState<string>('Not live yet')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    const window = windowFor('7', new Date())
    const from = window.from.toISOString()
    const to = window.to.toISOString()
    void Promise.all([fetchMarketingFunnel(from, to, 'all'), fetchMarketingStats(from, to, 'all')]).then(
      ([funnelResult, statsResult]) => {
        if (cancelled) return
        setLoading(false)
        const parsed = funnelResult.data ? parseFunnel(funnelResult.data) : null
        if (funnelResult.error || !parsed) {
          setError(true)
          return
        }
        setRegistrations(parsed.funnel.email_verified)
        setSource(topSource(parsed.sources))
        if (statsResult.status === 'ok' && statsResult.body && typeof statsResult.body === 'object') {
          const visitsValue = (statsResult.body as { visits?: Bucket }).visits
          setVisits(formatCount(visitsValue ?? null))
        } else {
          setVisits('Not live yet')
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <MarketingHomeCardView
      loading={loading}
      error={error}
      visits={visits}
      registrations={formatCount(registrations)}
      source={source}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

export function MarketingHomeCardView({
  loading,
  error,
  visits,
  registrations,
  source,
  onRetry,
  example = false,
}: {
  loading: boolean
  error: boolean
  visits: string
  registrations: string
  source: string | null
  onRetry?: () => void
  example?: boolean
}) {
  const styles = toneClasses('staff')
  return (
    <section aria-label="Marketing, last 7 days" data-card="marketing-home" className={`${styles.panel} mt-6 px-4 py-4`}>
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Marketing, last 7 days</h2>
      {example ? <p className="mt-1 text-[0.75rem] font-semibold tracking-[0.12em] text-[var(--ba-copper)] uppercase">Example data</p> : null}
      {loading ? (
        <div className="mt-3 h-16 bg-[var(--ba-lavender)]/35" aria-hidden="true" />
      ) : error ? (
        <div className="mt-3">
          <p className="text-[0.95rem] text-pearl/75">Marketing counts could not be loaded.</p>
          {onRetry ? (
            <button type="button" className="mt-2 inline-flex min-h-11 items-center underline" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[0.95rem]">
          <div>
            <dt className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">Visits</dt>
            <dd className="mt-1 font-display text-[1.4rem] font-semibold">{visits}</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">Registrations</dt>
            <dd className="mt-1 font-display text-[1.4rem] font-semibold">{registrations}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">Top source</dt>
            <dd className="mt-1">{source || 'No source yet'}</dd>
          </div>
        </dl>
      )}
      <Link
        to="/admin/marketing?range=7"
        className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
      >
        Open Marketing
      </Link>
    </section>
  )
}
