import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate } from 'react-router-dom'
import { CapacityFields } from '../components/CapacityFields'
import {
  draftFromApplication,
  draftFromProfile,
  parseCapacityPayload,
  usdSuggestionNote,
  type CapacityDraft,
} from '../lib/capacity'
import { seatLabel, type FoundingCapacity, type FoundingSeat } from '../lib/member'
import {
  clientAdminGate,
  isStaffRole,
  showRoleSwitch,
} from '../../supabase/functions/_shared/staff_auth.ts'
import {
  admitMember,
  decideApplication,
  fetchFoundingCapacity,
  inviteMaster,
  setMemberStatus,
  staffSetMemberCapacity,
  supabase,
  type Application,
  type ApplicationStatus,
  type DryRunInvite,
  type EmailEventAdminRow,
  type MemberAdminRow,
  type MemberInviteAdminRow,
  type StaffDirectoryRow,
} from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'

const SECTIONS = [
  { href: '#invite', label: 'Invite' },
  { href: '#applications', label: 'Applications' },
  { href: '#members', label: 'Members' },
  { href: '#people', label: 'People' },
  { href: '#email', label: 'Email' },
]

const PEOPLE_TIERS = ['Master', 'Admin', 'Sponsor', 'Founding Member', 'Member'] as const
type PersonTier = (typeof PEOPLE_TIERS)[number]

