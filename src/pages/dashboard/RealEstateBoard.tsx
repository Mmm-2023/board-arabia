import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  reAssetClassLabel,
  reCapitalRoleLabel,
  type ReOpportunityCard,
  type RePartnerCard,
} from '../../lib/reRedaction'
import { reAppetiteFits, type ReAppetite } from '../../lib/reAppetite'
import { RE_REGIONS } from '../../lib/reRegions'
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
import { ReAppetiteCard, type ReAppetiteCardStatus } from './ReAppetiteCard'
import type { ReBoardRoleCard } from '../../lib/reBoardRoles'
import { RealEstatePartners } from './RealEstatePartners'
import { RealEstateRoles } from './RealEstateRoles'

export type RealEstateStatus = 'loading' | 'error' | 'denied' | 'ready'
export type RealEstateTab = 'opportunities' | 'partners' | 'roles'

const TABS = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'partners', label: 'Partners' },
  { id: 'roles', label: 'Board roles' },
] as const

function tabDomId(id: RealEstateTab) {
  return `re-tab-${id}`
}

export function RealEstateBoard({
  status,
  cards,
  busyId,
  requestError,
  onRetry,
  onRequest,
  tab,
  onTab,
  partners = [],
  partnersStatus = 'ready',
  partnerBusyId = null,
  partnerRequestError = false,
  onRetryPartners,
  onRequestPartner,
  roles = [],
  rolesStatus = 'ready',
  roleBusyId = null,
  roleRequestError = false,
  onRetryRoles,
  onRequestRole,
  appetiteStatus = null,
  appetite = null,
  onRetryAppetite,
  onSaveAppetite,
}: {
  status: RealEstateStatus
  cards: ReOpportunityCard[]
  busyId: string | null
  requestError: boolean
  onRetry: () => void
  onRequest: (id: string) => void
  tab?: RealEstateTab
  onTab?: (next: RealEstateTab) => void
  partners?: RePartnerCard[]
  partnersStatus?: RealEstateStatus
  partnerBusyId?: string | null
  partnerRequestError?: boolean
  onRetryPartners?: () => void
  onRequestPartner?: (id: string) => void
  roles?: ReBoardRoleCard[]
  rolesStatus?: RealEstateStatus
  roleBusyId?: string | null
  roleRequestError?: boolean
  onRetryRoles?: () => void
  onRequestRole?: (id: string) => void
  appetiteStatus?: ReAppetiteCardStatus | null
  appetite?: ReAppetite | null
  onRetryAppetite?: () => void
  onSaveAppetite?: (appetite: ReAppetite) => Promise<'ok' | 'error'>
}) {
  const [filters, setFilters] = useState<ReOpportunityFilters>(EMPTY_RE_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [localTab, setLocalTab] = useState<RealEstateTab>('opportunities')
  const activeTab = tab ?? localTab
  function selectTab(next: RealEstateTab) {
    if (next !== 'opportunities') setFiltersOpen(false)
    setLocalTab(next)
    onTab?.(next)
  }
  function onTabKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = TABS.findIndex((item) => item.id === activeTab)
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = TABS[(index + step + TABS.length) % TABS.length]
    if (!next) return
    selectTab(next.id)
    document.getElementById(tabDomId(next.id))?.focus()
  }
  const forming = status === 'ready' && reFeedIsForming(cards)
  const applied = appetite ? filters : { ...filters, fitsAppetite: false }
  const visible = status === 'ready' ? filterReOpportunities(cards, applied, appetite) : []
  const active = reFiltersActive(applied)
  const copy = MEMBER_VIEWS.realEstate
  const showFit = appetite != null

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
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Real estate</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">
        {activeTab === 'partners' ? copy.partnersIntro : activeTab === 'roles' ? copy.rolesIntro : copy.intro}
      </p>
      <div role="tablist" aria-label="Real estate" className="mt-6 inline-flex flex-wrap gap-2" onKeyDown={onTabKey}>
        {TABS.map((item) => {
          const selected = activeTab === item.id
          const tabId = tabDomId(item.id)
          const panelId = `re-panel-${item.id}`
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              data-re-tab={item.id}
              className={`min-h-11 rounded-full px-4 text-[0.8125rem] font-semibold ${
                selected
                  ? 'bg-[var(--ba-lavender-mist)] text-ink'
                  : 'border border-[var(--ba-line)] bg-white text-ink/70'
              }`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {activeTab === 'roles' ? (
        <div className="mt-6">
          <RealEstateRoles
            status={rolesStatus}
            cards={roles}
            busyId={roleBusyId}
            requestError={roleRequestError}
            onRetry={onRetryRoles ?? onRetry}
            onRequest={onRequestRole ?? (() => {})}
          />
        </div>
      ) : null}
      {activeTab === 'partners' ? (
        <div className="mt-6">
          <RealEstatePartners
            status={partnersStatus}
            cards={partners}
            busyId={partnerBusyId}
            requestError={partnerRequestError}
            onRetry={onRetryPartners ?? onRetry}
            onRequest={onRequestPartner ?? (() => {})}
          />
        </div>
      ) : null}
      {activeTab === 'opportunities' ? (
      <div
        role="tabpanel"
        id="re-panel-opportunities"
        aria-labelledby="re-tab-opportunities"
        className="mt-6"
        data-re-panel="opportunities"
      >
        {appetiteStatus ? (
          <div className="mb-6">
            <ReAppetiteCard
              status={appetiteStatus}
              appetite={appetite}
              onRetry={onRetryAppetite ?? (() => {})}
              onSave={onSaveAppetite ?? (async () => 'error')}
            />
          </div>
        ) : null}
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
              <div className="flex flex-wrap gap-2 md:hidden">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase"
                  aria-expanded={filtersOpen}
                  aria-controls="re-filter-sheet"
                  onClick={() => setFiltersOpen(true)}
                >
                  {active ? 'Filters on' : 'Filters'}
                </button>
                {showFit ? (
                  <button
                    type="button"
                    aria-pressed={filters.fitsAppetite === true}
                    data-re-fit-filter="true"
                    className={`inline-flex min-h-11 items-center px-4 text-[0.92rem] ${
                      filters.fitsAppetite === true
                        ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]'
                        : 'border border-[var(--ba-line)] bg-white text-ink'
                    }`}
                    onClick={() => setFilters({ ...filters, fitsAppetite: filters.fitsAppetite !== true })}
                  >
                    {copy.appetite.fit}
                  </button>
                ) : null}
              </div>
              <div id="re-filters" className="hidden md:block">
                <FilterGroups filters={filters} showFit={showFit} onChange={setFilters} />
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
                    <OpportunityCard
                      card={card}
                      busy={busyId === card.id}
                      fits={appetite != null && reAppetiteFits(card, appetite)}
                      onRequest={onRequest}
                    />
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
      ) : null}
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
            <FilterGroups filters={filters} showFit={showFit} onChange={setFilters} />
            <div className="h-4" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterGroups({
  filters,
  showFit,
  onChange,
}: {
  filters: ReOpportunityFilters
  showFit: boolean
  onChange: (next: ReOpportunityFilters) => void
}) {
  return (
    <div className="space-y-4">
      {showFit ? (
        <div role="group" aria-label="Appetite">
          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase">Appetite</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip
              pressed={filters.fitsAppetite === true}
              onClick={() => onChange({ ...filters, fitsAppetite: filters.fitsAppetite !== true })}
            >
              {MEMBER_VIEWS.realEstate.appetite.fit}
            </Chip>
          </div>
        </div>
      ) : null}
      <FilterRow
        label="Asset class"
        value={filters.assetClass}
        options={RE_ASSET_CLASSES}
        labelFor={reAssetClassLabel}
        onPick={(assetClass) => onChange({ ...filters, assetClass })}
      />
      <FilterRow
        label="Region"
        value={filters.city}
        options={RE_REGIONS}
        onPick={(city) => onChange({ ...filters, city })}
      />
      <FilterRow
        label="Capital role"
        value={filters.capitalRole}
        options={RE_CAPITAL_ROLES}
        labelFor={reCapitalRoleLabel}
        onPick={(capitalRole) => onChange({ ...filters, capitalRole })}
      />
    </div>
  )
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  labelFor = (option: T) => option,
  onPick,
}: {
  label: string
  value: T | null
  options: readonly T[]
  labelFor?: (option: T) => string
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
            {labelFor(option)}
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
