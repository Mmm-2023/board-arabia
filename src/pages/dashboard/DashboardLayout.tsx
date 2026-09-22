import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { MemberRow, ProfileRow } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { MemberContext, type MemberRoom } from './context'

const NAV = [
  { to: '/dashboard', label: 'Home', end: true },
  { to: '/dashboard/invites', label: 'Invites', end: false },
  { to: '/dashboard/directory', label: 'Directory', end: false },
  { to: '/dashboard/mandates', label: 'Mandates', end: false },
  { to: '/dashboard/intros', label: 'Intros', end: false },
  { to: '/dashboard/rooms', label: 'Rooms', end: false },
  { to: '/dashboard/events', label: 'Events', end: false },
  { to: '/dashboard/profile', label: 'Profile', end: false },
]

type Gate =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'forbidden'; email: string; isStaff: boolean }
  | { status: 'suspended'; email: string }
  | { status: 'ready'; room: MemberRoom }

export function DashboardLayout() {
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const loadSeq = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  useNoIndex('Member dashboard | Board Arabia')

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const { data, error } = await supabase.auth.getUser()
    if (seq !== loadSeq.current) return
    const user = data.user
    if (error || !user) {
      setGate({ status: 'signed_out' })
      return
    }

    const [staffRes, memberRes] = await Promise.all([
      supabase.from('staff_users').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('members')
        .select('user_id, email, seat, status, must_set_password, invites_remaining, invites_granted')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    if (seq !== loadSeq.current) return
    const member = memberRes.data as MemberRow | null
    if (!member || member.status === 'suspended') {
      if (member?.status === 'suspended') {
        setGate({ status: 'suspended', email: user.email || member.email })
        return
      }
      setGate({
        status: 'forbidden',
        email: user.email || '',
        isStaff: Boolean(staffRes.data),
      })
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'user_id, full_name, headline, company, location, linkedin_url, bio, phone, investable_capacity_usd, fo_aum_usd, turnover_usd, capacity_currency, include_in_public_aggregates, capacity_verified',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (seq !== loadSeq.current) return
    const room: MemberRoom = {
      userId: user.id,
      email: user.email || member.email,
      isStaff: Boolean(staffRes.data),
      member,
      profile: (profile as ProfileRow | null) ?? null,
      reload: async () => {
        await loadRef.current()
      },
    }
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
    await supabase.auth.signOut()
  }

  if (gate.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-pearl text-ink">
        <p className="text-ink/50">Loading…</p>
      </div>
    )
  }

  if (gate.status === 'signed_out') {
    return <Navigate to="/login?next=/dashboard" replace />
  }

  if (gate.status === 'suspended' || gate.status === 'forbidden') {
    return (
      <div className="min-h-dvh bg-pearl text-ink">
        <div className="mx-auto max-w-lg px-5 py-20">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
            Board Arabia
          </p>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">
            {gate.status === 'suspended' ? 'Membership is paused' : 'Invitation required'}
          </h1>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink/65">
            {gate.status === 'suspended'
              ? 'This seat cannot open the dashboard. Write to the membership if you believe this is a mistake.'
              : 'The member dashboard opens only after admin admits you and you sign in with that invitation.'}
          </p>
          {gate.status === 'forbidden' && gate.email && (
            <p className="mt-4 text-[0.92rem] text-ink/45">Signed in as {gate.email}.</p>
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            {gate.status === 'forbidden' && gate.isStaff && (
              <Link
                to="/admin"
                className="bg-ink px-4 py-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase"
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="text-[0.75rem] font-semibold tracking-[0.08em] text-ink/50 uppercase"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MemberContext.Provider value={gate.room}>
      <div className="min-h-dvh bg-pearl text-ink">
        <header className="border-b border-ink/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
            <div>
              <p className="font-display text-[1.05rem] font-bold tracking-[-0.02em]">
                Board Arabia
              </p>
              <p className="mt-1 text-[0.68rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
                Member
              </p>
            </div>
            <div className="flex items-center gap-4">
              {gate.room.isStaff && (
                <Link
                  to="/admin"
                  className="text-[0.72rem] font-semibold tracking-[0.08em] text-brass uppercase hover:text-ink"
                >
                  Admin
                </Link>
              )}
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl md:grid-cols-[13.5rem_1fr]">
          <nav className="flex gap-1 overflow-x-auto border-b border-ink/10 px-3 py-2 md:flex-col md:gap-0 md:overflow-visible md:border-r md:border-b-0 md:px-0 md:py-8">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `shrink-0 px-3 py-2.5 text-[0.92rem] md:px-6 ${
                    isActive ? 'bg-ink text-pearl' : 'text-ink/65 hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <main className="px-5 py-10 md:px-10 md:py-12">
            <Outlet />
          </main>
        </div>
      </div>
    </MemberContext.Provider>
  )
}
