import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import '../../src/index.css'

const showSponsors = new URLSearchParams(window.location.search).get('card') === 'on'
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <MemoryRouter>
      <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
        <PrivacyPanelView
          hidden={false}
          showSponsors={showSponsors}
          twoStepOn={false}
          analyticsOn={false}
          privacyContact="privacy@example.com"
          downloadState="idle"
          onHidden={() => undefined}
          onShowSponsors={() => undefined}
          onDownload={() => undefined}
        />
      </div>
    </MemoryRouter>,
  )
}
