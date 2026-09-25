import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { isStaffRole, showRoleSwitch } from '../../../supabase/functions/_shared/staff_auth.ts'
import { AppShell } from '../../shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, formatUpdated } from '../../shell/destinations'
import { PermissionState } from '../../shell/ViewState'
import { REFRESH_ERROR } from '../../shell/viewCopy'
import { endAuthSession } from '../../lib/endSession'
import { supabase } from '../../lib/supabase'
import type { MemberRow, ProfileRow } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { DashboardStatusContext, MemberContext, type MemberRoom } from './context'

type Gate =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'forbidden'; email: string }
  | { status: 'suspended'; email: string }
  | { status: 'staff_home' }
  | { status: 'ready'; room: MemberRoom }

const PROFILE_BASE =
  'user_id, full_name, headline, company, location, linkedin_url, bio, phone, investable_capacity_usd, fo_aum_usd, turnover_usd, capacity_currency, include_in_public_aggregates, capacity_verified'

async function loadOwnProfile(userId: string): Promise<{ profile: ProfileRow | null; error: boolean }> {
  const withAvatar = await supabase
    .from('profiles')
    .select(`${PROFILE_BASE}, avatar_path`)
    .eq('user_id', userId)
    .maybeSingle()
  if (!withAvatar.error) return { profile: withAvatar.data, error: false }
  const plain = await supabase.from('profiles').select(PROFILE_BASE).eq('user_id', userId).maybeSingle()
  if (plain.error) return { profile: null, error: true }
  if (!plain.data) return { profile: null, error: false }
  return { profile: { ...plain.data, avatar_path: null }, error: false }
}

export function DashboardLayout() {
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const loadSeq = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  const readyRef = useRef<MemberRoom | null>(null)
  const signingOut = useRef(false)
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
    const { data, error } = await supabase.auth.getUser()
    if (seq !== loadSeq.current) return
    const user = data.user
    if (error || !user) {
      setRefreshing(false)
      if (readyRef.current) {
        setRefreshError(REFRESH_ERROR)
        return
      }
      setGate({ status: 'signed_out' })
      return
    }

    const [staffRes, memberRes] = await Promise.all([
      supabase.from('staff_users').select('role').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('members')
        .select('user_id, email, seat, status, must_set_password, invites_remaining, invites_granted')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    if (seq !== loadSeq.current) return
    if (memberRes.error && readyRef.current) {
      setRefreshing(false)
      setRefreshError(REFRESH_ERROR)
      return
    }

    const claimedRole = staffRes.data?.role
    const staffRole = !staffRes.error && isStaffRole(claimedRole) ? claimedRole : null
    const member = memberRes.data as MemberRow | null
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
      setGate({
        status: 'forbidden',
        email: user.email || '',
      })
      return
    }

    const loaded = await loadOwnProfile(user.id)

    if (seq !== loadSeq.current) return
    if (loaded.error && readyRef.current) {
      setRefreshing(false)
      setRefreshError(REFRESH_ERROR)
      return
    }

    const room: MemberRoom = {
      userId: user.id,
      email: user.email || member.email,
      staffRole,
      member,
      profile: loaded.profile,
      reload: async () => {
        await loadRef.current()
      },
    }
    readyRef.current = room
    setRefreshError('')
    setUpdatedAt(new Date())
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
      <div className="shell-safe-top shell-safe-x flex min-h-dvh items-center justify-center bg-pearl text-ink">
        <p className="text-ink/50">Loading…</p>
      </div>
    )
  }

  if (gate.status === 'signed_out') {
    return <Navigate to="/login?next=/dashboard" replace />
  }

  if (gate.status === 'staff_home') {
    return <Navigate to="/admin" replace />
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
          secondary={MEMBER_SECONDARY}
          updatedLabel={formatUpdated(updatedAt)}
          roleSwitch={
            showRoleSwitch(gate.room.staffRole, gate.room.member.status).toAdmin
              ? { label: 'Switch to admin', to: '/admin' }
              : null
          }
          onSignOut={() => void onSignOut()}
          accountLabel={gate.room.email}
        >
          <Outlet />
        </AppShell>
      </MemberContext.Provider>
    </DashboardStatusContext.Provider>
  )
}
