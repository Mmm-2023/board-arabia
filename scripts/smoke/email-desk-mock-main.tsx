import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_SECONDARY, staffDestinations } from '../../src/shell/destinations'
import '../../src/index.css'
import { EMAIL_DESK_SHOTS, EmailDeskMock, type EmailDeskShot } from './emailDeskMock'

const asked = new URLSearchParams(window.location.search).get('shot')

function PrivacyToggleShot() {
  return (
    <MemoryRouter initialEntries={['/dashboard/privacy']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 14:02 AST"
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="Account"
        accountName="Example Member"
      >
        <PrivacyPanelView
          hidden={false}
          showSponsors={false}
          twoStepOn={false}
          analyticsOn={false}
          privacyContact={null}
          downloadState="idle"
          digestOptIn={false}
          newsOptIn={false}
          measureOptIn={false}
          deliveryConnected={false}
          onHidden={() => undefined}
          onShowSponsors={() => undefined}
          onDownload={() => undefined}
          onDigestOptIn={() => undefined}
          onNewsOptIn={() => undefined}
          onMeasureOptIn={() => undefined}
        />
      </AppShell>
    </MemoryRouter>
  )
}

const shot: EmailDeskShot = EMAIL_DESK_SHOTS.find((item) => item === asked) ?? 'weekly'

createRoot(document.getElementById('root')!).render(
  asked === 'your-privacy-toggle' ? (
    <PrivacyToggleShot />
  ) : (
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
    </MemoryRouter>
  ),
)
