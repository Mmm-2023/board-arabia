import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import './smoke.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing root')

const shared = {
  hidden: false,
  showSponsors: false,
  twoStepOn: false,
  analyticsOn: false,
  privacyContact: null,
  downloadState: 'idle' as const,
  onHidden: () => undefined,
  onShowSponsors: () => undefined,
  onDownload: () => undefined,
}

createRoot(root).render(
  <MemoryRouter>
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink" data-shot="web-privacy">
      <PrivacyPanelView {...shared} />
    </div>
  </MemoryRouter>,
)
