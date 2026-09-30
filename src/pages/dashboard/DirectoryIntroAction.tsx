import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SampleAction } from '../../components/SampleAction'
import {
  cleanIntroReason,
  INTRO_REASON_MAX,
  introQuotaHint,
  introStatusLabel,
  type IntroQuota,
  type IntroStatus,
} from '../../lib/memberIntros'

const fieldClass =
  'mt-2 w-full border border-ink/15 bg-white px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function DirectoryIntroAction({
  sample,
  self,
  status,
  busy,
  error,
  quota = null,
  startOpen = false,
  onRequest,
}: {
  sample: boolean
  self: boolean
  status: IntroStatus | null
  busy: boolean
  error: string
  quota?: IntroQuota | null
  startOpen?: boolean
  onRequest?: (reason: string, askDesk: boolean) => void
}) {
  const reasonId = useId()
  const [open, setOpen] = useState(startOpen)
  const [reason, setReason] = useState('')
  const [askDesk, setAskDesk] = useState(false)
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
    onRequest?.(cleaned.reason, askDesk)
  }

  const shown = localError || error
  const limitHit = quota != null && quota.remaining <= 0
  const hint = quota ? introQuotaHint(quota.remaining, quota.allowance) : ''

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
          <label className="mt-3 flex min-h-11 items-center gap-3 text-[1rem] text-ink">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={askDesk}
              disabled={busy || limitHit}
              onChange={(event) => setAskDesk(event.target.checked)}
            />
            Ask the desk to introduce us
          </label>
          <p className="mt-1 text-[0.92rem] leading-relaxed text-ink/55">
            If they accept, the desk sends the introduction.
          </p>
          {hint ? <p className="mt-2 text-[0.95rem] text-ink/70">{hint}</p> : null}
          {limitHit ? (
            <p className="mt-2 text-[0.92rem] text-[var(--ba-error)]" role="alert">
              You have used this month&apos;s introductions.
            </p>
          ) : null}
          {shown ? (
            <p className="mt-2 text-[0.92rem] text-[var(--ba-error)]" role="alert">
              {shown}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy || limitHit}
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
  if (status === 'accepted') return 'Accepted. Open Intros for email, LinkedIn, and phone when they are set.'
  if (status === 'declined') return 'Declined.'
  return introStatusLabel(status)
}
