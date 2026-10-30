import { createRoot } from 'react-dom/client'
import {
  GUEST_JOIN_NOT_READY,
  MEET_LINK_NOT_READY,
  reminderLetter,
  type ReminderKind,
} from '../../supabase/functions/_shared/majlis_mail.ts'
import './smoke.css'

const event = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Chairs circle',
  region: 'Riyadh',
  starts_at: '2026-11-02T15:30:00.000Z',
  ends_at: '2026-11-02T17:00:00.000Z',
  venue_name: 'House',
  venue_address: 'Olaya',
  venue_visibility: 'members_on_rsvp',
  capacity: 12,
}

const site = 'https://boardarabia.com'
const kinds: Array<{ id: ReminderKind; label: string }> = [
  { id: 't7', label: 'One week' },
  { id: 't1', label: 'One day' },
  { id: 't1h', label: 'About one hour' },
  { id: 'live', label: 'Starting now' },
]

const cards = [
  ...kinds.map((kind) => ({
    id: kind.id,
    label: kind.label,
    letter: reminderLetter(site, event, kind.id, { registered: true, audience: 'member', format: 'in_person', meetReady: false }),
  })),
  {
    id: 'virtual-member',
    label: 'Virtual, link not ready',
    letter: reminderLetter(site, event, 'live', {
      registered: true,
      audience: 'member',
      format: 'virtual',
      meetReady: false,
    }),
  },
  {
    id: 'virtual-guest',
    label: 'Guest, link not ready',
    letter: reminderLetter(site, event, 't1h', {
      registered: true,
      audience: 'guest',
      format: 'virtual',
      meetReady: false,
    }),
  },
]

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')

createRoot(root).render(
  <main
    data-shot="letters"
    style={{
      boxSizing: 'border-box',
      maxWidth: 720,
      margin: '0 auto',
      padding: 'max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))',
      color: '#1c1917',
      background: '#f7f4ef',
    }}
  >
    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>Draft reminder letters. Nothing is sent.</p>
    <h1 style={{ margin: '12px 0 0', fontSize: 28, lineHeight: 1.2 }}>Majlis reminders</h1>
    <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.5 }}>
      One week, one day, about one hour, and the start. The Join page is the only link.
    </p>
    <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
      {cards.map((card) => (
        <article
          key={card.id}
          data-letter={card.id}
          style={{ background: '#fff', border: '1px solid #e4ddd2', padding: 16 }}
        >
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>{card.label}</h2>
          <p data-letter-subject="" style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.5 }}>
            {card.letter.subject}
          </p>
          <div
            data-letter-html=""
            style={{ marginTop: 8, fontSize: 16, lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: card.letter.html }}
          />
        </article>
      ))}
    </div>
    <p data-copy-member="" hidden>
      {MEET_LINK_NOT_READY}
    </p>
    <p data-copy-guest="" hidden>
      {GUEST_JOIN_NOT_READY}
    </p>
  </main>,
)
