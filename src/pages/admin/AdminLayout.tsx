import { Navigate, Outlet } from 'react-router-dom'
import { clientAdminGate } from '../../../supabase/functions/_shared/staff_auth.ts'
import { AppShell } from '../../shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY, formatUpdated } from '../../shell/destinations'
import { ErrorBanner } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
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
  useNoIndex('Admin | Board Arabia')

  if (room.booting || (room.session && !room.hasLoaded)) {
    return (
      <div className="shell-safe-top shell-safe-x flex min-h-dvh items-center justify-center bg-ink text-pearl">
        <p className="text-pearl/60">Loading…</p>
      </div>
    )
  }

  if (!room.session || clientAdminGate(true, room.staffRole) === 'login') {
    return <Navigate to="/login?next=/admin" replace />
  }

  if (clientAdminGate(true, room.staffRole) !== 'allow') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <AppShell
      tone="staff"
      destinations={STAFF_DESTINATIONS}
      secondary={STAFF_SECONDARY}
      updatedLabel={formatUpdated(room.refreshedAt)}
      roleSwitch={
        room.isMember ? { label: 'Switch to member', to: '/dashboard' } : null
      }
      onSignOut={() => void room.signOut()}
      accountLabel={room.email}
    >
      <div className="mx-auto max-w-5xl">
        {room.refreshError && (
          <div className="mb-4">
            <ErrorBanner
              tone="staff"
              message={room.queryDetail ? `${room.refreshError} ${room.queryDetail}` : room.refreshError}
              onRetry={room.refresh}
              retryLabel={STAFF_VIEWS.home.retry}
            />
          </div>
        )}
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
