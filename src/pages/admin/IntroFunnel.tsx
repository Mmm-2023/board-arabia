import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import {
  countsAreZero,
  introFunnelBounds,
  introFunnelDenied,
  introFunnelUpdatedLine,
  presentIntroFunnel,
  presentIntroFunnelPayload,
  type IntroFunnelAudience,
  type IntroFunnelCounts,
  type IntroRangeId,
} from '../../lib/introFunnel'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

const RANGES: { id: IntroRangeId; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '30', label: 'Last 30 days' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'custom', label: 'Custom range' },
]

const STEPS: { key: keyof IntroFunnelCounts; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'met', label: 'Met' },
  { key: 'deal_started', label: 'Deal started' },
]

export function IntroFunnel({ attempt = 0 }: { attempt?: number }) {
  const [range, setRange] = useState<IntroRangeId>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')
  const [customTried, setCustomTried] = useState(false)
  const [counts, setCounts] = useState<IntroFunnelCounts | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [reload, setReload] = useState(0)
  const [now, setNow] = useState(() => new Date())

  const bounds = introFunnelBounds(
    range,
    now,
    range === 'custom' ? appliedFrom : '',
    range === 'custom' ? appliedTo : '',
  )
  const rangeError = range === 'custom' && customTried && !bounds.ok ? bounds.error : ''
  const fromMs = bounds.ok ? bounds.from.getTime() : 0
  const toMs = bounds.ok ? bounds.to.getTime() : 0

  useEffect(() => {
    if (!bounds.ok) {
      setLoading(false)
      setCounts(null)
      return
    }
    let cancelled = false
    const fromIso = bounds.from.toISOString()
    const toIso = bounds.to.toISOString()
    setLoading(true)
    setError('')
    setDenied(false)
    setCounts(null)
    void supabase.rpc('staff_intro_funnel', { p_from: fromIso, p_to: toIso }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      setLoading(false)
      if (rpcError) {
        if (schemaMissing(rpcError.message)) {
          setError('The introduction funnel is not available yet.')
          return
        }
        if (introFunnelDenied(rpcError.message)) {
          setDenied(true)
          return
        }
        setError('Could not load the introduction funnel.')
        return
      }
      const payload = presentIntroFunnelPayload(data)
      if (!payload) {
        setError('Could not load the introduction funnel.')
        return
      }
      setCounts(payload.counts)
      const stamp = payload.updatedAt ? new Date(payload.updatedAt) : new Date()
      setUpdatedAt(Number.isNaN(stamp.getTime()) ? new Date() : stamp)
    })
    return () => {
      cancelled = true
    }
  }, [bounds.ok, fromMs, toMs, reload, attempt])

  return (
    <IntroFunnelView
      range={range}
      customFrom={customFrom}
      customTo={customTo}
      counts={counts}
      loading={loading && bounds.ok}
      error={rangeError || error}
      denied={denied}
      updatedAt={updatedAt}
      onRange={(next) => {
        setNow(new Date())
        setCustomTried(false)
        setRange(next)
        if (next !== 'custom') {
          setAppliedFrom('')
          setAppliedTo('')
        }
      }}
      onCustomFrom={setCustomFrom}
      onCustomTo={setCustomTo}
      onApplyCustom={() => {
        setCustomTried(true)
        setAppliedFrom(customFrom)
        setAppliedTo(customTo)
        setRange('custom')
      }}
      onRetry={() => {
        setNow(new Date())
        setReload((value) => value + 1)
      }}
    />
  )
}

