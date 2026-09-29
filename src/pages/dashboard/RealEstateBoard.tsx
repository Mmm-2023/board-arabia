import { useEffect, useState } from 'react'
import { RE_ASSET_CLASSES, RE_CAPITAL_ROLES, RE_CITIES, type ReOpportunityCard } from '../../lib/reRedaction'
import {
  EMPTY_RE_FILTERS,
  filterReOpportunities,
  reFeedIsForming,
  reFiltersActive,
  type ReOpportunityFilters,
} from '../../lib/reOpportunityView'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero, PermissionState } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { OpportunityCard } from './OpportunityCard'

export type RealEstateStatus = 'loading' | 'error' | 'denied' | 'ready'

// Later home sections stay out of this tab list.
// This shell has no coming-soon tab pattern to reuse, so those tabs stay hidden.
const OPPORTUNITY_TAB = 'Opportunities'

export function RealEstateBoard({
  status,
  cards,
  busyId,
  requestError,
  onRetry,
  onRequest,
}: {
  status: RealEstateStatus
  cards: ReOpportunityCard[]
  busyId: string | null
  requestError: boolean
  onRetry: () => void
  onRequest: (id: string) => void
}) {
  const [filters, setFilters] = useState<ReOpportunityFilters>(EMPTY_RE_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const forming = status === 'ready' && reFeedIsForming(cards)
  const visible = status === 'ready' ? filterReOpportunities(cards, filters) : []
  const active = reFiltersActive(filters)
  const copy = MEMBER_VIEWS.realEstate

  useEffect(() => {
    if (!filtersOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [filtersOpen])

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Real Estate</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Real Estate</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">{copy.intro}</p>
      <div role="tablist" aria-label="Real Estate" className="mt-8 flex gap-6 border-b border-[var(--ba-line)]">
        <button
          type="button"
          role="tab"
          id="re-tab-opportunities"
          aria-selected="true"
          aria-controls="re-panel-opportunities"
          className="min-h-11 border-b-2 border-[var(--ba-indigo)] px-1 text-[0.95rem] font-semibold text-ink"
        >
          {OPPORTUNITY_TAB}
        </button>
      </div>
      <div
        role="tabpanel"
        id="re-panel-opportunities"
        aria-labelledby="re-tab-opportunities"
        className="mt-6"
        data-re-panel="opportunities"
      >
        {status === 'loading' ? <CardSkeleton tone="member" label="Loading opportunities" /> : null}
        {status === 'error' ? (
          <ErrorBanner tone="member" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        ) : null}
        {status === 'denied' ? <PermissionState tone="member" message={copy.denied} /> : null}
        {status === 'ready' && cards.length === 0 ? <EmptyState tone="member" message={copy.empty} /> : null}
        {status === 'ready' && cards.length > 0 ? (
          <>
            {forming ? (
              <p data-re-forming="true" className="max-w-xl text-[1rem] leading-relaxed text-ink/70">
                {copy.forming}
              </p>
            ) : null}
            <div className={forming ? 'mt-5' : ''}>
              <button
                type="button"
                className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase md:hidden"
                aria-expanded={filtersOpen}
                aria-controls="re-filter-sheet"
                onClick={() => setFiltersOpen(true)}
              >
                {active ? 'Filters on' : 'Filters'}
              </button>
              <div id="re-filters" className="hidden md:block">
                <FilterGroups filters={filters} onChange={setFilters} />
              </div>
            </div>
            {active && visible.length > 0 ? (
              <button
                type="button"
                className="mt-4 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo)] uppercase"
                onClick={() => setFilters(EMPTY_RE_FILTERS)}
              >
                {copy.clear}
              </button>
            ) : null}
            {visible.length === 0 ? (
              <div className="mt-4">
                <FilteredZero
                  tone="member"
                  message={copy.filtered}
                  clearLabel={copy.clear}
                  onClear={() => setFilters(EMPTY_RE_FILTERS)}
                />
              </div>
            ) : (
              <ul className="mt-4 grid gap-3">
                {visible.map((card) => (
                  <li key={card.id}>
                    <OpportunityCard card={card} busy={busyId === card.id} onRequest={onRequest} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {requestError ? (
          <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            Could not send the request. Retry.
          </p>
        ) : null}
      </div>
      {filtersOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-ink/45"
            onClick={() => setFiltersOpen(false)}
          />
          <div
            id="re-filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="shell-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(36rem,85dvh)] overflow-y-auto border-t border-[var(--ba-line)] bg-pearl px-4 pt-4"
          >
            <div className="flex items-start justify-between gap-3 px-1 pb-2">
              <p className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">Filters</p>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>
            <FilterGroups filters={filters} onChange={setFilters} />
            <div className="h-4" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterGroups({
  filters,
  onChange,
}: {
  filters: ReOpportunityFilters
  onChange: (next: ReOpportunityFilters) => void
}) {
  return (
    <div className="space-y-4">
      <FilterRow
        label="Asset class"
        value={filters.assetClass}
        options={RE_ASSET_CLASSES}
        onPick={(assetClass) => onChange({ ...filters, assetClass })}
      />
      <FilterRow
        label="City"
        value={filters.city}
        options={RE_CITIES}
        onPick={(city) => onChange({ ...filters, city })}
      />
      <FilterRow
        label="Capital role"
        value={filters.capitalRole}
        options={RE_CAPITAL_ROLES}
        onPick={(capitalRole) => onChange({ ...filters, capitalRole })}
      />
    </div>
  )
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: T | null
  options: readonly T[]
  onPick: (next: T | null) => void
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip pressed={value == null} onClick={() => onPick(null)}>
          All
        </Chip>
        {options.map((option) => (
          <Chip key={option} pressed={value === option} onClick={() => onPick(value === option ? null : option)}>
            {option}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center px-3 text-[0.92rem] ${
        pressed ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
      }`}
    >
      {children}
    </button>
  )
}
