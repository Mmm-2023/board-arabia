import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { accountDealFallback, presentAccountDeals, presentAccountTotals } from '../../../lib/accountPreview'
import { displayPlatformMoney, type DisplayTotals } from '../../../lib/platformFloors'
import { fetchPlatformStats, supabase } from '../../../lib/supabase'
import { MEMBER_SECTIONS } from '../../../shell/destinations'
import { SectionTabs } from '../../../shell/SectionTabs'
import { HelpPage } from '../HelpPage'
import { useAccountRoom } from './context'
import { MembershipScreen } from './MembershipScreen'
import { missingRequired, requiredDoneCount } from '../../../../supabase/functions/_shared/membership_steps.ts'
import {
  AccountAi,
  AccountDealList,
  AccountDirectory,
  AccountHomeView,
  AccountIntros,
  AccountInvites,
  AccountMajlis,
  AccountProfileView,
  AccountRealEstate,
  AccountRooms,
} from './views'

const WELCOME_KEY = 'ba-account-welcome'

function rememberWelcome() {
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // The welcome can show again next visit.
  }
}

function welcomeSeen() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

async function loadTotals(): Promise<{ state: 'ready' | 'error'; totals: DisplayTotals | null }> {
  const real = await fetchPlatformStats()
  if (real) {
    const money = displayPlatformMoney(real)
    return {
      state: 'ready',
      totals: { ...money, admitted: real.admitted, ksa: real.ksa, intl: real.intl },
    }
  }
  const { data, error } = await supabase.rpc('landing_platform_totals')
  if (error) return { state: 'error', totals: null }
  return { state: 'ready', totals: presentAccountTotals(data) }
}

export function AccountHome() {
  const room = useAccountRoom()
  const [attempt, setAttempt] = useState(0)
  const [totals, setTotals] = useState<DisplayTotals | null>(null)
  const [totalsState, setTotalsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [showWelcome, setShowWelcome] = useState(() => !welcomeSeen())

  useEffect(() => {
    let cancelled = false
    void loadTotals().then((result) => {
      if (cancelled) return
      setTotals(result.totals)
      setTotalsState(result.state)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <AccountHomeView
      totals={totals}
      totalsState={totalsState}
      onRetryTotals={() => {
        setTotalsState('loading')
        setAttempt((value) => value + 1)
      }}
      showWelcome={showWelcome}
      onDismissWelcome={() => {
        rememberWelcome()
        setShowWelcome(false)
      }}
      stepsDone={requiredDoneCount(room.checklist)}
      nextStep={missingRequired(room.checklist)[0]?.label || 'optional details'}
    />
  )
}

export function AccountDeals() {
  const { pathname } = useLocation()
  return (
    <div>
      <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
      <div className="mt-6">
        {pathname.startsWith('/dashboard/deals/real-estate') ? <AccountRealEstate /> : null}
        {pathname === '/dashboard/deals/rooms' || pathname.startsWith('/dashboard/deals/rooms/') ? <AccountRooms /> : null}
        {pathname.startsWith('/dashboard/deals/mandates') ? <AccountMandates /> : null}
        {pathname === '/dashboard/deals' ? <Navigate to="/dashboard/deals/mandates" replace /> : null}
      </div>
    </div>
  )
}

function AccountMandates() {
  const [deals, setDeals] = useState<ReturnType<typeof presentAccountDeals> | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('list_landing_preview_deals').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(true)
        setDeals([])
        return
      }
      const rows = presentAccountDeals(data)
      setDeals(rows.length > 0 ? rows : accountDealFallback())
      setError(false)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error) {
    return (
      <div data-screen="account-locked" data-hub="mandates">
        <p className="text-[1rem] text-ink/70">Example mandates could not be loaded.</p>
        <button type="button" className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </button>
      </div>
    )
  }
  if (!deals) return <p className="text-[1rem] text-ink/55">Loading example mandates.</p>
  return <AccountDealList deals={deals} />
}

export function AccountPeople() {
  const { pathname } = useLocation()
  return (
    <div>
      <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
      <div className="mt-6">
        {pathname.startsWith('/dashboard/people/intros') ? <AccountIntros /> : null}
        {pathname.startsWith('/dashboard/people/invites') ? <AccountInvites /> : null}
        {pathname.startsWith('/dashboard/people/directory') ? <AccountDirectory /> : null}
        {pathname === '/dashboard/people' ? <Navigate to="/dashboard/people/directory" replace /> : null}
      </div>
    </div>
  )
}

export function AccountAiRoute() {
  return (
    <div>
      <SectionTabs label="AI tools sections" sections={MEMBER_SECTIONS.ai ?? []} />
      <div className="mt-6">
        <AccountAi />
      </div>
    </div>
  )
}

export function AccountSurface() {
  const { pathname } = useLocation()
  if (pathname === '/dashboard') return <AccountHome />
  if (pathname.startsWith('/dashboard/deals')) return <AccountDeals />
  if (pathname.startsWith('/dashboard/people')) return <AccountPeople />
  if (pathname === '/dashboard/majlis' || pathname.startsWith('/dashboard/majlis/')) return <AccountMajlis />
  if (pathname.startsWith('/dashboard/ai')) return <AccountAiRoute />
  if (pathname === '/dashboard/membership' || pathname.startsWith('/dashboard/membership/')) return <MembershipScreen />
  if (pathname === '/dashboard/profile' || pathname.startsWith('/dashboard/profile/')) return <AccountProfile />
  if (pathname === '/dashboard/help' || pathname.startsWith('/dashboard/help/')) return <HelpPage desk={false} />
  return <Navigate to="/dashboard" replace />
}

function AccountProfile() {
  const room = useAccountRoom()
  const [fullName, setFullName] = useState(room.fullName)
  const [role, setRole] = useState(room.role)
  const [region, setRegion] = useState(room.region)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function onSave() {
    const name = fullName.trim().slice(0, 200)
    const nextRole =
      role === 'chairperson' || role === 'board_member' || role === 'c_suite' || role === 'other' ? role : null
    const nextRegion = region === 'ksa_gcc' || region === 'intl' ? region : null
    if (!name || !nextRole || !nextRegion) {
      setError('Name, role, and region are required.')
      return
    }
    setBusy(true)
    setError('')
    setSaved(false)
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ full_name: name, role: nextRole, region: nextRegion })
      .eq('user_id', room.userId)
    setBusy(false)
    if (updateError) {
      setError('Could not save. Your answers are still here.')
      return
    }
    setSaved(true)
    await room.reload()
  }

  return (
    <AccountProfileView
      email={room.email}
      fullName={fullName}
      role={role}
      region={region}
      busy={busy}
      error={error}
      saved={saved}
      onName={setFullName}
      onRole={setRole}
      onRegion={setRegion}
      onSave={() => {
        void onSave()
      }}
    />
  )
}
