import { useState } from 'react'
import {
  EMPTY_MANDATE_FILTERS,
  filterMandates,
  mandateFilterChoices,
  mandateFiltersActive,
  type MandateFilters,
} from '../../lib/mandateFilters'
import type { MandateCardModel } from '../../lib/mandateRedaction'
import { FilteredZero } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { MandateCard } from './MandateCard'
import { chipOptions, FilterRow, MemberFilterControls } from './MemberFilters'

export function MandatesBoard({
  mandates,
  busyId = null,
  onRequest,
  initialFiltersOpen = false,
}: {
  mandates: MandateCardModel[]
  busyId?: string | null
  onRequest?: (id: string) => void
  initialFiltersOpen?: boolean
}) {
  const [filters, setFilters] = useState<MandateFilters>(EMPTY_MANDATE_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen)
  const choices = mandateFilterChoices(mandates)
  const visible = filterMandates(mandates, filters)
  const active = mandateFiltersActive(filters)
  const copy = MEMBER_VIEWS.mandates

  function renderGroups() {
    return (
      <div className="space-y-4">
        <FilterRow
          label="Sector"
          value={filters.sector}
          options={chipOptions(choices.sector)}
          onPick={(sector) => setFilters({ ...filters, sector })}
        />
        <FilterRow
          label="Size"
          value={filters.size}
          options={chipOptions(choices.size)}
          onPick={(size) => setFilters({ ...filters, size })}
        />
        <FilterRow
          label="Geography"
          value={filters.geography}
          options={chipOptions(choices.geography)}
          onPick={(geography) => setFilters({ ...filters, geography })}
        />
      </div>
    )
  }

  return (
    <div>
      <MemberFilterControls
        active={active}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        clearLabel={copy.clear}
        onClear={() => setFilters(EMPTY_MANDATE_FILTERS)}
        showClear={active && visible.length > 0}
        desktopId="mandate-filters"
        sheetId="mandate-filter-sheet"
        renderGroups={renderGroups}
      />
      {visible.length === 0 ? (
        <div className="mt-4">
          <FilteredZero
            tone="member"
            message={copy.filtered}
            clearLabel={copy.clear}
            onClear={() => setFilters(EMPTY_MANDATE_FILTERS)}
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {visible.map((mandate) => (
            <li key={mandate.id}>
              <MandateCard
                mandate={mandate}
                busy={busyId === mandate.id}
                onRequest={onRequest ? (id) => onRequest(id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {visible.length} mandates
      </p>
    </div>
  )
}
