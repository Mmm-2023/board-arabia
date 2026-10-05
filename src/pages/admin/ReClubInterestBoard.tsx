import { useState } from 'react'
import { isRoomId, type ReClubGroup } from '../../lib/reClubInterest'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { EmptyState, ErrorBanner, toneClasses } from '../../shell/ViewState'

export type ReClubStaffStatus = 'loading' | 'error' | 'denied' | 'unavailable' | 'ready'

const copy = STAFF_VIEWS.reClub

export function ReClubInterestBoard({
  status,
  rows,
  busyId,
  notice,
  onRetry,
  onCreate,
  onLink,
}: {
  status: ReClubStaffStatus
  rows: ReClubGroup[]
  busyId: string | null
  notice: string
  onRetry: () => void
  onCreate: (opportunityId: string) => void
  onLink: (opportunityId: string, roomId: string) => void
}) {
  const styles = toneClasses('staff')
  return (
    <section aria-label={copy.title} data-re-club-staff="true" className="mt-8">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.14em] uppercase ${styles.quiet}`}>{copy.title}</h2>
      <p className={`mt-2 max-w-xl text-[0.98rem] leading-relaxed ${styles.muted}`}>{copy.lead}</p>
      {status === 'loading' ? (
        <div aria-busy="true" aria-label={copy.loading} className="mt-4 space-y-3">
          <div className={`h-24 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
          <div className={`h-24 ${styles.skeleton} motion-reduce:animate-none animate-pulse`} />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="mt-4">
          <ErrorBanner tone="staff" message={copy.error} retryLabel={copy.retry} onRetry={onRetry} />
        </div>
      ) : null}
      {status === 'denied' ? <p className={`mt-4 ${styles.muted}`}>{copy.denied}</p> : null}
      {status === 'unavailable' ? <p className={`mt-4 ${styles.muted}`}>{copy.unavailable}</p> : null}
      {status === 'ready' && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState tone="staff" message={copy.empty} action={{ label: copy.emptyAction, to: '/admin/rooms' }} />
        </div>
      ) : null}
      {notice ? (
        <p className={`mt-4 ${styles.alert}`} role="alert">
          {notice}
        </p>
      ) : null}
      {status === 'ready' && rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <ClubRow
              key={row.opportunity_id}
              row={row}
              busy={busyId === row.opportunity_id}
              onCreate={() => onCreate(row.opportunity_id)}
              onLink={(roomId) => onLink(row.opportunity_id, roomId)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ClubRow({
  row,
  busy,
  onCreate,
  onLink,
}: {
  row: ReClubGroup
  busy: boolean
  onCreate: () => void
  onLink: (roomId: string) => void
}) {
  const styles = toneClasses('staff')
  const [roomId, setRoomId] = useState('')
  const [roomError, setRoomError] = useState(false)
  const linked = Boolean(row.room_id)
  const open = row.room_status === 'open'
  const fieldId = `re-club-room-${row.opportunity_id}`
  const place = [row.sector, row.city, row.asset_class].filter((part) => part.length > 0).join('. ')

  function link() {
    const next = roomId.trim()
    if (!isRoomId(next)) {
      setRoomError(true)
      return
    }
    setRoomError(false)
    onLink(next)
  }

  return (
    <li data-re-club-opportunity={row.opportunity_id} className={`${styles.panel} px-4 py-4`}>
      <p className="font-display text-[1.2rem] font-semibold">{row.one_liner}</p>
      <p className={`mt-1 ${styles.muted}`}>{place}</p>
      <p className={`mt-3 text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>{copy.members}</p>
      {row.members.length === 0 ? (
        <p className={`mt-2 ${styles.muted}`}>Member</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {row.members.map((member) => (
            <li key={member.member_id} data-re-club-member={member.member_id} className={styles.muted}>
              {member.member_name}
            </li>
          ))}
        </ul>
      )}
      {linked && open ? (
        <p className={`mt-3 ${styles.muted}`} data-re-club-linked="true">
          {copy.linked} {row.room_name}
        </p>
      ) : null}
      {linked && !open ? <p className={`mt-3 ${styles.muted}`}>{copy.closed}</p> : null}
      <div className="mt-3 flex flex-wrap gap-3">
        {!linked || open ? (
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            data-re-club-create="true"
            onClick={onCreate}
            className="ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto"
          >
            {linked ? copy.add : copy.create}
          </button>
        ) : null}
      </div>
      {!linked ? (
        <div className="mt-4">
          <label htmlFor={fieldId} className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
            {copy.roomLabel}
          </label>
          <p className={`mt-1 ${styles.muted}`}>{copy.roomHint}</p>
          <input
            id={fieldId}
            value={roomId}
            onChange={(event) => {
              setRoomId(event.target.value)
              setRoomError(false)
            }}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 min-h-11 w-full border border-[var(--ba-line)] bg-white px-3 text-[0.95rem] text-ink"
          />
          {roomError ? (
            <p className={`mt-2 ${styles.alert}`} role="alert">
              {copy.roomInvalid}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            data-re-club-link="true"
            onClick={link}
            className={`mt-3 inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto ${styles.secondary}`}
          >
            {copy.link}
          </button>
        </div>
      ) : null}
    </li>
  )
}
