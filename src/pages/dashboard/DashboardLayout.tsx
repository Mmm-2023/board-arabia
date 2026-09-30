import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isStaffRole, showRoleSwitch } from '../../../supabase/functions/_shared/staff_auth.ts'
import { clearPasswordFlag } from '../../lib/clearPasswordFlag'
import { fetchMyDealRooms } from '../../lib/dealRoomApi'
import { stillMustSetPassword } from '../../lib/passwordSet'
import { dealsNavCount } from '../../lib/dealRoomView'
import { AppShell } from '../../shell/AppShell'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_ACCOUNT, MEMBER_DESTINATIONS, memberAccountLinks, staleBanner } from '../../shell/destinations'
import { HomeSkeleton, PermissionState } from '../../shell/ViewState'
import { REFRESH_ERROR } from '../../shell/viewCopy'
import { endAuthSession } from '../../lib/endSession'
import { currentReturnPath, loginHref } from '../../lib/returnPath'
import { supabase } from '../../lib/supabase'
import type { MemberRow, ProfileRow } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { DashboardStatusContext, MemberContext, type MemberRoom } from './context'
import { AccountRoomContext, type AccountRoom } from './account/context'
import { checklistFromRecord, requiredDoneCount } from '../../../supabase/functions/_shared/membership_steps.ts'
import { AccountSurface } from './account/AccountRoutes'
import { Avatar } from '../../components/Avatar'
import { OwnAvatar } from './OwnAvatar'
import { rememberVerifyEmail } from '../../lib/verifyEmail'

type Gate =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'forbidden'; email: string }
  | { status: 'suspended'; email: string }
  | { status: 'staff_home' }
  | { status: 'unverified'; email: string }
  | { status: 'account_error' }
  | { status: 'account'; room: AccountRoom }
  | { status: 'ready'; room: MemberRoom }

const PROFILE_BASE =
  'user_id, full_name, headline, company, location, linkedin_url, bio, phone, investable_capacity_usd, fo_aum_usd, turnover_usd, capacity_currency, include_in_public_aggregates, capacity_verified'

async function loadOwnProfile(userId: string): Promise<{ profile: ProfileRow | null; error: boolean }> {
  const full = await supabase
    .from('profiles')
    .select(`${PROFILE_BASE}, avatar_path, avatar_style`)
    .eq('user_id', userId)
    .maybeSingle()
  if (!full.error) return { profile: full.data, error: false }
  const withAvatar = await supabase
    .from('profiles')
    .select(`${PROFILE_BASE}, avatar_path`)
    .eq('user_id', userId)
    .maybeSingle()
  if (!withAvatar.error && withAvatar.data) return { profile: { ...withAvatar.data, avatar_style: 'male' }, error: false }
  if (!withAvatar.error) return { profile: null, error: false }
  const plain = await supabase.from('profiles').select(PROFILE_BASE).eq('user_id', userId).maybeSingle()
  if (plain.error) return { profile: null, error: true }
  if (!plain.data) return { profile: null, error: false }
  return { profile: { ...plain.data, avatar_path: null, avatar_style: 'male' }, error: false }
}

