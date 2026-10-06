import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { MfaHold } from '../../components/mfa/MfaHold'
import { readAssurance } from '../../lib/mfa'
import { routeHold, type MfaHold as Hold } from '../../lib/mfaFlow'
import { noteStaffSession } from '../../lib/tracking/browser'
import { applyStaffBrowserOptOut } from '../../lib/tracking/staffOptOut'
import { clientAdminGate } from '../../../supabase/functions/_shared/staff_auth.ts'
import { AppShell } from '../../shell/AppShell'
import { STAFF_SECONDARY, formatUpdated, staffDestinations } from '../../shell/destinations'
import { currentReturnPath, loginHref } from '../../lib/returnPath'
import { useNoIndex } from '../../lib/usePageTitle'
import { AdminProvider, useAdmin } from './context'
import { DryRunInviteBox } from './bits'

export function AdminLayout() {
  return (
    <AdminProvider>
      <AdminFrame />
    </AdminProvider>
  )
}

function AdminFrame() {
  const room = useAdmin()
  const location = useLocation()
  useNoIndex('Admin | Board Arabia')

  if (room.booting || (room.session && !room.hasLoaded)) {
    return (
      <div className="shell-safe-top shell-safe-x flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-pearl/60">Loading…</p>
      </div>
    )
  }

  if (!room.session || clientAdminGate(true, room.staffRole) === 'login') {
    return <Navigate to={loginHref(currentReturnPath(location), true)} replace />
  }

  if (clientAdminGate(true, room.staffRole) !== 'allow') {
    return <Navigate to="/dashboard" replace />
  }

  return <StaffMfaGate room={room} />
}

function StaffMfaGate({ room }: { room: ReturnType<typeof useAdmin> }) {
  const [hold, setHold] = useState<Hold | 'loading'>('loading')
  const [passCount, setPassCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void readAssurance().then((assurance) => {
      if (cancelled) return
      setHold(
        routeHold({
          area: 'staff',
          currentLevel: assurance.currentLevel,
          verifiedFactor: assurance.verifiedFactor,
        }),
      )
    })
    return () => {
      cancelled = true
    }
  }, [passCount, room.session])

  if (hold === 'loading') {
    return (
      <div className="shell-safe-top shell-safe-x flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-pearl/60">Loading…</p>
      </div>
    )
  }

  if (hold !== 'clear') {
    return <MfaHold mode={hold} tone="dark" signOutTo="/login/staff" onPassed={() => setPassCount((value) => value + 1)} />
  }

  return <StaffFrame room={room} />
}

function StaffFrame({ room }: { room: ReturnType<typeof useAdmin> }) {
  const location = useLocation()
  const wide = location.pathname === '/admin/marketing' || location.pathname.startsWith('/admin/marketing/')
  useEffect(() => {
    noteStaffSession(true)
    const secure = window.location.protocol === 'https:'
    for (const line of applyStaffBrowserOptOut(document.cookie, secure)) {
      document.cookie = line
    }
  }, [])

  return (
    <AppShell
      tone="staff"
      destinations={staffDestinations()}
      secondary={STAFF_SECONDARY}
      updatedLabel={formatUpdated(room.refreshedAt)}
      roleSwitch={
        room.isMember ? { label: 'Switch to member', to: '/dashboard' } : null
      }
      onSignOut={() => void room.signOut()}
      accountLabel={room.email}
    >
      <div className={wide ? 'mx-auto max-w-6xl' : 'mx-auto max-w-5xl'}>
        {room.listError && (
          <p className="mb-4 text-[0.95rem] text-red-300" role="alert">
            {room.listError}
          </p>
        )}
        {room.actionNote && <p className="mb-4 text-[0.95rem] text-brass-bright">{room.actionNote}</p>}
        {room.dryRunInvite && (
          <div className="mb-4">
            <DryRunInviteBox invite={room.dryRunInvite} />
          </div>
        )}
        <Outlet />
      </div>
    </AppShell>
  )
}
