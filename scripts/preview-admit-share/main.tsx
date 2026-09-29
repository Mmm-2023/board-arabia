import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AdmitShareCard } from '../../src/pages/dashboard/AdmitShareCard.tsx'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView.tsx'
import { assembleHome } from '../../src/lib/homeSnapshot.ts'
import { AppShell } from '../../src/shell/AppShell.tsx'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations.ts'
import '../preview/preview.css'

const model = assembleHome({
  nowMs: Date.parse('2026-09-29T12:00:00.000Z'),
  seat: 'ksa',
  name: 'Layla Hassan',
  photoUrl: null,
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 2,
  personalCapacityIncluded: false,
  attention: [],
  mandates: [],
  rooms: [],
  directory: [],
  partners: [],
  gatherings: [],
  admitted: 12,
  ksa: 8,
  intl: 4,
  money: [],
  activity: [],
  activityStatus: 'empty',
  loading: false,
  partialError: false,
  updatedLabel: 'Updated 09:00',
})

const shareHref =
  'https://example.supabase.co/functions/v1/admit-li-share-go?t=previewtokenpreviewtokenpreview12'

function Preview() {
  useEffect(() => {
    document.getElementById('admit-share-card')?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:00"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="member@example.com"
        accountName="Layla Hassan"
      >
        <HomeSnapshotView
          model={model}
          seatCaption="Founding seat"
          seatValue="Saudi Arabia"
          userId="preview"
          shareSlot={<AdmitShareCard href={shareHref} onDismiss={() => {}} onShare={() => {}} />}
        />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
