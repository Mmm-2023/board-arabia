import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CapacityFields } from '../../components/CapacityFields'
import { draftFromProfile } from '../../lib/capacity'
import { seatLabel, type FoundingSeat } from '../../lib/member'
import type { MemberAdminRow } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { CardSkeleton, EmptyState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { PEOPLE_TIERS, peopleInTier } from './bits'
import { useAdmin } from './context'

export function PeoplePage() {
  const room = useAdmin()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSeat, setInviteSeat] = useState<FoundingSeat>('ksa')
  const [inviteAdmit, setInviteAdmit] = useState(true)
  const [suspending, setSuspending] = useState<MemberAdminRow | null>(null)
  useNoIndex('People | Board Arabia')

  if (!room.refreshedAt && room.refreshError && room.members.length === 0) return null

  if (room.loading && room.members.length === 0 && room.staffRows.length === 0 && !room.listError) {
    return <CardSkeleton tone="staff" label="Loading people" />
  }

  function onDirectInvite(event: FormEvent) {
    event.preventDefault()
    if (!inviteEmail.trim()) {
      return
    }
    void room.runInvite('invite-direct', {
      email: inviteEmail.trim(),
      seat: inviteSeat,
      admitMember: inviteAdmit,
    })
  }

  return (
    <div>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">People</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-stone/65">
        Members, admins, and sponsors. Invite, suspend, or restore. This screen does not remove
        people. The last master stays in place.
      </p>

      <section className="mt-8 border border-brass/30 px-5 py-5">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Invite</h2>
        <p className="mt-2 max-w-2xl text-[0.9rem] text-stone/65">
          Promotes staff and can admit a founding member. If outbound mail is not connected, the
          one-time link appears here and is not stored in email events.
        </p>
        <form onSubmit={onDirectInvite} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
            Email
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
              className="mt-2 block w-64 border border-pearl/20 bg-ink px-3 py-3 text-[0.9rem] text-pearl normal-case"
            />
          </label>
          <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
            Seat
            <select
              value={inviteSeat}
              onChange={(event) => setInviteSeat(event.target.value as FoundingSeat)}
              className="mt-2 block min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl normal-case"
            >
              <option value="ksa">Saudi Arabia</option>
              <option value="intl">International</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[0.85rem] text-stone/75 normal-case">
            <input
              type="checkbox"
              checked={inviteAdmit}
              onChange={(event) => setInviteAdmit(event.target.checked)}
            />
            Also admit as founding member
          </label>
          <button
            type="submit"
            disabled={room.updatingId === 'invite-direct' || !inviteEmail.trim()}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            Send invite
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.02em]">Members</h2>
        {room.members.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              tone="staff"
              message={STAFF_VIEWS.people.empty}
              action={{ label: 'Applications', to: '/admin/applications' }}
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {room.members.map((member) => (
              <li key={member.user_id} className="border border-pearl/10 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.95rem] text-stone/85">{member.email}</p>
                    <p className="mt-1 text-[0.8rem] text-pearl/45">
                      {seatLabel(member.seat)} · Founding Member · {member.status}
                      {' · '}
                      {member.invites_remaining} of {member.invites_granted} invites left
                    </p>
                  </div>
                  {member.status === 'suspended' ? (
                    <button
                      type="button"
                      disabled={room.updatingId === member.user_id}
                      onClick={() => void room.onMemberStatus(member, 'restore')}
                      className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase disabled:opacity-40"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={room.updatingId === member.user_id}
                      onClick={() => setSuspending(member)}
                      className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase disabled:opacity-40"
                    >
                      Suspend
                    </button>
                  )}
                </div>
                <CapacityFields
                  idPrefix={member.user_id}
                  draft={room.draftFor(
                    member.user_id,
                    draftFromProfile(room.profileByUser[member.user_id] ?? null),
                  )}
                  onChange={(next) => room.setDraft(member.user_id, next)}
                  note="USD only. Suspend removes this member from the public sums immediately. Opting out does the same."
                />
                <button
                  type="button"
                  disabled={room.updatingId === member.user_id}
                  onClick={() => void room.onSaveCapacity(member.user_id)}
                  className="mt-3 inline-flex min-h-11 items-center border border-brass/60 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-brass-bright uppercase disabled:opacity-40"
                >
                  Save capacity
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.02em]">Tiers</h2>
        <div className="mt-6 space-y-8">
          {PEOPLE_TIERS.map((tier) => {
            const rows = peopleInTier(tier, room.staffRows, room.members)
            return (
              <div key={tier}>
                <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
                  {tier}
                </h3>
                <ul className="mt-3 space-y-3">
                  {rows.length === 0 && (
                    <li className="border border-pearl/10 px-5 py-6 text-stone/55">
                      {tier === 'Sponsor' ? 'No sponsors yet. The sponsor portal is not open.' : 'None yet.'}
                    </li>
                  )}
                  {rows.map((row) => (
                    <li
                      key={`${tier}-${row.email}`}
                      className="flex flex-wrap items-center justify-between gap-3 border border-pearl/10 px-5 py-4"
                    >
                      <div>
                        <p className="text-[0.95rem] text-stone/85">{row.email}</p>
                        <p className="mt-1 text-[0.8rem] text-pearl/45">{row.detail}</p>
                      </div>
                      <span className="border border-pearl/20 px-2 py-1 text-[0.68rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                        {tier}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-[0.9rem] text-pearl/45">
          <Link to="/admin/applications" className="text-brass-bright">
            Applications
          </Link>{' '}
          is where a seat is admitted.
        </p>
      </section>

      {suspending && (
        <ConfirmDialog
          tone="staff"
          title="Suspend this member?"
          body="They lose dashboard access until restored. Confirm to suspend. Cancel leaves the seat active."
          busy={room.updatingId === suspending.user_id}
          onCancel={() => setSuspending(null)}
          onConfirm={() => {
            const row = suspending
            setSuspending(null)
            void room.onMemberStatus(row, 'suspend')
          }}
        />
      )}
    </div>
  )
}
