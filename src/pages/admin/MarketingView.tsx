import { useState } from 'react'
import { UtmBuilder } from '../../components/UtmBuilder'
import {
  CHECKLIST_LABELS,
  attentionLine,
  countsAreZero,
  formatCount,
  formatDelta,
  freshnessLine,
  marketingCsv,
  registrationTotal,
  visitRate,
  type ChannelId,
  type FunnelPayload,
  type RangeId,
  type StatsPayload,
  type StatsStatus,
} from '../../lib/marketing'
import { toneClasses } from '../../shell/ViewState'

const RANGES: { id: RangeId; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'custom', label: 'Custom' },
]

const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'organic', label: 'Organic' },
]

export function MarketingView({
  range,
  channel,
  compare,
  customFrom,
  customTo,
  onRange,
  onChannel,
  onCompare,
  onCustom,
  funnel,
  previous,
  stats,
  statsStatus,
  lastGoodAt,
  loadingFunnel,
  funnelError,
  denied,
  updatedAt,
  onRetry,
  example = false,
  spendSar = null,
}: {
  range: RangeId
  channel: ChannelId
  compare: boolean
  customFrom: string
  customTo: string
  onRange: (range: RangeId) => void
  onChannel: (channel: ChannelId) => void
  onCompare: (on: boolean) => void
  onCustom: (from: string, to: string) => void
  funnel: FunnelPayload | null
  previous: FunnelPayload | null
  stats: StatsPayload | null
  statsStatus: StatsStatus
  lastGoodAt: string | null
  loadingFunnel: boolean
  funnelError: string
  denied: boolean
  updatedAt: Date | null
  onRetry: () => void
  example?: boolean
  spendSar?: number | null
}) {
  const styles = toneClasses('staff')
  const [customOpen, setCustomOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(customFrom)
  const [draftTo, setDraftTo] = useState(customTo)
  const [stepsOpen, setStepsOpen] = useState(false)
  const liveStats = statsStatus === 'ok' ? stats : null
  const notLive = statsStatus === 'not_live'
  const attention = funnel
    ? attentionLine({
        analyticsLive: Boolean(liveStats),
        eventsLast24h: liveStats ? liveStats.events_last_24h : null,
        funnel: funnel.funnel,
        previous: compare ? previous?.funnel ?? null : null,
        sources: funnel.sources,
        visitSources: liveStats ? liveStats.sources : [],
      })
    : ''
  const registrations = funnel ? registrationTotal(funnel.funnel) : 0
  const empty = Boolean(funnel && countsAreZero(funnel) && channel === 'all' && (notLive || (liveStats && liveStats.visits === 0)))
  const filteredZero = Boolean(funnel && countsAreZero(funnel) && !empty && (channel !== 'all' || range !== '30'))
  const showPaid = Boolean(funnel?.has_spend && spendSar && spendSar > 0)

  return (
    <div data-screen="admin-marketing" className="min-w-0 overflow-x-hidden pb-8">
      {example ? (
        <p data-watermark="example" className="mb-4 text-[0.75rem] font-semibold tracking-[0.14em] text-[var(--ba-copper)] uppercase">
          Example data
        </p>
      ) : null}
      <header>
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Marketing</h1>
        <p className="mt-2 max-w-2xl text-[1rem] leading-relaxed text-pearl/75">
          See where registrations come from and which pages convert.
        </p>
        <p className="mt-2 text-[0.85rem] text-pearl/55">{updatedAt ? freshnessLine(updatedAt) : 'Registrations live'}</p>
      </header>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Range">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={range === item.id}
            className={`inline-flex min-h-11 items-center px-3 text-[0.95rem] ${range === item.id ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-white/20 text-pearl'}`}
            onClick={() => {
              if (item.id === 'custom') {
                setDraftFrom(customFrom)
                setDraftTo(customTo)
                setCustomOpen(true)
              }
              onRange(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Channel">
        {CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={channel === item.id}
            className={`inline-flex min-h-11 items-center px-3 text-[0.95rem] ${channel === item.id ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-white/20 text-pearl'}`}
            onClick={() => onChannel(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={compare}
          className={`inline-flex min-h-11 items-center px-3 text-[0.95rem] ${compare ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-white/20 text-pearl'}`}
          onClick={() => onCompare(!compare)}
        >
          Compare to previous period
        </button>
      </div>

      {denied ? (
        <p className="mt-6 text-[1rem]" role="alert">You do not have access to marketing counts.</p>
      ) : null}
      {funnelError && !denied ? (
        <div className="mt-6" role="alert">
          <p className="text-[1rem]">{funnelError}</p>
          <button type="button" className="mt-3 inline-flex min-h-11 items-center underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}

      {attention && !funnelError ? (
        <p className="mt-6 border-s-2 border-[var(--ba-copper)] ps-3 text-[1rem] text-[var(--ba-copper)]" data-region="needs-attention">
          {attention}
        </p>
      ) : null}

      <section aria-label="Counts" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tile
          label="Visits"
          value={liveStats ? formatCount(liveStats.visits) : 'Not live yet'}
          source="PostHog"
          loading={statsStatus === 'loading'}
        />
        <Tile
          label="Unique visitors"
          value={liveStats ? formatCount(liveStats.unique_visitors) : 'Not live yet'}
          source="PostHog, estimate"
          loading={statsStatus === 'loading'}
        />
        <Tile
          label="Register clicks"
          value={liveStats ? formatCount(liveStats.register_clicks) : 'Not live yet'}
          source="PostHog"
          loading={statsStatus === 'loading'}
        />
        <Tile
          label="Registrations"
          hint="Email verified"
          value={funnel ? formatCount(funnel.funnel.email_verified) : ''}
          source="Supabase"
          delta={funnel && compare && previous ? formatDelta(funnel.funnel.email_verified, previous.funnel.email_verified) : null}
          loading={loadingFunnel}
        />
        <Tile
          label="Approved"
          value={funnel ? formatCount(funnel.funnel.approved) : ''}
          source="Supabase"
          delta={funnel && compare && previous ? formatDelta(funnel.funnel.approved, previous.funnel.approved) : null}
          loading={loadingFunnel}
        />
        <Tile
          label="Visit to registration"
          value={visitRate(liveStats ? liveStats.visits : null, registrations)}
          source="Approximate"
          copper
          loading={loadingFunnel && !funnel}
        />
      </section>

      {notLive ? (
        <p className="mt-4 text-[0.95rem] leading-relaxed text-pearl/75" data-state="not-live">
          Site tracking switches on after the privacy go-live checks pass. Registration numbers from Supabase are live now.
        </p>
      ) : null}
      {statsStatus === 'error' ? (
        <div className="mt-4" role="alert" data-state="analytics-error">
          <p>Site analytics could not be loaded.</p>
          {lastGoodAt ? <p className="mt-1 text-[0.85rem] text-pearl/55">Last good update {lastGoodAt}.</p> : null}
          <button type="button" className="mt-2 inline-flex min-h-11 items-center underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}

      {empty ? (
        <div className="mt-6" data-state="empty">
          <p className="text-[1rem]">No site visits recorded yet for this range.</p>
          <UtmBuilder tone="staff" />
        </div>
      ) : null}
      {filteredZero ? <p className="mt-6 text-[1rem]" data-state="filtered-zero">No matches in this filter.</p> : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className={`${styles.panel} min-w-0 px-4 py-4`} aria-label="Visits over time">
          <h2 className="font-display text-[1.25rem] font-semibold">Visits over time</h2>
          {liveStats ? <VisitBars series={liveStats.series} days={funnel?.days ?? []} /> : <p className="mt-3 text-pearl/70">Visit bars appear after site tracking is on. Registration dots use Supabase.</p>}
          <RegistrationDots days={funnel?.days ?? []} quiet={Boolean(funnel?.has_quiet_days)} />
        </section>
        <section className={`${styles.panel} min-w-0 px-4 py-4`} aria-label="Funnel">
          <h2 className="font-display text-[1.25rem] font-semibold">Funnel</h2>
          {funnel ? (
            <ol className="mt-3 space-y-2 text-[0.95rem]">
              <FunnelStep n="3" label="Form sent" value={funnel.funnel.form_sent} />
              <FunnelStep n="4" label="Email verified" value={funnel.funnel.email_verified} />
              <li className="ps-6 text-pearl/70">Legacy applications: {formatCount(funnel.funnel.legacy_applications)}</li>
              <FunnelStep n="5" label="Checklist 7 of 7" value={funnel.funnel.checklist_complete} />
              <FunnelStep n="6" label="Full requested" value={funnel.funnel.full_requested} />
              <FunnelStep n="7" label="Approved" value={funnel.funnel.approved} />
              <li className="ps-6 text-pearl/70">Legacy approved: {formatCount(funnel.funnel.legacy_approved)}</li>
            </ol>
          ) : (
            <p className="mt-3 text-pearl/60">{loadingFunnel ? 'Loading registrations.' : 'Registrations are not loaded.'}</p>
          )}
          <p className="mt-3 text-[0.85rem] text-pearl/50">The step from register clicks to form sent is approximate.</p>
          <button type="button" className="mt-3 inline-flex min-h-11 items-center underline" onClick={() => setStepsOpen((value) => !value)}>
            {stepsOpen ? 'Hide checklist steps' : 'Checklist steps'}
          </button>
          {stepsOpen && funnel ? (
            <ul className="mt-2 space-y-1 text-[0.95rem]">
              {funnel.checklist.map((row) => (
                <li key={row.step} className="flex min-h-11 items-center justify-between gap-3">
                  <span>{CHECKLIST_LABELS[row.step] || row.step}</span>
                  <span>{formatCount(row.count)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="mt-6 min-w-0" aria-label="Source and medium">
        <h2 className="font-display text-[1.25rem] font-semibold">Source and medium</h2>
        <div className="mt-3 hidden md:block">
          <table className="w-full text-left text-[0.95rem]">
            <thead className="text-[0.72rem] tracking-[0.08em] text-pearl/45 uppercase">
              <tr>
                <th className="py-2 font-semibold">Source</th>
                <th className="py-2 font-semibold">Kind</th>
                <th className="py-2 font-semibold">Visits</th>
                <th className="py-2 font-semibold">Registrations</th>
                <th className="py-2 font-semibold">Approved</th>
                <th className="py-2 font-semibold">Reg rate</th>
              </tr>
            </thead>
            <tbody>
              {(funnel?.sources ?? []).map((row) => (
                <tr key={`${row.line}-${row.source}-${row.medium}`} className="border-t border-white/10">
                  <td className="py-3">{row.line === 'legacy' ? 'Legacy applications' : `${row.source} / ${row.medium}`}</td>
                  <td className="py-3">{row.kind === 'paid' ? <span className="text-[var(--ba-copper)]">Paid</span> : 'Organic'}</td>
                  <td className="py-3">{liveStats ? formatCount(visitCount(liveStats, row.source, row.medium)) : 'Not live yet'}</td>
                  <td className="py-3">{formatCount(row.registrations)}</td>
                  <td className="py-3">{formatCount(row.approved)}</td>
                  <td className="py-3">{rateCell(liveStats ? visitCount(liveStats, row.source, row.medium) : null, row.registrations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {funnel && funnel.sources.length === 0 ? <p className="mt-2 text-pearl/60">No attributed registrations in this range.</p> : null}
        </div>
        <ul className="mt-3 space-y-2 md:hidden">
          {(funnel?.sources ?? []).map((row) => (
            <li key={`${row.line}-${row.source}-${row.medium}`} className={`${styles.panel} px-3 py-3`}>
              <p>{row.line === 'legacy' ? 'Legacy applications' : `${row.source} / ${row.medium}`}</p>
              <p className="mt-1 text-[0.9rem] text-pearl/70">
                {row.kind === 'paid' ? <span className="text-[var(--ba-copper)]">Paid</span> : 'Organic'}
                {' · '}
                {formatCount(row.registrations)} registrations
              </p>
              <p className="text-[0.9rem] text-pearl/55">{liveStats ? `${formatCount(visitCount(liveStats, row.source, row.medium))} visits` : 'Visits not live yet'}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className={`${styles.panel} px-4 py-4`} aria-label="Countries and cities">
          <h2 className="font-display text-[1.25rem] font-semibold">Countries and cities</h2>
          {liveStats ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <PlaceList title="Countries" rows={liveStats.countries} />
              <PlaceList title="Cities" rows={liveStats.cities} />
            </div>
          ) : (
            <p className="mt-3 text-pearl/70">Country and city counts appear after site tracking is on.</p>
          )}
        </section>
        <section className={`${styles.panel} min-w-0 px-4 py-4`} aria-label="Pages">
          <h2 className="font-display text-[1.25rem] font-semibold">Pages</h2>
          {liveStats ? <PageTable pages={liveStats.pages} /> : <p className="mt-3 text-pearl/70">Page engagement appears after site tracking is on.</p>}
        </section>
      </div>

      {showPaid ? (
        <section className={`${styles.panel} mt-6 px-4 py-4`} aria-label="Paid cost">
          <h2 className="font-display text-[1.25rem] font-semibold">Paid cost</h2>
          <p className="mt-2 text-pearl/75">Spend {spendSar} SAR in this table.</p>
          <p className="mt-1 text-pearl/70">
            Cost per registration {costLine(spendSar || 0, registrations)}. Cost per approval {costLine(spendSar || 0, funnel?.funnel.approved ?? 0)}.
          </p>
        </section>
      ) : null}

      <button
        type="button"
        className="mt-6 inline-flex min-h-11 items-center underline"
        onClick={() => downloadCsv(funnel, liveStats)}
        disabled={!funnel}
      >
        Export CSV
      </button>

      {customOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Custom range" className="shell-safe-bottom w-full max-w-md border border-white/15 bg-ink px-5 py-5 text-pearl">
            <h2 className="font-display text-[1.4rem] font-semibold">Custom range</h2>
            <label className="mt-4 block">
              <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/50">From</span>
              <input type="date" className="mt-2 min-h-11 w-full border border-white/20 bg-transparent px-3" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
            </label>
            <label className="mt-3 block">
              <span className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase text-pearl/50">To</span>
              <input type="date" className="mt-2 min-h-11 w-full border border-white/20 bg-transparent px-3" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
            </label>
            <div className="mt-5 flex gap-3">
              <button type="button" className="inline-flex min-h-11 items-center px-3 underline" onClick={() => setCustomOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
                onClick={() => {
                  if (draftFrom && draftTo && draftFrom <= draftTo) onCustom(draftFrom, draftTo)
                  setCustomOpen(false)
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Tile({
  label,
  hint,
  value,
  source,
  delta,
  copper = false,
  loading = false,
}: {
  label: string
  hint?: string
  value: string
  source: string
  delta?: string | null
  copper?: boolean
  loading?: boolean
}) {
  return (
    <article className={`min-w-0 border px-3 py-3 ${copper ? 'border-[var(--ba-copper)]' : 'border-white/15'}`}>
      <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/50 uppercase">{label}</p>
      {hint ? <p className="text-[0.75rem] text-pearl/45">{hint}</p> : null}
      {loading && !value ? <div className="mt-3 h-8 bg-[var(--ba-lavender)]/35" aria-hidden="true" /> : <p className="mt-2 font-display text-[1.45rem] font-semibold">{value}</p>}
      {delta ? <p className="mt-1 text-[0.8rem] text-pearl/60">{delta}</p> : null}
      <p className="mt-2 text-[0.75rem] text-pearl/45">{source}</p>
    </article>
  )
}

function FunnelStep({ n, label, value }: { n: string; label: string; value: FunnelPayload['funnel']['approved'] }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3">
      <span>{n}. {label}</span>
      <span>{formatCount(value)}</span>
    </li>
  )
}

function VisitBars({ series, days }: { series: StatsPayload['series']; days: FunnelPayload['days'] }) {
  const max = Math.max(1, ...series.map((row) => (row.visits === 'lt5' ? 4 : row.visits)))
  if (series.length === 0) return <p className="mt-3 text-pearl/60">No visits in this range.</p>
  return (
    <div className="mt-4 flex h-36 items-end gap-1" aria-hidden="true">
      {series.map((row) => {
        const size = row.visits === 'lt5' ? 4 : row.visits
        const dot = days.some((day) => day.day === row.day)
        return (
          <div key={row.day} className="flex min-w-0 flex-1 flex-col justify-end">
            <div className="bg-[var(--ba-lavender)]" style={{ height: `${Math.max(8, (size / max) * 100)}%` }} />
            {dot ? <span className="mx-auto mt-1 h-2 w-2 rounded-full bg-[var(--ba-copper)]" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function RegistrationDots({ days, quiet }: { days: FunnelPayload['days']; quiet: boolean }) {
  if (days.length === 0 && !quiet) return null
  return (
    <p className="mt-3 text-[0.85rem] text-pearl/60">
      {days.length > 0 ? 'Copper dots mark days with 5 or more registrations.' : null}
      {quiet ? ' Some days had fewer than 5 registrations.' : null}
    </p>
  )
}

function PlaceList({ title, rows }: { title: string; rows: { label: string; visits: FunnelPayload['funnel']['approved'] }[] }) {
  return (
    <div>
      <h3 className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">{title}</h3>
      <ul className="mt-2 space-y-1">
        {rows.length === 0 ? <li className="text-pearl/55">None in this range.</li> : null}
        {rows.map((row) => (
          <li key={row.label} className="flex min-h-11 items-center justify-between gap-3">
            <span>{row.label}</span>
            <span>{formatCount(row.visits)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PageTable({ pages }: { pages: StatsPayload['pages'] }) {
  if (pages.length === 0) return <p className="mt-3 text-pearl/60">No page rows in this range.</p>
  return (
    <>
      <div className="mt-3 hidden md:block overflow-x-auto">
        <table className="w-full text-left text-[0.9rem]">
          <thead className="text-[0.72rem] tracking-[0.08em] text-pearl/45 uppercase">
            <tr>
              <th className="py-2 font-semibold">Page</th>
              <th className="py-2 font-semibold">Views</th>
              <th className="py-2 font-semibold">Unique</th>
              <th className="py-2 font-semibold">Engaged</th>
              <th className="py-2 font-semibold">Scroll</th>
              <th className="py-2 font-semibold">75%</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((row) => (
              <tr key={row.path} className="border-t border-white/10">
                <td className="py-2">{row.path}</td>
                <td className="py-2">{formatCount(row.views)}</td>
                <td className="py-2">{formatCount(row.unique)}</td>
                <td className="py-2">{formatCount(row.median_engaged_seconds)}</td>
                <td className="py-2">{formatCount(row.avg_scroll)}</td>
                <td className="py-2">{formatCount(row.reached_75_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-2 md:hidden">
        {pages.map((row) => (
          <li key={row.path} className="border border-white/10 px-3 py-3">
            <p>{row.path}</p>
            <p className="mt-1 text-[0.9rem] text-pearl/70">{formatCount(row.views)} views · {formatCount(row.median_engaged_seconds)} engaged</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function visitCount(stats: StatsPayload, source: string, medium: string) {
  const row = stats.sources.find((item) => item.source === source && item.medium === medium)
  return row?.visits ?? 0
}

function rateCell(visits: FunnelPayload['funnel']['approved'] | null, registrations: FunnelPayload['funnel']['approved']) {
  if (visits == null) return 'Not live yet'
  if (visits === 'lt5' || registrations === 'lt5' || visits === 0) return 'Approximate'
  return `${Math.round((registrations / visits) * 100)}%`
}

function costLine(spend: number, count: FunnelPayload['funnel']['approved']) {
  if (count === 'lt5' || count < 5) return 'appears once the range has 5 or more.'
  return `${Math.round(spend / count)} SAR.`
}

function downloadCsv(funnel: FunnelPayload | null, stats: StatsPayload | null) {
  if (!funnel || typeof document === 'undefined') return
  const blob = new Blob([marketingCsv(funnel, stats)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'marketing-aggregates.csv'
  link.click()
  URL.revokeObjectURL(url)
}