export function DashboardLayout() {
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const seenAt = useRef<Date | null>(null)
  const [dealsBadge, setDealsBadge] = useState(0)
  const loadSeq = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  const readyRef = useRef<MemberRoom | null>(null)
  const signingOut = useRef(false)
  const location = useLocation()
  useNoIndex('Member dashboard | Board Arabia')

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    if (signingOut.current) {
      readyRef.current = null
      setRefreshing(false)
      setGate({ status: 'signed_out' })
      return
    }
    setRefreshing(true)
    const { data: sessionData } = await supabase.auth.getSession()
    if (seq !== loadSeq.current) return
    if (!sessionData.session) {
      readyRef.current = null
      setRefreshing(false)
      setGate({ status: 'signed_out' })
      return
    }
    const sessionUserId = sessionData.session.user.id
    const [userRes, staffRes, memberRes, candidateRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('staff_users').select('role').eq('user_id', sessionUserId).maybeSingle(),
      supabase
        .from('members')
        .select('user_id, email, seat, status, must_set_password, invites_remaining, invites_granted, founding_number, tier')
        .eq('user_id', sessionUserId)
        .maybeSingle(),
      supabase
        .from('candidates')
        .select(
          'user_id, email, full_name, role, region, request_state, email_verified_at, board_seats, company_name, job_title, company_website, linkedin_url, scale_kind, scale_band, sector_tags, vision_tags, statement, cr_number, cr_country, referral_name, invited_by_member_id, investable_capacity_usd, phone, submitted_at, declined_until, needs_info_question, needs_info_items',
        )
        .eq('user_id', sessionUserId)
        .maybeSingle(),
    ])
    if (seq !== loadSeq.current) return
    const user = userRes.data.user
    if (userRes.error || !user) {
      setRefreshing(false)
      if (readyRef.current) {
        setRefreshError(seenAt.current ? staleBanner(seenAt.current) : REFRESH_ERROR)
        return
      }
      setGate({ status: 'signed_out' })
      return
    }

    if (seq !== loadSeq.current) return
    if (memberRes.error && readyRef.current) {
      setRefreshing(false)
      setRefreshError(seenAt.current ? staleBanner(seenAt.current) : REFRESH_ERROR)
      return
    }

    const claimedRole = staffRes.data?.role
    const staffRole = !staffRes.error && isStaffRole(claimedRole) ? claimedRole : null
    const member = memberRes.data as MemberRow | null
    const candidate = candidateRes.data
    if (staffRole && (!member || member.status === 'suspended')) {
      readyRef.current = null
      setRefreshing(false)
      setGate({ status: 'staff_home' })
      return
    }
    if (!member || member.status === 'suspended') {
      readyRef.current = null
      setRefreshing(false)
      if (member?.status === 'suspended') {
        setGate({ status: 'suspended', email: user.email || member.email })
        return
      }
      if (candidateRes.error) {
        setGate({ status: 'account_error' })
        return
      }
      if (candidate) {
        if (!candidate.email_verified_at) {
          setGate({ status: 'unverified', email: candidate.email })
          return
        }
        const checklist = checklistFromRecord(candidate)
        const room: AccountRoom = {
          userId: user.id,
          email: user.email || candidate.email,
          fullName: candidate.full_name,
          role: candidate.role,
          region: candidate.region,
          requestState: candidate.request_state,
          checklist,
          submittedAt: candidate.submitted_at,
          declinedUntil: candidate.declined_until,
          needsQuestion: candidate.needs_info_question || '',
          needsItems: candidate.needs_info_items || [],
          emailVerifiedAt: candidate.email_verified_at,
          reload: async () => {
            await loadRef.current()
          },
        }
        setRefreshError('')
        const now = new Date()
        seenAt.current = now
        setUpdatedAt(now)
        setGate({ status: 'account', room })
        return
      }
      setGate({
        status: 'forbidden',
        email: user.email || '',
      })
      return
    }

    const loaded = await loadOwnProfile(sessionUserId)
    if (seq !== loadSeq.current) return

    if (loaded.error && readyRef.current) {
      setRefreshing(false)
      setRefreshError(seenAt.current ? staleBanner(seenAt.current) : REFRESH_ERROR)
      return
    }

    const mustSetPassword = stillMustSetPassword(member.must_set_password, sessionData.session.access_token)
    if (member.must_set_password && !mustSetPassword) void clearPasswordFlag(user.id)
    const room: MemberRoom = {
      userId: user.id,
      email: user.email || member.email,
      staffRole,
      member: { ...member, must_set_password: mustSetPassword },
      profile: loaded.profile,
      reload: async () => {
        await loadRef.current()
      },
    }
    readyRef.current = room
    setRefreshError('')
    const now = new Date()
    seenAt.current = now
    setUpdatedAt(now)
    setRefreshing(false)
    setGate({ status: 'ready', room })
  }, [])

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    void load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void load()
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  useEffect(() => {
    if (gate.status !== 'ready') return
    let cancelled = false
    void fetchMyDealRooms().then((result) => {
      if (cancelled) return
      setDealsBadge(result.status === 'ready' ? dealsNavCount(result.rows) : 0)
    })
    return () => {
      cancelled = true
    }
  }, [gate.status])

  async function onSignOut() {
    if (signingOut.current) return
    signingOut.current = true
    loadSeq.current += 1
    readyRef.current = null
    await endAuthSession(supabase)
    setRefreshing(false)
    setGate({ status: 'signed_out' })
  }

  const status = {
    refreshError,
    refreshing,
    updatedAt,
    retry: () => {
      void load()
    },
  }

  if (gate.status === 'loading') {
    return (
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel=""
      >
        <HomeSkeleton tone="member" cards={2} />
      </AppShell>
    )
  }

  if (gate.status === 'signed_out') {
    return <Navigate to={loginHref(currentReturnPath(location))} replace />
  }

  if (gate.status === 'staff_home') {
    return <Navigate to="/admin" replace />
  }

  if (gate.status === 'unverified') {
    rememberVerifyEmail(gate.email)
    return <Navigate to="/register/verify" replace />
  }

  if (gate.status === 'account_error') {
    return (
      <div className="shell-safe-top shell-safe-x shell-safe-bottom min-h-dvh bg-pearl px-5 py-16 text-ink">
        <div className="mx-auto max-w-lg">
          <PermissionState tone="member" message="Could not open your account." />
          <button
            type="button"
            onClick={() => void load()}
            className="ba-primary mt-6 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (gate.status === 'account') {
    return (
      <DashboardStatusContext.Provider value={status}>
        <AccountRoomContext.Provider value={gate.room}>
          <AppShell
            tone="member"
            destinations={MEMBER_DESTINATIONS}
            secondary={ACCOUNT_SHEET_LINKS}
            lockedDestinationIds={LOCKED_HUBS}
            updatedLabel={null}
            roleSwitch={null}
            onSignOut={() => void onSignOut()}
            accountLabel={gate.room.email}
            accountName={gate.room.fullName.trim() || 'Account'}
            renderAccountMark={(size) => <Avatar src={null} size={size} alt="" />}
            headerChip={
              gate.room.requestState === 'open'
                ? `Membership: ${requiredDoneCount(gate.room.checklist)} of 7`
                : null
            }
          >
            <AccountSurface />
          </AppShell>
        </AccountRoomContext.Provider>
      </DashboardStatusContext.Provider>
    )
  }

  if (gate.status === 'suspended' || gate.status === 'forbidden') {
    return (
      <div className="shell-safe-top shell-safe-x shell-safe-bottom min-h-dvh bg-pearl px-5 py-16 text-ink">
        <div className="mx-auto max-w-lg">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
            Board Arabia
          </p>
          <div className="mt-4">
            <PermissionState
              tone="member"
              message={
                gate.status === 'suspended'
                  ? 'This seat cannot open the dashboard. Write to the membership if you believe this is a mistake.'
                  : 'Directory unlocks after admit. The member dashboard opens only after admin admits you and you sign in with that invitation.'
              }
            />
          </div>
          {gate.status === 'forbidden' && gate.email && (
            <p className="mt-4 text-[0.92rem] text-ink/45">Signed in as {gate.email}.</p>
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardStatusContext.Provider value={status}>
      <MemberContext.Provider value={gate.room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={memberAccountLinks(gate.room.member.seat)}
          updatedLabel={null}
          dealsBadge={dealsBadge}
          roleSwitch={
            showRoleSwitch(gate.room.staffRole, gate.room.member.status).toAdmin
              ? { label: 'Switch to admin', to: '/admin' }
              : null
          }
          onSignOut={() => void onSignOut()}
          accountLabel={gate.room.email}
          accountName={gate.room.profile?.full_name?.trim() || 'Member'}
          renderAccountMark={(size) => <OwnAvatar decorative size={size} />}
        >
          <Outlet />
        </AppShell>
      </MemberContext.Provider>
    </DashboardStatusContext.Provider>
  )
}