export function IntroFunnelView({
  range,
  customFrom,
  customTo,
  counts,
  loading,
  error,
  denied,
  updatedAt,
  onRange,
  onCustomFrom,
  onCustomTo,
  onApplyCustom,
  onRetry,
  audience = 'staff',
}: {
  range: IntroRangeId
  customFrom: string
  customTo: string
  counts: IntroFunnelCounts | null
  loading: boolean
  error: string
  denied: boolean
  updatedAt: Date | null
  onRange: (range: IntroRangeId) => void
  onCustomFrom: (value: string) => void
  onCustomTo: (value: string) => void
  onApplyCustom: () => void
  onRetry: () => void
  audience?: IntroFunnelAudience
}) {
  const styles = toneClasses('staff')
  const shown = counts ? presentIntroFunnel(counts, audience) : null
  const empty = Boolean(counts && countsAreZero(counts) && !loading && !error && !denied)

  return (
    <section id="intro-funnel" aria-label="Introduction funnel" className="scroll-mt-24 min-w-0 lg:pe-16" data-intro-funnel="">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>Introduction funnel</h2>
      <p className={`mt-2 max-w-2xl text-[0.95rem] leading-relaxed ${styles.muted}`}>
        Each step counts introductions that reached it during this range.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Range">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={range === item.id}
            className={`inline-flex min-h-11 items-center px-3 text-[0.95rem] ${
              range === item.id ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-white/20 text-pearl'
            }`}
            onClick={() => onRange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {range === 'custom' ? (
        <form
          className="mt-4 grid max-w-md gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            onApplyCustom()
          }}
        >
          <label className="block text-[0.95rem] text-pearl/80" htmlFor="intro-funnel-from">
            From
            <input
              id="intro-funnel-from"
              type="date"
              required
              value={customFrom}
              onChange={(event) => onCustomFrom(event.target.value)}
              className="mt-2 w-full min-h-11 border border-white/20 bg-ink px-3 text-[1rem] text-pearl"
              style={{ colorScheme: 'dark' }}
            />
          </label>
          <label className="block text-[0.95rem] text-pearl/80" htmlFor="intro-funnel-to">
            To
            <input
              id="intro-funnel-to"
              type="date"
              required
              value={customTo}
              onChange={(event) => onCustomTo(event.target.value)}
              className="mt-2 w-full min-h-11 border border-white/20 bg-ink px-3 text-[1rem] text-pearl"
              style={{ colorScheme: 'dark' }}
            />
          </label>
          <button type="submit" className="ba-primary inline-flex min-h-11 w-fit items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase">
            Apply range
          </button>
        </form>
      ) : null}
      {denied ? (
        <p className="mt-4 text-[1rem] text-pearl" role="alert">
          This page is for admin.
        </p>
      ) : null}
      {error && !denied ? (
        <div className="mt-4" role="alert">
          <p className={styles.alert}>{error}</p>
          {error.startsWith('Choose') || error.startsWith('Keep') ? null : (
            <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-11 items-center border border-pearl/30 px-4 text-[0.95rem] text-pearl">
              Retry
            </button>
          )}
        </div>
      ) : null}
      {loading && !counts ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading introduction funnel">
          {STEPS.map((step) => (
            <div key={step.key} className={`${styles.panel} min-h-24 px-4 py-4`} />
          ))}
        </div>
      ) : null}
      {shown && !denied ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.key} className={`${styles.panel} min-w-0 px-4 py-4`} data-funnel-step={step.key}>
              <dt className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>{step.label}</dt>
              <dd className="mt-2 font-display text-[1.8rem] font-semibold tracking-[-0.03em] text-pearl" data-funnel-value={step.key}>
                {shown[step.key]}
              </dd>
              {step.key === 'met' && counts && counts.met === 0 ? (
                <p className={`mt-2 text-[0.85rem] leading-relaxed ${styles.muted}`}>Met stays at 0 until members record that they met.</p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
      {empty ? <p className={`mt-4 text-[0.95rem] ${styles.muted}`}>No introductions in this range.</p> : null}
      {updatedAt && !error && !denied ? <p className={`mt-3 text-[0.85rem] ${styles.quiet}`}>{introFunnelUpdatedLine(updatedAt)}</p> : null}
    </section>
  )
}
