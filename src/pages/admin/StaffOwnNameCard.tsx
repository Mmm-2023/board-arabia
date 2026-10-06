import { useState, type FormEvent } from 'react'
import { showStaffNameCard } from '../../lib/staffDisplayName'

export function StaffOwnNameCard({
  savedName,
  ready,
  busy,
  error,
  onSave,
}: {
  savedName: string
  ready: boolean
  busy: boolean
  error: string
  onSave: (name: string) => void
}) {
  const [draft, setDraft] = useState('')
  if (!showStaffNameCard(savedName, ready)) return null
  return (
    <form
      data-staff-name-card=""
      className="mt-6 max-w-xl border border-pearl/15 px-4 py-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <p className="text-[0.95rem] leading-relaxed text-pearl">
        Add your name so the access log shows who opened a record.
      </p>
      <label className="mt-3 block">
        <span className="sr-only">Your name</span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={80}
          autoComplete="name"
          className="mt-2 block min-h-11 w-full max-w-sm border border-pearl/20 bg-transparent px-3 text-[0.95rem] text-pearl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-lavender-mist)]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="ba-primary mt-3 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error ? (
        <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
