import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DESK_NOTE_MAX, DESK_TOPICS, cleanDeskNote } from '../../../supabase/functions/_shared/desk_note.ts'
import { sendDeskNote } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'
const labelClass = 'text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase'

const ANSWERS = [
  {
    question: 'How do introductions work?',
    answer:
      'Request a warm introduction from a Directory card and give a short reason. The other member accepts or declines on Intros. Email and phone stay private. A mandate or real estate Request intro still asks our admin team to unlock a brief, and those requests sit in the same Intros list.',
    to: '/dashboard/people/intros',
    toLabel: 'Intros',
  },
  {
    question: 'Who can see a deal room?',
    answer:
      'A deal room is for you and the people you invite. Open one from Deals, then Deal rooms. Our admin team can see it too.',
    to: '/dashboard/deals/rooms',
    toLabel: 'Deal rooms',
  },
  {
    question: 'How does Majlis work?',
    answer:
      'Upcoming gatherings are listed first. You can answer an invitation there, or ask to host. Our admin team approves a host request before members see it.',
    to: '/dashboard/majlis',
    toLabel: 'Majlis',
  },
  {
    question: 'What stays private?',
    answer:
      'The public site does not publish member names or individual amounts. Inside the membership, the Directory shows the profile fields you fill in. Your phone number and capacity figures stay off that card.',
    to: '/privacy',
    toLabel: 'Privacy',
  },
  {
    question: 'How do peer invites work?',
    answer:
      'You have two peer invites. Unused invites do not refill. People you invite are still reviewed. Their name stays on your sent list, for you and our admin team.',
    to: '/dashboard/people/invites',
    toLabel: 'Invites',
  },
] as const

export function HelpPage({ desk = true }: { desk?: boolean } = {}) {
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  useNoIndex('Help | Board Arabia')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSent(false)
    const cleaned = cleanDeskNote({ topic, message })
    if (!cleaned.ok) {
      setError(cleaned.error)
      return
    }
    setBusy(true)
    const result = await sendDeskNote({ topic: cleaned.topic, message: cleaned.message })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setTopic('')
    setMessage('')
    setSent(true)
  }

  return (
    <div className="max-w-xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Help</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Help</h1>
      <p className="mt-4 text-[1.02rem] leading-relaxed text-ink/65">
        Short answers for the membership. If you still need a person,{' '}
        <a href="#desk" className="underline">
          write to our admin team
        </a>
        .
      </p>

      <div className="mt-8 border-t border-ink/10">
        {ANSWERS.map((item) => (
          <details key={item.question} className="border-b border-ink/10 py-3">
            <summary className="cursor-pointer py-2 font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
              {item.question}
            </summary>
            <p className="mt-2 text-[1rem] leading-relaxed text-ink/70">{item.answer}</p>
            <Link to={item.to} className="mt-3 inline-flex min-h-11 items-center text-ink underline">
              {item.toLabel}
            </Link>
          </details>
        ))}
      </div>

      <p className="mt-6">
        <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center text-ink/75 underline">
          Profile
        </Link>
      </p>

      {desk ? (
        <section id="desk" className="mt-10 scroll-mt-24" aria-label="Write to our admin team">
          <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">Write to our admin team</h2>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink/65">
            Send a note from this seat. Our admin team reads it. Do not put a password in the note.
          </p>
          <form onSubmit={(event) => void onSubmit(event)} className="mt-5 max-w-xl space-y-5">
            <label className="block" htmlFor="desk_topic">
              <span className={labelClass}>Topic</span>
              <select id="desk_topic" required value={topic} disabled={busy} onChange={(event) => setTopic(event.target.value)} className={fieldClass}>
                <option value="">Choose a topic</option>
                {DESK_TOPICS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="desk_message">
              <span className={labelClass}>Note</span>
              <textarea
                id="desk_message"
                required
                rows={5}
                maxLength={DESK_NOTE_MAX}
                value={message}
                disabled={busy}
                onChange={(event) => setMessage(event.target.value)}
                className={`${fieldClass} leading-relaxed`}
              />
            </label>
            <p className="text-[0.85rem] text-ink/45">Up to {DESK_NOTE_MAX} characters.</p>
            <button
              type="submit"
              disabled={busy}
              className="ba-primary inline-flex min-h-11 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Send to our admin team'}
            </button>
          </form>
          {error ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          {sent ? (
            <p className="mt-4 text-[0.95rem] text-ink/70" role="status">
              Our admin team has your note.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="mt-10 text-[1rem] leading-relaxed text-ink/65">
          Writing to our admin team opens with full membership.
        </p>
      )}
    </div>
  )
}
