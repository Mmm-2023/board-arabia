import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AppShell } from './AppShell'
import {
  MEMBER_DESTINATIONS,
  MEMBER_SECONDARY,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
} from './destinations'

function renderShell(
  tone: 'member' | 'staff',
  roleSwitch: { label: string; to: string } | null,
  initialMoreOpen = false,
) {
  const destinations = tone === 'member' ? MEMBER_DESTINATIONS : STAFF_DESTINATIONS
  const secondary = tone === 'member' ? MEMBER_SECONDARY : STAFF_SECONDARY
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[destinations[0]?.to ?? '/']}>
      <AppShell
        tone={tone}
        destinations={destinations}
        secondary={secondary}
        updatedLabel="Updated 09:00"
        roleSwitch={roleSwitch}
        onSignOut={() => {}}
        accountLabel={tone === 'member' ? 'member@example.com' : 'staff@example.com'}
        initialMoreOpen={initialMoreOpen}
      >
        <p>Shell body</p>
      </AppShell>
    </MemoryRouter>,
  )
}

export function renderMemberShell(initialMoreOpen = false) {
  return renderShell('member', { label: 'Switch to admin', to: '/admin' }, initialMoreOpen)
}

export function renderStaffShell() {
  return renderShell('staff', { label: 'Switch to member', to: '/dashboard' })
}