export function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [staffRole, setStaffRole] = useState<string | null>(null)
  const [ownMemberStatus, setOwnMemberStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [apps, setApps] = useState<Application[]>([])
  const [members, setMembers] = useState<MemberAdminRow[]>([])
  const [peerInvites, setPeerInvites] = useState<MemberInviteAdminRow[]>([])
  const [events, setEvents] = useState<EmailEventAdminRow[]>([])
  const [staffRows, setStaffRows] = useState<StaffDirectoryRow[]>([])
  const [listError, setListError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [seatById, setSeatById] = useState<Record<string, FoundingSeat | ''>>({})
  const [capacity, setCapacity] = useState<FoundingCapacity | null>(null)
  const [dryRunInvite, setDryRunInvite] = useState<DryRunInvite | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSeat, setInviteSeat] = useState<FoundingSeat>('ksa')
  const [inviteAdmit, setInviteAdmit] = useState(true)
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, CapacityDraft>>({})
  const [profileByUser, setProfileByUser] = useState<
    Record<
      string,
      {
        investable_capacity_usd: number | string | null
        fo_aum_usd: number | string | null
        turnover_usd: number | string | null
        include_in_public_aggregates: boolean
        capacity_verified: boolean
      }
    >
  >({})

  useNoIndex('Admin | Board Arabia')

  const refreshStaffAndApps = useCallback(async (active: Session | null, opts?: { silent?: boolean }) => {
    if (!active) {
      setStaffRole(null)
      setOwnMemberStatus(null)
      setApps([])
      setMembers([])
      setPeerInvites([])
      setEvents([])
      setStaffRows([])
      setProfileByUser({})
      setLoading(false)
      return
    }

    if (!opts?.silent) setLoading(true)
    const [staffRes, ownMemberRes] = await Promise.all([
      supabase.from('staff_users').select('role').eq('user_id', active.user.id).maybeSingle(),
      supabase.from('members').select('status').eq('user_id', active.user.id).maybeSingle(),
    ])

    const claimedRole = staffRes.data?.role
    if (staffRes.error || !isStaffRole(claimedRole)) {
      setStaffRole(null)
      setOwnMemberStatus(null)
      setApps([])
      setMembers([])
      setPeerInvites([])
      setEvents([])
      setStaffRows([])
      setProfileByUser({})
      setListError('')
      setLoading(false)
      return
    }

    setStaffRole(claimedRole)
    setOwnMemberStatus(ownMemberRes.data?.status ?? null)

    const [capacityResult, appsRes, membersRes, invitesRes, eventsRes, directoryRes, profilesRes] = await Promise.all([
      fetchFoundingCapacity(),
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
      supabase
        .from('members')
        .select('user_id, email, seat, status, invites_remaining, invites_granted')
        .order('invited_at', { ascending: false }),
      supabase
        .from('member_invites')
        .select('id, application_id, channel, status, inviter_member_id')
        .order('created_at', { ascending: false }),
      supabase
        .from('email_events')
        .select('id, created_at, kind, recipient, subject, status')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.rpc('list_staff_directory'),
      supabase
        .from('profiles')
        .select(
          'user_id, investable_capacity_usd, fo_aum_usd, turnover_usd, include_in_public_aggregates, capacity_verified',
        ),
    ])

    setCapacity('error' in capacityResult ? null : capacityResult)
    setApps((appsRes.data ?? []) as Application[])
    setMembers((membersRes.data ?? []) as MemberAdminRow[])
    setPeerInvites((invitesRes.data ?? []) as MemberInviteAdminRow[])
    setEvents((eventsRes.data ?? []) as EmailEventAdminRow[])
    setStaffRows((directoryRes.data ?? []) as StaffDirectoryRow[])
    const nextProfiles: typeof profileByUser = {}
    for (const row of profilesRes.data ?? []) {
      nextProfiles[row.user_id] = row
    }
    setProfileByUser(nextProfiles)

    const problems = [
      appsRes.error,
      membersRes.error,
      invitesRes.error,
      eventsRes.error,
      directoryRes.error,
      profilesRes.error,
    ].filter(
      (item) => item != null,
    )
    setListError(problems.map((item) => item.message).join(' '))
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void refreshStaffAndApps(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void refreshStaffAndApps(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [refreshStaffAndApps])

  useEffect(() => {
    if (!session || !isStaffRole(staffRole)) return
    const id = window.setInterval(() => {
      void refreshStaffAndApps(session, { silent: true })
    }, 30000)
    return () => window.clearInterval(id)
  }, [session, staffRole, refreshStaffAndApps])

  async function onSignOut() {
    await supabase.auth.signOut()
  }

  async function onAccept(id: string) {
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await decideApplication(id, 'accepted')
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }

    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'accepted',
              decision_at: new Date().toISOString(),
              invite_event_id: 'private_booking_link',
              invite_sent_at: new Date().toISOString(),
              calendar_slot: 'private_invite_emailed',
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Accepted. Private booking link emailed.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onAdmit(id: string) {
    const seat = seatById[id]
    if (seat !== 'ksa' && seat !== 'intl') {
      setListError('Choose a Saudi or international seat.')
      return
    }
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const parsed = parseCapacityPayload(draftFor(id, draftFromApplication(appById(id))))
    if ('error' in parsed) {
      setListError(parsed.error)
      setUpdatingId(null)
      return
    }
    const result = await admitMember(id, seat, parsed)
    if (result.error) {
      setListError(result.error)
      setDryRunInvite(result.dryRunInvite ?? null)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'admitted',
              founding_seat: seat,
              admitted_at: new Date().toISOString(),
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Admitted.')
    setDryRunInvite(result.dryRunInvite ?? null)
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onReject(id: string) {
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await decideApplication(id, 'rejected')
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'rejected',
              decision_at: new Date().toISOString(),
              invite_event_id: null,
              invite_sent_at: null,
              calendar_slot: null,
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Rejected. Decline email sent.')
    setUpdatingId(null)
  }

  async function runInvite(kind: string, input?: { email?: string; seat?: FoundingSeat; admitMember?: boolean }) {
    setUpdatingId(kind)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await inviteMaster(input)
    if (result.error) {
      setListError(result.error)
      setDryRunInvite(result.dryRunInvite ?? null)
      setUpdatingId(null)
      return
    }
    setActionNote(result.message || 'Master staff is ready.')
    setDryRunInvite(result.dryRunInvite ?? null)
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  function onDirectInvite(event: FormEvent) {
    event.preventDefault()
    if (!inviteEmail.trim()) {
      setListError('Enter an email.')
      return
    }
    void runInvite('invite-direct', {
      email: inviteEmail.trim(),
      seat: inviteSeat,
      admitMember: inviteAdmit,
    })
  }

  async function onMemberStatus(row: MemberAdminRow, action: 'suspend' | 'restore') {
    if (action === 'suspend') {
      const ok = window.confirm('Suspend this member? They lose dashboard access until restored.')
      if (!ok) return
    }
    setUpdatingId(row.user_id)
    setActionNote('')
    setListError('')
    const result = await setMemberStatus(row.user_id, action)
    if (result.error || !result.status) {
      setListError(result.error || 'Update failed')
      setUpdatingId(null)
      return
    }
    setMembers((prev) =>
      prev.map((item) =>
        item.user_id === row.user_id
          ? { ...item, status: result.status as MemberAdminRow['status'] }
          : item,
      ),
    )
    setActionNote(result.message || 'Member updated.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  function appById(id: string) {
    return (
      apps.find((row) => row.id === id) ?? {
        investable_capacity_usd: null,
        include_in_public_aggregates: true,
        fo_aum: null,
        turnover: '',
      }
    )
  }

  function draftFor(key: string, fallback: CapacityDraft) {
    return capacityDrafts[key] ?? fallback
  }

  function setDraft(key: string, next: CapacityDraft) {
    setCapacityDrafts((prev) => ({ ...prev, [key]: next }))
  }

  async function onSaveCapacity(userId: string) {
    const parsed = parseCapacityPayload(
      draftFor(userId, draftFromProfile(profileByUser[userId] ?? null)),
    )
    if ('error' in parsed) {
      setListError(parsed.error)
      return
    }
    setUpdatingId(userId)
    setActionNote('')
    setListError('')
    const result = await staffSetMemberCapacity(userId, parsed)
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setActionNote('Capacity saved. Public totals recompute from admitted, verified, opted-in members.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  if (session === undefined || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-pearl text-ink">
        <p className="text-ink/50">Loading…</p>
      </div>
    )
  }

  if (!session || clientAdminGate(true, staffRole) === 'login') {
    return <Navigate to="/login?next=/admin" replace />
  }

  if (clientAdminGate(true, staffRole) !== 'allow') {
    return <Navigate to="/dashboard" replace />
  }

  const memberSwitch = showRoleSwitch(staffRole, ownMemberStatus).toMember

  return (
    <div className="min-h-dvh bg-ink text-pearl">
      <header className="border-b border-pearl/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8">
          <div>
            <Link to="/" className="font-display text-[1.05rem] font-bold tracking-[-0.02em]">
              Board Arabia
            </Link>
            <p className="mt-1 text-[0.7rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
              Ops / Admin
            </p>
          </div>
          <div className="flex items-center gap-4">
            {memberSwitch && (
              <Link
                to="/dashboard"
                className="text-[0.75rem] font-semibold tracking-[0.06em] text-brass-bright uppercase transition-colors hover:text-pearl"
              >
                Member
              </Link>
            )}
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="text-[0.75rem] font-semibold tracking-[0.06em] text-pearl/60 uppercase transition-colors hover:text-pearl"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Admin</h1>
                <p className="mt-2 text-[0.9rem] text-stone/60">{session.user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStaffAndApps(session, { silent: true })}
                className="text-[0.75rem] font-semibold tracking-[0.06em] text-brass-bright uppercase hover:text-brass"
              >
                Refresh
              </button>
            </div>

            <section className="mt-6 border border-pearl/10 px-5 py-4">
              <h2 className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
                Founding capacity
              </h2>
              {capacity ? (
                <p className="mt-2 text-[0.95rem] text-stone/75">
                  Saudi Arabia {capacity.ksa}/{capacity.ksa_cap} · International {capacity.intl}/
                  {capacity.intl_cap}
                </p>
              ) : (
                <p className="mt-2 text-[0.95rem] text-stone/55">Unavailable right now.</p>
              )}
            </section>

            {listError && <p className="mt-4 text-[0.9rem] text-red-300">{listError}</p>}
            {actionNote && <p className="mt-4 text-[0.9rem] text-brass-bright">{actionNote}</p>}
            {dryRunInvite && <DryRunInviteBox invite={dryRunInvite} />}

            <nav className="mt-8 flex flex-wrap gap-2">
              {SECTIONS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="border border-pearl/15 px-3 py-2 text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/70 uppercase hover:border-pearl/40 hover:text-pearl"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <section id="invite" className="mt-10 scroll-mt-24 border border-brass/30 px-5 py-5">
              <h2 className="font-display text-[1.4rem] font-semibold tracking-[-0.02em]">
                Direct invite
              </h2>
              <p className="mt-2 max-w-2xl text-[0.9rem] text-stone/65">
                Promotes master staff. Optionally admits a founding member. If outbound mail is not
                connected, the one-time link appears here and is not stored in email events.
              </p>
              <button
                type="button"
                disabled={updatingId === 'invite-michael'}
                onClick={() => void runInvite('invite-michael', { seat: 'ksa', admitMember: true })}
                className="mt-5 bg-brass px-4 py-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40"
              >
                Invite / promote Michael
              </button>
              <form onSubmit={onDirectInvite} className="mt-6 flex flex-wrap items-end gap-3">
                <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                  Email
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="off"
                    className="mt-2 block w-64 border border-pearl/20 bg-ink px-3 py-2 text-[0.9rem] text-pearl normal-case"
                  />
                </label>
                <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
                  Seat
                  <select
                    value={inviteSeat}
                    onChange={(event) => setInviteSeat(event.target.value as FoundingSeat)}
                    className="mt-2 block border border-pearl/20 bg-ink px-3 py-2 text-[0.9rem] text-pearl normal-case"
                  >
                    <option value="ksa">Saudi Arabia</option>
                    <option value="intl">International</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-[0.85rem] text-stone/75 normal-case">
                  <input
                    type="checkbox"
                    checked={inviteAdmit}
                    onChange={(event) => setInviteAdmit(event.target.checked)}
                  />
                  Also admit as founding member
                </label>
                <button
                  type="submit"
                  disabled={updatingId === 'invite-direct'}
                  className="border border-brass/60 px-4 py-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-brass-bright uppercase disabled:opacity-40"
                >
                  Send direct invite
                </button>
              </form>
            </section>

            <section id="applications" className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">
                Applications
              </h2>
              <p className="mt-2 text-[0.9rem] text-stone/60">
                {apps.length} row{apps.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-6 space-y-4">
                {apps.length === 0 && (
                  <li className="border border-pearl/10 px-5 py-8 text-stone/55">No applications yet.</li>
                )}
                {apps.map((app) => (
                  <li key={app.id} className="border border-pearl/10 bg-pearl/[0.03] px-5 py-5 md:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-pearl/40 uppercase">
                          {new Date(app.created_at).toLocaleString()}
                        </p>
                        <p className="mt-2 font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                          {app.full_name || app.job_titles}
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
                            {members.find((member) => member.user_id === app.invited_by_member_id)
                              ?.email || 'a member'}
                            {app.invite_reason ? `. Why: ${app.invite_reason}` : ''}
                            {peerMeta(peerInvites, app)
                              ? `. ${peerMeta(peerInvites, app)}`
                              : ''}
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
                        draft={draftFor(app.id, draftFromApplication(app))}
                        onChange={(next) => setDraft(app.id, next)}
                        note={usdSuggestionNote(app.turnover, app.fo_aum)}
                      />
                    )}
                    {app.investable_capacity_usd != null && (
                      <p className="mt-3 text-[0.85rem] text-pearl/50">
                        Declared investable capacity on the application. Public totals use the
                        verified member figure, not this line alone.
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          updatingId === app.id ||
                          app.status === 'accepted' ||
                          app.status === 'verified' ||
                          app.status === 'admitted'
                        }
                        onClick={() => void onAccept(app.id)}
                        className={`px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                          app.status === 'accepted' || app.status === 'verified'
                            ? 'bg-brass text-ink'
                            : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                        }`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={
                          updatingId === app.id ||
                          app.status === 'rejected' ||
                          app.status === 'declined' ||
                          app.status === 'admitted'
                        }
                        onClick={() => void onReject(app.id)}
                        className={`px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 ${
                          app.status === 'rejected' || app.status === 'declined'
                            ? 'bg-brass text-ink'
                            : 'border border-pearl/20 text-pearl/70 hover:border-pearl/40 hover:text-pearl'
                        }`}
                      >
                        Reject
                      </button>
                      {(app.status === 'accepted' || app.status === 'verified') && (
                        <>
                          <label className="ml-1 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/45 uppercase">
                            <span className="sr-only">Founding seat</span>
                            <select
                              value={seatById[app.id] ?? ''}
                              onChange={(event) =>
                                setSeatById((prev) => ({
                                  ...prev,
                                  [app.id]: event.target.value as FoundingSeat | '',
                                }))
                              }
                              className="border border-pearl/20 bg-ink px-2 py-2 text-pearl"
                            >
                              <option value="">Seat</option>
                              <option value="ksa">Saudi Arabia</option>
                              <option value="intl">International</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            disabled={updatingId === app.id}
                            onClick={() => void onAdmit(app.id)}
                            className="border border-brass/60 px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] text-brass-bright uppercase disabled:opacity-40"
                          >
                            Admit
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section id="members" className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">Members</h2>
              <ul className="mt-6 space-y-3">
                {members.length === 0 && (
                  <li className="border border-pearl/10 px-5 py-8 text-stone/55">No members yet.</li>
                )}
                {members.map((member) => (
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
                        disabled={updatingId === member.user_id}
                        onClick={() => void onMemberStatus(member, 'restore')}
                        className="border border-pearl/20 px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase disabled:opacity-40"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={updatingId === member.user_id}
                        onClick={() => void onMemberStatus(member, 'suspend')}
                        className="border border-pearl/20 px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase disabled:opacity-40"
                      >
                        Suspend
                      </button>
                    )}
                    </div>
                    <CapacityFields
                      idPrefix={member.user_id}
                      draft={draftFor(member.user_id, draftFromProfile(profileByUser[member.user_id] ?? null))}
                      onChange={(next) => setDraft(member.user_id, next)}
                      note="USD only. Suspend removes this member from the public sums immediately. Opting out does the same."
                    />
                    <button
                      type="button"
                      disabled={updatingId === member.user_id}
                      onClick={() => void onSaveCapacity(member.user_id)}
                      className="mt-3 border border-brass/60 px-3 py-2 text-[0.68rem] font-semibold tracking-[0.06em] text-brass-bright uppercase disabled:opacity-40"
                    >
                      Save capacity
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section id="email" className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">
                Email events
              </h2>
              <p className="mt-2 text-[0.9rem] text-stone/60">
                Kind, recipient, subject, and status only.
              </p>
              <ul className="mt-6 space-y-3">
                {events.length === 0 && (
                  <li className="border border-pearl/10 px-5 py-8 text-stone/55">No email events yet.</li>
                )}
                {events.map((event) => (
                  <li key={event.id} className="border border-pearl/10 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-[0.7rem] font-semibold tracking-[0.1em] text-pearl/40 uppercase">
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                      <span className="border border-pearl/20 px-2 py-1 text-[0.68rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                        {event.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[0.95rem] text-stone/85">{event.subject}</p>
                    <p className="mt-1 text-[0.85rem] text-pearl/50">
                      {event.kind} · {event.recipient}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section id="people" className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">People</h2>
              <p className="mt-2 max-w-2xl text-[0.9rem] text-stone/60">
                Master, Admin, Sponsor, Founding Member, and Member. This screen does not remove
                people. The last master stays in place.
              </p>
              <div className="mt-6 space-y-8">
                {PEOPLE_TIERS.map((tier) => {
                  const rows = peopleInTier(tier, staffRows, members)
                  return (
                    <div key={tier}>
                      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
                        {tier}
                      </h3>
                      <ul className="mt-3 space-y-3">
                        {rows.length === 0 && (
                          <li className="border border-pearl/10 px-5 py-6 text-stone/55">None yet.</li>
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
            </section>
          </div>
      </main>
    </div>
  )
}

function peopleInTier(
  tier: PersonTier,
  staffRows: StaffDirectoryRow[],
  members: MemberAdminRow[],
): { email: string; detail: string }[] {
  if (tier === 'Master') {
    return staffRows
      .filter((row) => row.role === 'master')
      .map((row) => ({ email: row.email, detail: new Date(row.created_at).toLocaleString() }))
  }
  if (tier === 'Admin') {
    return staffRows
      .filter((row) => row.role === 'staff')
      .map((row) => ({ email: row.email, detail: new Date(row.created_at).toLocaleString() }))
  }
  if (tier === 'Founding Member') {
    return members.map((member) => ({
      email: member.email,
      detail: `${seatLabel(member.seat)} · ${member.status}`,
    }))
  }
  return []
}

function DryRunInviteBox({ invite }: { invite: DryRunInvite }) {
  return (
    <div className="mt-4 max-w-2xl border border-brass/40 px-4 py-4 text-[0.9rem] text-stone/80">
      <p className="font-semibold text-brass-bright">Dry-run invite. Not emailed. Do not forward.</p>
      {invite.confirmUrl && (
        <p className="mt-3 break-all">
          <a
            href={invite.confirmUrl}
            className="text-brass-bright underline-offset-2 hover:underline"
          >
            {invite.confirmUrl}
          </a>
        </p>
      )}
      {invite.otp && <p className="mt-2">One-time code: {invite.otp}</p>}
      {invite.tempPassword && <p className="mt-2">Temporary password: {invite.tempPassword}</p>}
      {invite.loginUrl && <p className="mt-2 break-all">{invite.loginUrl}</p>}
    </div>
  )
}

function peerMeta(rows: MemberInviteAdminRow[], app: Application) {
  const row = rows.find(
    (item) => item.application_id === app.id || item.id === app.invite_token_id,
  )
  if (!row) return ''
  const channel = row.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
  return `${channel} · ${row.status}`
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const tone =
    status === 'accepted' || status === 'verified' || status === 'admitted'
      ? 'text-emerald-300 border-emerald-300/30'
      : status === 'rejected' || status === 'declined'
        ? 'text-red-300 border-red-300/30'
        : 'text-brass-bright border-brass/40'

  return (
    <span
      className={`border px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.08em] uppercase ${tone}`}
    >
      {status}
    </span>
  )
}
