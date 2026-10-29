import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminProfileChips,
  filterProfiles,
  parseProfileList,
  profileCountLine,
  profileStatusLabel,
  profileUpdatedLabel,
  type ProfileListRow,
} from '../../lib/adminProfileList'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, FilteredZero, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'

type LoadStatus = 'loading' | 'ready' | 'error' | 'denied'

export type ProfilesPreview = {
  status: LoadStatus
  rows?: ProfileListRow[]
  introsOff?: boolean
  cardIncomplete?: boolean
}

const copy = STAFF_VIEWS.people

export function AdminProfilesPage({ preview }: { preview?: ProfilesPreview } = {}) {
  const [status, setStatus] = useState<LoadStatus>(preview?.status ?? 'loading')
  const [rows, setRows] = useState<ProfileListRow[]>(preview?.rows ?? [])
  const [introsOff, setIntrosOff] = useState(preview?.introsOff === true)
  const [cardIncomplete, setCardIncomplete] = useState(preview?.cardIncomplete === true)
  const [reloadKey, setReloadKey] = useState(0)
  useNoIndex('Profiles | Board Arabia')

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void supabase.rpc('staff_list_profiles').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        const denied = /not_allowed|42501/i.test(error.message)
        setRows([])
        setStatus(denied ? 'denied' : 'error')
        return
      }
      const parsed = parseProfileList(data)
      if (!parsed) {
        setRows([])
        setStatus('error')
        return
      }
      setRows(parsed)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [preview, reloadKey])

  const counted = rows.map((row) => adminProfileChips(row))
  const visible = filterProfiles(rows, { introsOff, cardIncomplete })

  return (
    <section aria-labelledby="admin-profiles-title" data-profiles="">
      <h1 id="admin-profiles-title" className="font-display text-[2rem] font-semibold tracking-[-0.03em]">
        Profiles
      </h1>
      <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-pearl/75">
        Who has a usable profile, and whose weekly intros are off. Names and status only.
      </p>

      {status === 'loading' ? (
        <div className="mt-6">
          <CardSkeleton tone="staff" label="Loading profiles" />
        </div>
      ) : null}

      {status === 'denied' ? (
        <div className="mt-6">
          <PermissionState tone="staff" message="This list is for admin." />
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message="Could not load profiles."
            retryLabel={copy.retry}
            onRetry={() => {
              setStatus('loading')
              setRows([])
              setReloadKey((value) => value + 1)
            }}
          />
        </div>
      ) : null}

      {status === 'ready' ? (
        <>
          <p className="mt-6 text-[1.05rem] text-pearl" data-profile-count="">
            {profileCountLine(counted)}
          </p>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                tone="staff"
                message={copy.empty}
                action={{ label: 'Applications', to: '/admin/applications' }}
              />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filters">
                <FilterButton pressed={introsOff} onClick={() => setIntrosOff((value) => !value)}>
                  Intros off
                </FilterButton>
                <FilterButton pressed={cardIncomplete} onClick={() => setCardIncomplete((value) => !value)}>
                  Card incomplete
                </FilterButton>
              </div>
              <p className="mt-3 text-[0.85rem] text-pearl/60">Sorted by last updated.</p>
              {visible.length === 0 ? (
                <div className="mt-4">
                  <FilteredZero
                    tone="staff"
                    message={copy.filtered}
                    clearLabel={copy.clear}
                    onClear={() => {
                      setIntrosOff(false)
                      setCardIncomplete(false)
                    }}
                  />
                </div>
              ) : (
                <ProfileRows rows={visible} />
              )}
            </>
          )}
        </>
      ) : null}
    </section>
  )
}

function FilterButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-12 items-center rounded-full px-4 text-[0.875rem] font-semibold ${
        pressed ? 'bg-[var(--ba-indigo)] text-white' : 'border border-white/25 text-pearl'
      }`}
    >
      {children}
    </button>
  )
}

function ProfileRows({ rows }: { rows: ProfileListRow[] }) {
  return (
    <div className="mt-4">
      <div className="hidden px-4 text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/50 uppercase lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.8fr)_6.5rem_minmax(0,1.6fr)_11rem] lg:gap-3">
        <span>Name</span>
        <span>Seat</span>
        <span>Status</span>
        <span>Profile</span>
        <span>Updated</span>
      </div>
      <ul className="mt-2 space-y-3 lg:mt-2">
        {rows.map((row) => {
          const chips = adminProfileChips(row)
          return (
            <li key={row.member_id}>
              <Link
                to={`/admin/people/member/${row.member_id}`}
                data-profile-name={row.display_name}
                className="flex min-h-12 flex-col gap-2 border border-white/15 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.8fr)_6.5rem_minmax(0,1.6fr)_11rem] lg:items-center lg:gap-3"
              >
                <span className="font-display text-[1.05rem] font-semibold text-pearl">{row.display_name}</span>
                <span className="text-[0.95rem] text-pearl/80">{row.seat_label}</span>
                <span className="inline-flex w-fit min-h-8 items-center rounded-full border border-white/25 px-3 text-[0.75rem] font-semibold text-pearl">
                  {profileStatusLabel(row.status)}
                </span>
                <span className="flex flex-wrap gap-2">
                  <StatusChip on={chips.cardComplete}>{chips.cardComplete ? 'Card complete' : 'Card incomplete'}</StatusChip>
                  <StatusChip on={chips.introsOn}>{chips.introsOn ? 'Intros on' : 'Intros off'}</StatusChip>
                  {chips.seatMatchesOn == null ? null : (
                    <StatusChip on={chips.seatMatchesOn}>
                      {chips.seatMatchesOn ? 'Seat matches on' : 'Seat matches off'}
                    </StatusChip>
                  )}
                </span>
                <span className="text-[0.85rem] text-pearl/70">{profileUpdatedLabel(row.profile_updated_at)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StatusChip({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full px-3 text-[0.75rem] font-semibold ${
        on ? 'bg-[var(--ba-indigo)] text-white' : 'border border-white/25 text-pearl/80'
      }`}
    >
      {children}
    </span>
  )
}
