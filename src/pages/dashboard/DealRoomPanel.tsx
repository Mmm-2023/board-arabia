import { useState } from 'react'
import { Link } from 'react-router-dom'
import { seatLabel } from '../../lib/member'
import {
  DEAL_COPY,
  inviteStatusLabel,
  linkedSubject,
  peopleLine,
  roomPowers,
  statusLabel,
  type DirectoryInvitee,
  type MemberDealRoom,
  type SubjectOption,
} from '../../lib/dealRoomView'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { ErrorBanner, FilteredZero } from '../../shell/ViewState'

const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none focus:border-brass'

type Confirm =
  | { kind: 'close' }
  | { kind: 'archive' }
  | { kind: 'remove'; memberId: string; name: string }

export function DealRoomPanel({
  room,
  mandates,
  opportunities,
  inviteQuery,
  invitees,
  inviteStatus,
  inviteMessage,
  actionError,
  busy,
  onRename,
  onSearch,
  onInvite,
  onRemove,
  onClose,
  onArchive,
  onAccept,
  onDecline,
}: {
  room: MemberDealRoom
  mandates: SubjectOption[]
  opportunities: SubjectOption[]
  inviteQuery: string
  invitees: DirectoryInvitee[]
  inviteStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'denied'
  inviteMessage: string
  actionError: string
  busy: boolean
  onRename: (name: string, purpose: string) => void
  onSearch: (query: string) => void
  onInvite: (memberId: string) => void
  onRemove: (memberId: string) => void
  onClose: () => void
  onArchive: () => void
  onAccept: () => void
  onDecline: () => void
}) {
  const powers = roomPowers(room)
  const subject = linkedSubject(room, mandates, opportunities)
  const [name, setName] = useState(room.name)
  const [purpose, setPurpose] = useState(room.purpose)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [draftRoom, setDraftRoom] = useState(room.id)
  if (room.id !== draftRoom) {
    setDraftRoom(room.id)
    setName(room.name)
    setPurpose(room.purpose)
    setConfirm(null)
  }

  return (
    <div data-deal-manage="" className="max-w-3xl">
      <Link
        to="/dashboard/deals/rooms"
        className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
      >
        Rooms
      </Link>
      <p className="mt-4 text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        {statusLabel(room.status)}
      </p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em] text-balance">{room.name}</h1>
      {room.purpose ? <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">{room.purpose}</p> : null}
      <p className="mt-3 text-[0.95rem] text-ink/60">
        {peopleLine(room)}
        {subject ? ` · ${subject}` : ''}
      </p>

      {room.status === 'archived' ? <Note>{DEAL_COPY.archived}</Note> : null}
      {room.status === 'closed' ? <Note>{DEAL_COPY.closed}</Note> : null}
      {room.myRole !== 'owner' && !powers.accept && !powers.decline ? <Note>{DEAL_COPY.readOnly}</Note> : null}

      {actionError ? (
        <p className="mt-5 text-[0.98rem] text-[var(--ba-error)]" role="alert">
          {actionError}
        </p>
      ) : null}

      {powers.accept || powers.decline ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {powers.accept ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Accept
            </button>
          ) : null}
          {powers.decline ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Decline
            </button>
          ) : null}
        </div>
      ) : null}

      {powers.rename ? (
        <form
          className="mt-8 max-w-xl border border-[var(--ba-line)] bg-white px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(name, purpose)
          }}
        >
          <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">Rename</h2>
          <label className="mt-4 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              Room name (required)
            </span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required className={fieldClass} />
          </label>
          <label className="mt-4 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              Purpose (required)
            </span>
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              maxLength={400}
              required
              rows={3}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            Save
          </button>
        </form>
      ) : null}

      <section aria-label="People" className="mt-8">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">People</h2>
        <ul className="mt-3 grid gap-3">
          {room.participants.map((person) => (
            <li key={person.memberId} className="border border-[var(--ba-line)] bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[1rem] text-ink">{person.fullName}</p>
                  <p className="mt-1 text-[0.92rem] text-ink/60">
                    {person.role === 'owner' ? 'Owner' : 'Member'} · {inviteStatusLabel(person.inviteStatus)}
                  </p>
                </div>
                {powers.remove && person.role !== 'owner' && person.inviteStatus !== 'removed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'remove', memberId: person.memberId, name: person.fullName })}
                    className="inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/60 uppercase"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {powers.invite ? (
        <section aria-label="Invite" data-deal-invite="" className="mt-8 max-w-xl">
          <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">Invite</h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">{DEAL_COPY.searchHint}</p>
          <label className="mt-4 block">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              Search directory
            </span>
            <input
              value={inviteQuery}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Name or company"
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          {inviteStatus === 'loading' ? <p className="mt-3 text-[0.95rem] text-ink/55">Searching…</p> : null}
          {inviteStatus === 'denied' ? <p className="mt-3 text-[0.95rem] text-ink/70">{DEAL_COPY.inviteDenied}</p> : null}
          {inviteStatus === 'error' ? (
            <div className="mt-3">
              <ErrorBanner tone="member" message={inviteMessage || "Couldn't search. Retry."} retryLabel="Retry" onRetry={() => onSearch(inviteQuery)} />
            </div>
          ) : null}
          {inviteStatus === 'empty' ? (
            <div className="mt-3">
              <FilteredZero tone="member" message={DEAL_COPY.noMatches} onClear={() => onSearch('')} clearLabel="Clear search" />
            </div>
          ) : null}
          {inviteStatus === 'ready' ? (
            <ul className="mt-3 grid gap-3">
              {invitees.map((person) => (
                <li key={person.id} className="border border-[var(--ba-line)] bg-white px-4 py-4">
                  <p className="text-[1rem] text-ink">{person.fullName}</p>
                  {person.headline ? <p className="mt-1 text-[0.95rem] text-ink/70">{person.headline}</p> : null}
                  <p className="mt-1 text-[0.92rem] text-ink/55">
                    {[person.company, seatLabel(person.seat)].filter(Boolean).join(' · ')}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onInvite(person.id)}
                    className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
                  >
                    Invite
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {powers.close || powers.archive ? (
        <div className="mt-10 flex flex-wrap gap-3 border-t border-[var(--ba-line)] pt-6">
          {powers.close ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'close' })}
              className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              Close room
            </button>
          ) : null}
          {powers.archive ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'archive' })}
              className="inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/55 uppercase disabled:opacity-40"
            >
              Archive room
            </button>
          ) : null}
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          tone="member"
          title={confirmTitle(confirm)}
          body={confirmBody(confirm)}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'close') onClose()
            if (confirm.kind === 'archive') onArchive()
            if (confirm.kind === 'remove') onRemove(confirm.memberId)
            setConfirm(null)
          }}
        />
      ) : null}
    </div>
  )
}

function Note({ children }: { children: string }) {
  return <p className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-ink/70">{children}</p>
}

function confirmTitle(confirm: Confirm): string {
  if (confirm.kind === 'close') return 'Close this room?'
  if (confirm.kind === 'archive') return 'Archive this room?'
  return `Remove ${confirm.name}?`
}

function confirmBody(confirm: Confirm): string {
  if (confirm.kind === 'close') return 'People will no longer be able to join. You can still archive it later.'
  if (confirm.kind === 'archive') return 'The room stays on record. You cannot reopen it here.'
  return `${confirm.name} will leave this room.`
}
