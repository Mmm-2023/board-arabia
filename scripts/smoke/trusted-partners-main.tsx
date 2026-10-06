import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Nav } from '../../src/components/Nav'
import { TrustedPartnersGallery } from '../../src/components/TrustedPartners'
import { assembleHome } from '../../src/lib/homeSnapshot'
import { seatLabel } from '../../src/lib/member'
import { TrustedPartnersPanel } from '../../src/pages/admin/TrustedPartnersPanel'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { SponsorShowcasePage } from '../../src/pages/dashboard/SponsorShowcasePage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import '../../src/index.css'

const fixture = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  is_demo: false,
  name: 'Example Capital',
  blurb: 'One line for a fixture partner.',
  monogram: 'EC',
  logo_path: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/logo',
  category_slug: 'investment-banking',
}

const view = new URLSearchParams(window.location.search).get('view') || 'one'
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

const memberModel = assembleHome({
  nowMs: Date.parse('2026-10-06T12:00:00.000Z'),
  seat: 'ksa',
  name: 'Example Member',
  photoUrl: null,
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 0,
  personalCapacityIncluded: false,
  attention: [],
  mandates: [],
  rooms: [],
  directory: [],
  partners: [
    {
      id: 'a4000001-0000-4000-8000-000000000001',
      is_demo: true,
      name: 'Qaf Ledger',
      monogram: 'QL',
      blurb: 'Custody and fund administration for Gulf closings.',
    },
  ],
  gatherings: [],
  admitted: 1,
  ksa: 1,
  intl: 0,
  money: [],
  activity: [],
  activityStatus: 'empty',
  loading: false,
  partialError: false,
  updatedLabel: null,
})

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={[view === 'admin' ? '/admin/settings' : view === 'showcase' ? '/dashboard/sponsors' : '/dashboard']}>
      {view === 'one' ? (
        <div className="ba-landing min-h-dvh bg-pearl">
          <Nav />
          <main className="pt-28">
            <TrustedPartnersGallery partners={[fixture]} surface="public" />
          </main>
        </div>
      ) : null}
      {view === 'member' ? (
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Member"
        >
          <HomeSnapshotView model={memberModel} seatCaption="Founding seat" seatValue={seatLabel('ksa')} />
        </AppShell>
      ) : null}
      {view === 'admin' ? (
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Admin"
        >
          <div className="max-w-3xl">
            <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
            <TrustedPartnersPanel
              previewRows={[
                {
                  ...fixture,
                  published: true,
                  offer: 'A fixture offer.',
                  sponsor_user_id: null,
                  sort_order: 1,
                },
              ]}
            />
          </div>
        </AppShell>
      ) : null}
      {view === 'showcase' ? (
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Member"
        >
          <SponsorShowcasePage
            preview={{
              counts: { pending: 1, approved: 2 },
              cards: [
                {
                  id: fixture.id,
                  name: fixture.name,
                  blurb: fixture.blurb,
                  offer: 'A fixture offer.',
                  monogram: fixture.monogram,
                  logo_path: fixture.logo_path,
                  category_slug: fixture.category_slug,
                  my_request: null,
                },
              ],
            }}
          />
        </AppShell>
      ) : null}
    </MemoryRouter>
  </StrictMode>,
)
