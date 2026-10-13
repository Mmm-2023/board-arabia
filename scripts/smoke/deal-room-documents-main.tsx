import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { DealRoomDocuments, type DealDocumentItem, type DealDocumentLog } from '../../src/pages/dashboard/DealRoomDocuments'
import { StaffRoomsBoard } from '../../src/pages/admin/StaffRoomsBoard'
import './smoke.css'

const stamp = 'Example Viewer, viewer@example.com, 2026-10-13 14:30 Asia/Riyadh, room cccccccc'
const people = [
  { memberId: '11111111-1111-4111-8111-111111111111', fullName: 'Example Owner' },
  { memberId: '22222222-2222-4222-8222-222222222222', fullName: 'Example Member' },
]

const off: DealDocumentItem = {
  id: 'doc-off',
  fileName: 'Board pack.pdf',
  downloadAllowed: false,
  expiresAt: null,
  sharedWithAdmin: false,
  uploadedByMe: true,
  expired: false,
}

const on: DealDocumentItem = {
  id: 'doc-on',
  fileName: 'Site plan.png',
  downloadAllowed: true,
  expiresAt: '2026-11-01T09:00:00.000Z',
  sharedWithAdmin: true,
  uploadedByMe: true,
  expired: false,
}

const expired: DealDocumentItem = {
  id: 'doc-expired',
  fileName: 'Term sheet.pdf',
  downloadAllowed: false,
  expiresAt: '2026-10-01T09:00:00.000Z',
  sharedWithAdmin: false,
  uploadedByMe: false,
  expired: true,
}

const events: DealDocumentLog[] = [
  {
    id: 'evt-1',
    fileName: 'Board pack.pdf',
    memberName: 'Example Member',
    action: 'view',
    at: '2026-10-13T11:30:00.000Z',
  },
  {
    id: 'evt-2',
    fileName: 'Site plan.png',
    memberName: 'Example Owner',
    action: 'download',
    at: '2026-10-13T11:42:00.000Z',
  },
]

function Frame({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="bg-pearl px-5 py-6 text-ink">
      {children}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="grid gap-10 bg-[#efeae2] p-4">
      <Frame id="docs-empty">
        <DealRoomDocuments
          roomOpen
          isOwner
          documents={[]}
          events={[]}
          view={null}
          participants={people}
        />
      </Frame>
      <Frame id="docs-files">
        <DealRoomDocuments
          roomOpen
          isOwner={false}
          documents={[off, on]}
          events={[]}
          view={null}
          participants={people}
        />
      </Frame>
      <Frame id="docs-viewer-off">
        <DealRoomDocuments
          roomOpen
          isOwner={false}
          documents={[off]}
          events={[]}
          view={{ fileName: 'Board pack.pdf', stamp, src: '', downloadAllowed: false }}
          participants={people}
        />
      </Frame>
      <Frame id="docs-viewer-on">
        <DealRoomDocuments
          roomOpen
          isOwner={false}
          documents={[on]}
          events={[]}
          view={{ fileName: 'Site plan.png', stamp, src: '', downloadAllowed: true }}
          participants={people}
        />
      </Frame>
      <Frame id="docs-expiry">
        <DealRoomDocuments roomOpen isOwner documents={[off]} events={[]} view={null} participants={people} />
      </Frame>
      <Frame id="docs-log">
        <DealRoomDocuments roomOpen isOwner documents={[off]} events={events} view={null} participants={people} />
      </Frame>
      <Frame id="docs-expired">
        <DealRoomDocuments roomOpen isOwner={false} documents={[expired]} events={[]} view={null} participants={people} />
      </Frame>
      <div id="staff-counts" className="bg-ink px-5 py-6 text-pearl">
        <StaffRoomsBoard
          rooms={[
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              name: 'Example room',
              purpose: 'A private room for a live mandate.',
              status: 'open',
              openedBy: 'member',
              acceptedCount: 2,
              invitedCount: 1,
              documentCount: 3,
            },
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              name: 'Second example room',
              purpose: 'Opened by admin.',
              status: 'closed',
              openedBy: 'admin',
              acceptedCount: 1,
              invitedCount: 0,
              documentCount: 0,
            },
          ]}
          busyId={null}
          error=""
          onClose={() => {}}
        />
      </div>
    </div>
  </StrictMode>,
)
