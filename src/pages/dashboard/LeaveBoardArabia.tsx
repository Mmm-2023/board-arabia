import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LEAVE_DESK_REQUEST } from '../../lib/leaveBoard'
import { sendDeskNote } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

const primary =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'

export function LeaveBoardArabiaPage() {
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  useNoIndex('Leave Board Arabia | Board Arabia')

  async function onConfirm() {
    setBusy(true)
    setError('')
    const result = await sendDeskNote(LEAVE_DESK_REQUEST)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
  }

  return (
    <div className="max-w-xl" data-screen="leave-board-arabia">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Profile</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Leave Board Arabia</h1>
      <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/75">
        This sends a request to admin. Your seat stays open until admin closes it. Nothing is deleted from this page.
      </p>
      {sent ? (
        <p className="mt-6 text-[1rem] text-ink" role="status">
          Admin has your request.
        </p>
      ) : (
        <>
          <label className="mt-6 flex min-h-11 items-start gap-3 text-[1rem] leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 size-6 shrink-0"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I understand this asks admin to close my membership.</span>
          </label>
          {error ? (
            <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={!confirmed || busy} onClick={() => void onConfirm()}>
              {busy ? 'Sending…' : 'Send request to admin'}
            </button>
            <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
              Keep my membership
            </Link>
          </div>
        </>
      )}
      {sent ? (
        <p className="mt-6">
          <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
            Back to Profile
          </Link>
        </p>
      ) : null}
    </div>
  )
}
