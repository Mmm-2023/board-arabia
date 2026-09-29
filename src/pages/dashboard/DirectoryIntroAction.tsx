import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SampleAction } from '../../components/SampleAction'
import { cleanIntroReason, INTRO_REASON_MAX, introStatusLabel, type IntroStatus } from '../../lib/memberIntros'

const fieldClass =
  'mt-2 w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function DirectoryIntroAction({
  sample,
  self,
  status,
  busy,
  error,
  onRequest,
}: {
  sample: boolean
  self: boolean
  status: IntroStatus | null
  busy: boolean
  error: string
  onRequest?: (reason: string) => void
}) {
  const reasonId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState('')

  if (sample) {
    return (
      <div data-intro-action="sample">
        <SampleAction label="Request intro" />
      </div>
    )
  }

  if (self) {
    return (
      <p className="mt-4 text-[0.92rem] text-ink/60" data-intro-action="self">
        This is your card.
      </p>
    )
  }

  if (status) {
    return (
      <div className="mt-4" data-intro-action={status}>
        <p className="text-[0.92rem] text-ink/60">{statusCopy(status)}</p>
        <Link to="/dashboard/people/intros" className="mt-2 inline-flex min-h-11 items-center text-ink underline">
          Intros
        </Link>
      </div>
    )
  }

  if (!onRequest) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    const cleaned = cleanIntroReason(reason)
    if (!cleaned.ok) {
      setLocalError(cleaned.error)
      return
    }
    setLocalError('')
    onRequest?.(cleaned.reason)
  }

  const shown = localError || error

  return (
    <div className="mt-4" data-intro-action="request">
      {open ? (
        <form onSubmit={submit}>
          <label className="block" htmlFor={reasonId}>
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
              Why this introduction
            </span>
            <textarea
              id={reasonId}
              required
              rows={3}
              maxLength={INTRO_REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="A short reason. No email address or phone number."
              className={`${fieldClass} leading-relaxed`}
            />
          </label>
          <p className="mt-2 text-[0.85rem] text-ink/45">Up to {INTRO_REASON_MAX} characters.</p>
          {shown ? (
            <p className="mt-2 text-[0.92rem] text-[var(--ba-error)]" role="alert">
              {shown}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setLocalError('')
              }}
              className="inline-flex min-h-11 items-center border border-[var(--ba-line)] bg-white px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        >
          Request intro
        </button>
      )}
    </div>
  )
}

function statusCopy(status: IntroStatus): string {
  if (status === 'pending') return `Request sent. ${introStatusLabel(status)}.`
  if (status === 'accepted') return 'Accepted. You still see only the directory card. Email and phone stay private.'
  if (status === 'declined') return 'Declined.'
  return introStatusLabel(status)
}
