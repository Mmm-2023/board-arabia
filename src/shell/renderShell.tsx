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
  path?: string,
  initialAccountOpen = false,
) {
  const destinations = tone === 'member' ? MEMBER_DESTINATIONS : STAFF_DESTINATIONS
  const secondary = tone === 'member' ? MEMBER_SECONDARY : STAFF_SECONDARY
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path ?? destinations[0]?.to ?? '/']}>
      <AppShell
        tone={tone}
        destinations={destinations}
        secondary={secondary}
        updatedLabel={tone === 'staff' ? 'Updated 09:00' : null}
        roleSwitch={roleSwitch}
        onSignOut={() => {}}
        accountLabel={tone === 'member' ? 'member@example.com' : 'staff@example.com'}
        accountName={tone === 'member' ? 'Member name' : ''}
        renderAccountMark={
          tone === 'member'
            ? (size) => (
                <span data-account-photo="" data-photo-size={size}>
                  MM
                </span>
              )
            : undefined
        }
        initialMoreOpen={initialMoreOpen}
        initialAccountOpen={initialAccountOpen}
        dealsBadge={tone === 'member' && path?.includes('badge') ? 2 : 0}
      >
        <p>Shell body</p>
      </AppShell>
    </MemoryRouter>,
  )
}

export function renderMemberShell(initialAccountOpen = false, path?: string) {
  return renderShell('member', { label: 'Switch to admin', to: '/admin' }, false, path, initialAccountOpen)
}

export function renderStaffShell(initialMoreOpen = false) {
  return renderShell('staff', { label: 'Switch to member', to: '/dashboard' }, initialMoreOpen)
}
