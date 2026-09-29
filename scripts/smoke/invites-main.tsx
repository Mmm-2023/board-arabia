import { StrictMode, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { InvitesPanel, type SentInvite } from '../../src/pages/dashboard/InvitesPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const sent: SentInvite[] = [
  {
    id: 'invite-email',
    token: 'abcdefghijklmnopqrstuvwxyz0123456789ABCdefg',
    channel: 'email',
    status: 'pending',
    recipient_email: 'guest@example.com',
    recipient_phone: null,
    created_at: '2026-09-22T09:00:00.000Z',
    expires_at: '2026-12-21T09:00:00.000Z',
  },
  {
    id: 'invite-whatsapp',
    token: 'abcdefghijklmnopqrstuvwxyz0123456789ABCdefh',
    channel: 'whatsapp',
    status: 'opened',
    recipient_email: null,
    recipient_phone: '966500000000',
    created_at: '2026-09-22T10:30:00.000Z',
    expires_at: '2026-12-21T10:30:00.000Z',
  },
]

export function Preview() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  function onEmail(event: FormEvent) {
    event.preventDefault()
    setNote('Invite sent. They\u2019ll apply with your name attached.')
    setEmail('')
  }

  function onWhatsApp(event: FormEvent) {
    event.preventDefault()
    setNote('Invite sent. They\u2019ll apply with your name attached.')
    setPhone('')
  }

  return (
    <MemoryRouter initialEntries={['/dashboard/network']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        <div className="max-w-3xl">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Network</p>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Network</h1>
          <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink/60">
            Peer invites and introduction requests live here.
          </p>
          <div className="mt-8">
            <InvitesPanel
              embedded
              remaining={1}
              inviterName="Layla Hassan"
              email={email}
              phone={phone}
              busy={null}
              note={note}
              error=""
              sent={sent}
              listError=""
              loadingList={false}
              onEmailChange={setEmail}
              onPhoneChange={setPhone}
              onEmail={onEmail}
              onWhatsApp={onWhatsApp}
              onRetry={() => {}}
            />
          </div>
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing root')
createRoot(root).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
