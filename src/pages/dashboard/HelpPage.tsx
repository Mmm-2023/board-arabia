import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DESK_NOTE_MAX, DESK_TOPICS, cleanDeskNote } from '../../../supabase/functions/_shared/desk_note.ts'
import { sendDeskNote } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

const ANSWERS = [
  {
    question: 'How do introductions work?',
    answer:
      'A warm introduction goes through the desk. On a mandate or a real estate brief, Request intro asks the desk to unlock the private details. Members are listed in the Directory. A separate Intros page is not here yet.',
    to: '/dashboard/people/directory',
    toLabel: 'Directory',
  },
  {
    question: 'Who can see a deal room?',
    answer:
      'A deal room is for you and the people you invite. Open one from Deals, then Deal rooms. The desk can see it too.',
    to: '/dashboard/deals/rooms',
    toLabel: 'Deal rooms',
  },
  {
    question: 'How does Majlis work?',
    answer:
      'Upcoming gatherings are listed first. You can answer an invitation there, or ask to host. The desk approves a host request before members see it.',
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
      'You have two peer invites. Unused invites do not refill. People you invite are still reviewed. Their name stays on your sent list, for you and the desk.',
    to: '/dashboard/people/invites',
    toLabel: 'Invites',
  },
] as const

export function HelpPage() {
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
          write to the desk
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

      <section id="desk" className="mt-10 scroll-mt-24" aria-label="Write to the desk">
        <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">Write to the desk</h2>
        <p className="mt-2 text-[1rem] leading-relaxed text-ink/65">
          Send a note from this seat. The desk reads it. Do not put a password in the note.
        </p>
        <form onSubmit={(event) => void onSubmit(event)} className="mt-5 border border-ink/10 px-5 py-5">
          <label className="block text-[0.95rem] text-ink" htmlFor="desk_topic">
            Topic
          </label>
          <select
            id="desk_topic"
            required
            value={topic}
            disabled={busy}
            onChange={(event) => setTopic(event.target.value)}
            className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] outline-none focus:border-brass"
          >
            <option value="">Choose a topic</option>
            {DESK_TOPICS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="mt-4 block text-[0.95rem] text-ink" htmlFor="desk_message">
            Note
          </label>
          <textarea
            id="desk_message"
            required
            rows={5}
            maxLength={DESK_NOTE_MAX}
            value={message}
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] leading-relaxed outline-none focus:border-brass"
          />
          <p className="mt-2 text-[0.85rem] text-ink/45">Up to {DESK_NOTE_MAX} characters.</p>
          <button
            type="submit"
            disabled={busy}
            className="ba-primary mt-4 inline-flex min-h-11 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send to the desk'}
          </button>
        </form>
        {error ? (
          <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p className="mt-4 text-[0.95rem] text-ink/70" role="status">
            The desk has your note.
          </p>
        ) : null}
      </section>
    </div>
  )
}
