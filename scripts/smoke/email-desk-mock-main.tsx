import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_SECONDARY, staffDestinations } from '../../src/shell/destinations'
import '../../src/index.css'
import { EMAIL_DESK_SHOTS, EmailDeskMock, type EmailDeskShot } from './emailDeskMock'

const asked = new URLSearchParams(window.location.search).get('shot')
const shot: EmailDeskShot = EMAIL_DESK_SHOTS.find((item) => item === asked) ?? 'weekly'

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/admin/email']}>
    <AppShell
      tone="staff"
      destinations={staffDestinations(false)}
      secondary={STAFF_SECONDARY}
      updatedLabel="Updated 14:02 AST"
      roleSwitch={null}
      onSignOut={() => undefined}
      accountLabel="Admin"
      accountName="Admin"
    >
      <EmailDeskMock shot={shot} />
    </AppShell>
  </MemoryRouter>,
)
