import { useState } from 'react'
import { CapacityFields } from '../../components/CapacityFields'
import { draftFromApplication, usdSuggestionNote } from '../../lib/capacity'
import { seatLabel, type FoundingSeat } from '../../lib/member'
import type { Application } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { CardSkeleton, EmptyState, FilteredZero } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { StatusBadge, peerMeta } from './bits'
import { useAdmin } from './context'

type AppFilter = 'all' | 'pending' | 'review' | 'admitted' | 'closed'

const FILTERS: { id: AppFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'review', label: 'In review' },
  { id: 'admitted', label: 'Admitted' },
  { id: 'closed', label: 'Closed' },
]

export function ApplicationsPage() {
  const room = useAdmin()
  const [filter, setFilter] = useState<AppFilter>('all')
  const [rejecting, setRejecting] = useState<Application | null>(null)
  useNoIndex('Applications | Board Arabia')

  if (!room.refreshedAt && room.refreshError && room.apps.length === 0) return null

  if (room.loading && room.apps.length === 0 && !room.listError) {
    return <CardSkeleton tone="staff" label="Loading applications" />
  }

  const visible = room.apps.filter((app) => matches(app, filter))

  return (
    <div>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Applications</h1>
      <p className="mt-2 text-[0.95rem] text-stone/65">
        Accept, reject, or admit. Seat is Saudi Arabia or International. Cards keep the same fields
        on a phone.
      </p>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter applications">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`inline-flex min-h-11 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase ${
              filter === item.id
                ? 'border-brass bg-brass text-ink'
                : 'border-pearl/20 text-pearl/70'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {room.apps.length === 0 ? (
        <div className="mt-6">
          <EmptyState tone="staff" message={STAFF_VIEWS.applications.empty} />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <FilteredZero
            tone="staff"
            message={STAFF_VIEWS.applications.filtered}
            clearLabel={STAFF_VIEWS.applications.clear}
            onClear={() => setFilter('all')}
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {visible.map((app) => (
            <li key={app.id} className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-pearl/40 uppercase">
                    {new Date(app.created_at).toLocaleString()}
                  </p>
                  <p className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                    {app.full_name || app.job_titles}
                  </p>
                  <p className="mt-1 text-[0.95rem] text-stone/70">
                    {app.companies?.split('\n')[0] || 'Company not listed'}
                  </p>
                  {app.email && (
                    <p className="mt-1 text-[0.9rem] text-stone/65">
                      {app.email}
                      {app.phone ? ` · ${app.phone}` : ''}
                    </p>
                  )}
                </div>
                <StatusBadge status={app.status} />
              </div>
              <dl className="mt-4 grid gap-3 text-[0.92rem] md:grid-cols-2">
                <div>
                  <dt className="text-pearl/40">Turnover</dt>
                  <dd className="mt-0.5 text-stone/85">{app.turnover}</dd>
                </div>
                <div>
                  <dt className="text-pearl/40">FO / AUM</dt>
                  <dd className="mt-0.5 text-stone/85">{app.fo_aum || 'Not provided'}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-pearl/40">Job titles</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-stone/85">{app.job_titles}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-pearl/40">Companies</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-stone/85">{app.companies}</dd>
                </div>
                {app.linkedin_url && (
                  <div className="md:col-span-2">
                    <dt className="text-pearl/40">LinkedIn</dt>
                    <dd className="mt-0.5">
                      <a
                        href={app.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brass-bright underline-offset-2 hover:underline"
                      >
                        {app.linkedin_url}
                      </a>
                    </dd>
                  </div>
                )}
                {(app.invited_by_member_id || app.invite_reason) && (
                  <div className="md:col-span-2">
                    <dt className="text-pearl/40">Peer invite</dt>
                    <dd className="mt-0.5 text-stone/85">
                      Invited by{' '}
                      {room.members.find((member) => member.user_id === app.invited_by_member_id)?.email ||
                        'a member'}
                      {app.invite_reason ? `. Why: ${app.invite_reason}` : ''}
                      {peerMeta(room.peerInvites, app) ? `. ${peerMeta(room.peerInvites, app)}` : ''}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-pearl/40">Public totals</dt>
                  <dd className="mt-0.5 text-stone/85">
                    {app.include_in_public_aggregates === true
                      ? 'Opted in'
                      : app.include_in_public_aggregates === false
                        ? 'Opted out'
                        : 'Not asked'}
                  </dd>
                </div>
                {app.calendar_slot && (
                  <div className="md:col-span-2">
                    <dt className="text-pearl/40">Meeting / invite meta</dt>
                    <dd className="mt-0.5 text-stone/85">
                      {app.calendar_slot}
                      {app.invite_event_id ? ` · event ${app.invite_event_id}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
              {app.founding_seat && (
                <p className="mt-4 text-[0.9rem] text-stone/70">
                  Founding seat · {seatLabel(app.founding_seat)}
                </p>
              )}
              {(app.status === 'accepted' || app.status === 'verified') && (
                <CapacityFields
                  idPrefix={app.id}
                  draft={room.draftFor(app.id, draftFromApplication(app))}
                  onChange={(next) => room.setDraft(app.id, next)}
                  note={usdSuggestionNote(app.turnover, app.fo_aum)}
                />
              )}
              {app.investable_capacity_usd != null && (
                <p className="mt-3 text-[0.85rem] text-pearl/50">
                  Declared investable capacity on the application. Public totals use the verified
                  member figure, not this line alone.
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    room.updatingId === app.id ||
                    app.status === 'accepted' ||
                    app.status === 'verified' ||
                    app.status === 'admitted'
                  }
                  onClick={() => void room.onAccept(app.id)}
                  className={`inline-flex min-h-11 items-center px-3 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                    app.status === 'accepted' || app.status === 'verified'
                      ? 'bg-brass text-ink'
                      : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                  }`}
                >
                  Accept
                </button>
                {(app.status === 'accepted' || app.status === 'verified') && (
                  <>
                    <label className="ml-1 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/45 uppercase">
                      <span className="sr-only">Founding seat</span>
                      <select
                        value={room.seatById[app.id] ?? ''}
                        onChange={(event) =>
                          room.setSeat(app.id, event.target.value as FoundingSeat | '')
                        }
                        className="min-h-11 border border-pearl/20 bg-ink px-2 text-pearl"
                      >
                        <option value="">Seat</option>
                        <option value="ksa">Saudi Arabia</option>
                        <option value="intl">International</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={room.updatingId === app.id}
                      onClick={() => void room.onAdmit(app.id)}
                      className="inline-flex min-h-11 items-center border border-brass/60 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-brass-bright uppercase disabled:opacity-40"
                    >
                      Admit
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={
                    room.updatingId === app.id ||
                    app.status === 'rejected' ||
                    app.status === 'declined' ||
                    app.status === 'admitted'
                  }
                  onClick={() => setRejecting(app)}
                  className={`inline-flex min-h-11 items-center px-3 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 sm:ml-4 ${
                    app.status === 'rejected' || app.status === 'declined'
                      ? 'bg-brass text-ink'
                      : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                  }`}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <ConfirmDialog
          tone="staff"
          title="Reject this application?"
          body="Confirm sends the decline. Cancel leaves the application unchanged."
          busy={room.updatingId === rejecting.id}
          onCancel={() => setRejecting(null)}
          onConfirm={() => {
            const id = rejecting.id
            setRejecting(null)
            void room.onReject(id)
          }}
        />
      )}
    </div>
  )
}

function matches(app: Application, filter: AppFilter) {
  if (filter === 'pending') return app.status === 'pending'
  if (filter === 'review') return app.status === 'accepted' || app.status === 'verified'
  if (filter === 'admitted') return app.status === 'admitted'
  if (filter === 'closed') return app.status === 'rejected' || app.status === 'declined'
  return true
}
