import { useEffect, useId, useState } from 'react'
import { ExampleMark } from '../../components/ExampleMark'
import { SponsorBadge } from '../../components/SponsorBadge'
import {
  DIRECTORY_AVAILABILITY_OPTIONS,
  DIRECTORY_SEAT_OPTIONS,
  EMPTY_DIRECTORY_FILTERS,
  directoryFiltersActive,
  directorySectorOptions,
  filterDirectory,
  type DirectoryFilters,
} from '../../lib/directoryFilters'
import { orderDirectoryCards } from '../../lib/directoryOrder'
import { seatLabel, type DirectoryCard } from '../../lib/demoRows'
import { progressLine } from '../../lib/directoryGate'
import { isAvailability, availabilityLabel, type Availability } from '../../lib/profileTags'
import { supabase } from '../../lib/supabase'
import { FilteredZero } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { Avatar } from '../../components/Avatar'
import { DirectoryIntroAction } from './DirectoryIntroAction'
import type { IntroQuota, IntroStatus } from '../../lib/memberIntros'
import type { SeatCountState } from './DirectoryEmpty'
import { chipOptions, FilterRow, MemberFilterControls } from './MemberFilters'

const searchClass =
  'mt-2 w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function DirectoryBoard({
  cards,
  seat,
  initialFiltersOpen = false,
  selfId = null,
  introStatus,
  busyId = null,
  errorId = null,
  requestError = '',
  quota = null,
  onRequestIntro,
}: {
  cards: DirectoryCard[]
  seat: SeatCountState
  initialFiltersOpen?: boolean
  selfId?: string | null
  introStatus?: (id: string) => IntroStatus | null
  busyId?: string | null
  errorId?: string | null
  requestError?: string
  quota?: IntroQuota | null
  onRequestIntro?: (id: string, reason: string, askDesk: boolean) => void
}) {
  const photos = useSignedPortraits(cards)
  const hasExamples = cards.some((card) => card.is_demo)
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_DIRECTORY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen)
  const visible = filterDirectory(orderDirectoryCards(cards, selfId), filters)
  const active = directoryFiltersActive(filters)
  const sectorOptions = directorySectorOptions(cards)
  const copy = MEMBER_VIEWS.directory

  function renderGroups() {
    return (
      <div className="space-y-4">
        <FilterRow
          label="Saudi or International"
          value={filters.seat}
          options={DIRECTORY_SEAT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onPick={(seat) => setFilters({ ...filters, seat: seat === 'ksa' || seat === 'intl' ? seat : null })}
        />
        <FilterRow
          label="Sector"
          value={filters.sector}
          options={chipOptions(sectorOptions)}
          onPick={(sector) => setFilters({ ...filters, sector })}
        />
        <FilterRow
          label="Availability"
          value={filters.availability}
          options={DIRECTORY_AVAILABILITY_OPTIONS}
          onPick={(availability) =>
            setFilters({ ...filters, availability: isAvailability(availability) ? availability : null })
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl xl:max-w-6xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        {hasExamples
          ? 'Admitted members. Cards marked Example are samples and step aside once enough real members are here.'
          : 'Admitted members.'}{' '}
        Request a warm introduction from a card. Email and phone stay private.
      </p>
      {seat.status === 'ready' ? (
        <p className="mt-4 font-display text-[1.25rem] font-semibold tracking-[-0.03em]">
          {progressLine(seat.admitted)}
        </p>
      ) : null}
      <div className="mt-8">
        <label className="block" htmlFor="directory-search">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Search</span>
          <input
            id="directory-search"
            type="search"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Name, firm, or sector"
            autoComplete="off"
            className={searchClass}
          />
        </label>
      </div>
      <div className="mt-5">
        <MemberFilterControls
          active={active}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          clearLabel={copy.clear}
          onClear={() => setFilters(EMPTY_DIRECTORY_FILTERS)}
          showClear={active && visible.length > 0}
          desktopId="directory-filters"
          sheetId="directory-filter-sheet"
          renderGroups={renderGroups}
        />
      </div>
      {visible.length === 0 ? (
        <div className="mt-4">
          <FilteredZero
            tone="member"
            message={copy.filtered}
            clearLabel={copy.clear}
            onClear={() => setFilters(EMPTY_DIRECTORY_FILTERS)}
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 xl:grid-cols-2">
          {visible.map((card) => (
            <li key={card.id}>
              <DirectoryPerson
                card={card}
                src={photos[card.id] ?? card.portrait_asset}
                self={selfId != null && card.id === selfId}
                status={introStatus ? introStatus(card.id) : null}
                busy={busyId === card.id}
                error={errorId === card.id ? requestError : ''}
                quota={quota}
                onRequest={onRequestIntro ? (reason, askDesk) => onRequestIntro(card.id, reason, askDesk) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {seat.status === 'ready' && !active
          ? progressLine(seat.admitted)
          : `${visible.filter((card) => card.membership_status !== 'invited').length} shown`}
      </p>
    </div>
  )
}

function DirectoryPerson({
  card,
  src,
  self,
  status,
  busy,
  error,
  quota,
  onRequest,
}: {
  card: DirectoryCard
  src: string | null
  self: boolean
  status: IntroStatus | null
  busy: boolean
  error: string
  quota: IntroQuota | null
  onRequest?: (reason: string, askDesk: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const moreId = useId()
  const headline = card.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{card.headline}</p> : null
  const sector = <SectorFields card={card} />
  const firm = card.company ? <Field label="Firm" value={card.company} /> : null
  const vision = card.vision_themes.length > 0 ? <Field label="Vision 2030" value={card.vision_themes.join(', ')} /> : null
  const city = card.location ? <Field label="City" value={card.location} /> : null
  const action = (
    <DirectoryIntroAction
      sample={card.is_demo}
      invited={card.membership_status === 'invited'}
      self={self}
      status={status}
      busy={busy}
      error={error}
      quota={quota}
      onRequest={onRequest}
    />
  )
  return (
    <article className="h-full border border-[var(--ba-line)] bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <Portrait card={card} src={src} />
        <div className="text-end">
          {card.is_demo ? <ExampleMark /> : null}
          {card.preferred_partner ? (
            <div className={card.is_demo ? 'mt-2' : undefined}>
              <SponsorBadge />
            </div>
          ) : null}
          {card.membership_status === 'invited' ? (
            <p className="mt-1 text-[0.85rem] font-semibold text-ink">Invited</p>
          ) : null}
          {card.seat === 'sponsor' ? null : (
            <p className="mt-1 text-[0.85rem] text-[var(--ba-muted)]">{seatLabel(card.seat)}</p>
          )}
          {card.availability ? <AvailabilityMark value={card.availability} /> : null}
        </div>
      </div>
      <h2 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{card.full_name}</h2>
      <div className="md:hidden">
        {headline}
        <dl className="mt-4 space-y-2">
          {sector}
          {firm}
        </dl>
        {open ? (
          <div id={moreId}>
            {vision || city ? (
              <dl className="mt-2 space-y-2">
                {vision}
                {city}
              </dl>
            ) : null}
            {action}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
          aria-expanded={open}
          aria-controls={moreId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Less' : 'More'}
        </button>
      </div>
      <div className="hidden md:block">
        {headline}
        <dl className="mt-4 space-y-2">
          {sector}
          {vision}
          {city}
          {firm}
        </dl>
        {action}
      </div>
    </article>
  )
}

function SectorFields({ card }: { card: DirectoryCard }) {
  const sectors = card.sectors.length > 0 ? card.sectors : card.sector ? [card.sector] : []
  if (sectors.length === 0) return null
  return <Field label="Sector" value={sectors.join(', ')} />
}

function AvailabilityMark({ value }: { value: Availability }) {
  const tone =
    value === 'open' ? 'bg-[var(--ba-success)]' : value === 'selective' ? 'bg-[var(--ba-indigo)]' : 'bg-[var(--ba-muted)]'
  return (
    <p className="mt-1 flex items-center justify-end gap-2 text-[0.85rem] text-ink/70">
      <span className={`inline-block size-2 rounded-full ${tone}`} aria-hidden="true" />
      <span>{availabilityLabel(value)}</span>
    </p>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/40 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink/80">{value}</dd>
    </div>
  )
}

function Portrait({ card, src }: { card: DirectoryCard; src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const photo = src && failedSrc !== src ? src : null
  return (
    <Avatar
      src={photo}
      avatarStyle={card.avatar_style}
      size={56}
      alt=""
      onError={() => {
        if (src) setFailedSrc(src)
      }}
    />
  )
}

function useSignedPortraits(cards: DirectoryCard[]) {
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const key = cards
    .filter((card) => card.avatar_path)
    .map((card) => `${card.id}:${card.avatar_path}`)
    .join('|')

  useEffect(() => {
    const pending = cards.filter((card) => card.avatar_path && !card.portrait_asset)
    if (pending.length === 0) return
    let cancelled = false
    void Promise.all(
      pending.map(async (card) => {
        const path = card.avatar_path
        if (!path) return null
        const { data, error } = await supabase.storage.from('member-avatars').createSignedUrl(path, 600)
        if (error || !data?.signedUrl) return null
        return [card.id, data.signedUrl] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1]
      }
      setPhotos(next)
    })
    return () => {
      cancelled = true
    }
  }, [cards, key])

  return photos
}
