import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CapacityFields } from '../../components/CapacityFields'
import { DefaultPicturePicker } from '../../components/DefaultPicturePicker'
import { SignedAvatar } from '../../components/SignedAvatar'
import { normalizeAvatarStyle, type AvatarStyle } from '../../lib/avatarStyle'
import { draftFromProfile } from '../../lib/capacity'
import { peopleCardLine } from '../../lib/membershipTiers'
import type { FoundingSeat } from '../../lib/member'
import { firmByUserId, sponsorCapView } from '../../lib/sponsorSeat'
import { inviteSponsor, staffSetAvatarStyle, staffSetMemberTiers, type DryRunInvite, type MemberAdminRow } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ConfirmDialog } from '../../shell/ConfirmDialog'
import { CardSkeleton, EmptyState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { MembershipTiersControl, type TierShot } from './MembershipTiersControl'
import { ownStaffRowLabel } from '../../lib/staffDisplayName'
import { PEOPLE_TIERS, PanelNotice, peopleInTier } from './bits'
import { StaffOwnNameCard } from './StaffOwnNameCard'
import { useOwnStaffName } from './useOwnStaffName'
import { useAdmin } from './context'
import { SponsorInvitePanel } from './SponsorInvitePanel'
import { SponsorSeatPanel } from './SponsorSeatPanel'

export function PeoplePage({ tierShots }: { tierShots?: Record<string, TierShot> } = {}) {
  const room = useAdmin()
  const ownName = useOwnStaffName()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSeat, setInviteSeat] = useState<FoundingSeat>('ksa')
  const [inviteAdmit, setInviteAdmit] = useState(true)
  const [inviteRole, setInviteRole] = useState<'staff' | 'master'>('staff')
  const [suspending, setSuspending] = useState<MemberAdminRow | null>(null)
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [sponsorFirm, setSponsorFirm] = useState('')
  const [sponsorEmail, setSponsorEmail] = useState('')
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false)
  const [sponsorError, setSponsorError] = useState('')
  const [sponsorSuccess, setSponsorSuccess] = useState('')
  const [sponsorDryRun, setSponsorDryRun] = useState<DryRunInvite | null>(null)
  const [styleBusy, setStyleBusy] = useState<string | null>(null)
  const [styleOverride, setStyleOverride] = useState<Record<string, AvatarStyle>>({})
  const [styleError, setStyleError] = useState('')
  const location = useLocation()
  const focusId = location.hash.startsWith('#member-') ? location.hash.slice(1) : ''
  useNoIndex('People | Board Arabia')

  useEffect(() => {
    if (!focusId) return
    document.getElementById(focusId)?.scrollIntoView({ block: 'start' })
  }, [focusId, room.members.length])
  const sponsorCap = sponsorCapView(room.members)
  const sponsorCapKnown = room.hasLoaded && !room.panelFailed.members

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
      ...(inviteRole === 'master' ? { role: 'master' as const } : {}),
    })
  }

  async function onSponsorSubmit() {
    if (!sponsorCapKnown || sponsorCap.full || sponsorSubmitting) return
    const company = sponsorFirm.trim()
    const email = sponsorEmail.trim()
    if (!company || !email) return
    setSponsorSubmitting(true)
    setSponsorError('')
    setSponsorSuccess('')
    setSponsorDryRun(null)
    const result = await inviteSponsor({ email, company })
    setSponsorSubmitting(false)
    if (result.error) {
      setSponsorError(result.error)
      setSponsorDryRun(result.dryRunInvite ?? null)
      room.refresh()
      return
    }
    setSponsorFirm('')
    setSponsorEmail('')
    setSponsorOpen(false)
    setSponsorSuccess(result.message || 'Partner invited.')
    setSponsorDryRun(result.dryRunInvite ?? null)
    room.refresh()
  }

  function styleFor(userId: string) {
    return styleOverride[userId] ?? normalizeAvatarStyle(room.profileByUser[userId]?.avatar_style)
  }

  async function onStyle(userId: string, patch: { avatar_style: AvatarStyle }) {
    const previous = styleFor(userId)
    setStyleOverride((current) => ({ ...current, [userId]: patch.avatar_style }))
    setStyleBusy(userId)
    setStyleError('')
    const result = await staffSetAvatarStyle(userId, patch.avatar_style)
    setStyleBusy(null)
    if (result.error) {
      setStyleOverride((current) => ({ ...current, [userId]: previous }))
      setStyleError('Could not save the default picture.')
      return
    }
    room.refresh()
  }

  return (
    <div>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">People</h1>
      <p className="mt-3 max-w-2xl text-[0.95rem] text-stone/65">
        Members, admins, and partners. Invite, suspend, or restore. This screen does not remove
        people. The last master stays in place.
      </p>

      <SponsorInvitePanel
        members={room.members}
        firmByUser={firmByUserId(room.profileByUser)}
        capKnown={sponsorCapKnown}
        countError={Boolean(room.panelFailed.members)}
        submitting={sponsorSubmitting}
        open={sponsorOpen && !sponsorCap.full}
        firm={sponsorFirm}
        email={sponsorEmail}
        error={sponsorError}
        success={sponsorSuccess}
        dryRunInvite={sponsorDryRun}
        onOpen={() => setSponsorOpen(true)}
        onCancel={() => setSponsorOpen(false)}
        onFirm={setSponsorFirm}
        onEmail={setSponsorEmail}
        onSubmit={() => void onSponsorSubmit()}
      />
      <SponsorSeatPanel />

      {room.staffRole === 'master' ? (
        <section data-add-admin="true" className="mt-8 border border-brass/30 px-5 py-5">
          <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Add admin</h2>
          <p className="mt-2 max-w-2xl text-[0.9rem] text-stone/65">
            Adds an admin. Leave Role on Admin for a new admin. Choose Master only when this
            person should be a master. An existing role stays as it is unless you choose Master.
            You can also admit a founding member. If outbound mail is not connected, the one-time
            link appears here and is not stored in email events.
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
            <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
              Role
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value === 'master' ? 'master' : 'staff')}
                className="mt-2 block min-h-11 border border-pearl/20 bg-ink px-3 text-[0.9rem] text-pearl normal-case"
              >
                <option value="staff">Admin</option>
                <option value="master">Master</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[0.85rem] text-stone/75 normal-case">
              <input
                type="checkbox"
                className="size-5 shrink-0"
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
              Add admin
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.02em]">Members</h2>
        {room.panelFailed.profiles ? (
          <div className="mt-4 border border-pearl/10 px-5 py-4">
            <PanelNotice />
          </div>
        ) : null}
        {room.panelFailed.members ? (
          <div className="mt-4 border border-pearl/10 px-5 py-4">
            <PanelNotice />
          </div>
        ) : null}
        {styleError ? (
          <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
            {styleError}
          </p>
        ) : null}
        {room.members.length === 0 && !room.panelFailed.members ? (
          <div className="mt-4">
            <EmptyState
              tone="staff"
              message={STAFF_VIEWS.people.empty}
              action={{ label: 'Applications', to: '/admin/applications' }}
            />
          </div>
        ) : room.members.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {room.members.map((member) => (
              <li
                key={member.user_id}
                id={`member-${member.user_id}`}
                className={`scroll-mt-24 max-w-full border py-4 ps-5 pe-16 ${
                  focusId === `member-${member.user_id}` ? 'border-brass/70' : 'border-pearl/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <SignedAvatar
                      path={room.profileByUser[member.user_id]?.avatar_path ?? null}
                      avatarStyle={styleFor(member.user_id)}
                      size={40}
                      alt=""
                    />
                    <div className="min-w-0">
                    <p className="truncate text-[0.95rem] text-stone/85">{member.email}</p>
                    <Link
                      to={`/admin/people/member/${member.user_id}`}
                      className="mt-1 inline-flex min-h-11 items-center text-[0.8rem] font-semibold text-brass-bright underline"
                    >
                      Open record
                    </Link>
                    <p className="mt-1 text-[0.8rem] break-words text-pearl/45">
                      {peopleCardLine(member)}
                      {member.seat !== 'sponsor' && (
                        <>
                          {' · '}
                          {member.invites_remaining} of {member.invites_granted} invites left
                        </>
                      )}
                    </p>
                    </div>
                  </div>
                  {member.status === 'suspended' ? (
                    <button
                      type="button"
                      disabled={room.updatingId === member.user_id}
                      onClick={() => void room.onMemberStatus(member, 'restore')}
                      className="inline-flex min-h-11 shrink-0 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold text-pearl/80 disabled:opacity-40"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={room.updatingId === member.user_id}
                      onClick={() => setSuspending(member)}
                      className="inline-flex min-h-11 shrink-0 items-center border border-pearl/30 px-3 text-[0.75rem] font-semibold text-pearl/80 disabled:opacity-40"
                    >
                      Suspend
                    </button>
                  )}
                </div>
                <MembershipTiersControl
                  member={member}
                  shot={tierShots?.[member.user_id]}
                  onSave={async (tiers) => {
                    const result = await staffSetMemberTiers(member.user_id, tiers)
                    if (!result.error) room.refresh()
                    return result
                  }}
                />
                <div className="mt-4">
                  <DefaultPicturePicker
                    tone="staff"
                    value={styleFor(member.user_id)}
                    disabled={styleBusy === member.user_id}
                    onSave={(patch) => void onStyle(member.user_id, patch)}
                  />
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
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.02em]">Tiers</h2>
        <StaffOwnNameCard
          savedName={ownName.name}
          ready={ownName.ready}
          busy={ownName.busy}
          error={ownName.error}
          onSave={(value) => void ownName.save(value)}
        />
        {room.panelFailed.staff ? (
          <div className="mt-4 border border-pearl/10 px-5 py-4">
            <PanelNotice />
          </div>
        ) : null}
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
                      {tier === 'Partner' ? 'No partners invited yet.' : 'None yet.'}
                    </li>
                  )}
                  {rows.map((row) => {
                    const member = room.members.find((item) => item.email.toLowerCase() === row.email.toLowerCase())
                    const profile = member ? room.profileByUser[member.user_id] : null
                    const self = row.email.toLowerCase() === room.email.toLowerCase()
                    const role = tier === 'Master' ? 'Master' : tier === 'Admin' ? 'Admin' : null
                    const label = role ? ownStaffRowLabel(row.email, role, self, ownName.name) : row.email
                    return (
                    <li
                      key={`${tier}-${row.email}`}
                      className="flex max-w-full flex-wrap items-center justify-between gap-3 border border-pearl/10 py-4 ps-5 pe-16"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SignedAvatar
                          path={profile?.avatar_path ?? null}
                          avatarStyle={member ? styleFor(member.user_id) : 'male'}
                          size={36}
                          alt=""
                        />
                        <div className="min-w-0">
                        <p className="text-[0.95rem] break-words text-stone/85">{label}</p>
                        <p className="mt-1 text-[0.8rem] text-pearl/45">{row.detail}</p>
                        </div>
                      </div>
                      <div className="flex max-w-full flex-wrap gap-1.5" aria-label={`Tiers for ${row.email}`}>
                        {row.pills.map((pill) => (
                          <span
                            key={pill.id}
                            data-tier-pill={pill.id}
                            className="inline-flex items-center rounded-full bg-[var(--ba-lavender-mist)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ba-ink)]"
                          >
                            {pill.label}
                          </span>
                        ))}
                      </div>
                    </li>
                    )
                  })}
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
