import { useEffect, useRef, type FormEvent } from 'react'
import type { DryRunInvite } from '../../lib/supabase'
import {
  sponsorAddDisabled,
  sponsorCapCopy,
  sponsorCapView,
  sponsorListRows,
  type SponsorSeatRow,
} from '../../lib/sponsorSeat'
import { EmptyState } from '../../shell/ViewState'
import { DryRunInviteBox } from './bits'

type Holder = SponsorSeatRow & { user_id: string; email: string }

export function SponsorInvitePanel({
  members,
  firmByUser,
  capKnown,
  countError,
  submitting,
  open,
  firm,
  email,
  error,
  success,
  dryRunInvite,
  onOpen,
  onCancel,
  onFirm,
  onEmail,
  onSubmit,
}: {
  members: readonly Holder[]
  firmByUser: Readonly<Record<string, string | null | undefined>>
  capKnown: boolean
  countError: boolean
  submitting: boolean
  open: boolean
  firm: string
  email: string
  error: string
  success: string
  dryRunInvite: DryRunInvite | null
  onOpen: () => void
  onCancel: () => void
  onFirm: (value: string) => void
  onEmail: (value: string) => void
  onSubmit: () => void
}) {
  const cap = sponsorCapView(members)
  const copy = sponsorCapCopy({
    capKnown,
    countError,
    full: cap.full,
    remaining: cap.remaining,
    cap: cap.cap,
  })
  const addDisabled = sponsorAddDisabled({ capKnown, full: cap.full, submitting })
  const sendDisabled = addDisabled || !firm.trim() || !email.trim()
  const rows = sponsorListRows(members, firmByUser)
  const firmRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    firmRef.current?.focus()
  }, [open])

  function onFormSubmit(event: FormEvent) {
    event.preventDefault()
    if (sendDisabled) return
    onSubmit()
  }

  return (
    <section aria-labelledby="sponsor-invite-heading" className="mt-8 border border-brass/30 px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2
            id="sponsor-invite-heading"
            className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]"
          >
            Sponsors
          </h2>
          <p
            id="sponsor-seat-note"
            role={countError ? 'alert' : 'status'}
            className="mt-2 text-[0.9rem] leading-relaxed text-stone/65"
          >
            {copy}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="add-sponsor-form"
          aria-describedby="sponsor-seat-note"
          disabled={addDisabled}
          onClick={onOpen}
          className="ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto"
        >
          Add Sponsor
        </button>
      </div>

      {success && (
        <p className="mt-4 text-[0.95rem] text-brass-bright" role="status">
          {success}
        </p>
      )}
      {dryRunInvite && (
        <div className="mt-4">
          <DryRunInviteBox invite={dryRunInvite} />
        </div>
      )}

      {open && (
        <form
          id="add-sponsor-form"
          onSubmit={onFormSubmit}
          aria-busy={submitting}
          className="mt-5 max-w-xl space-y-4"
        >
          <p className="text-[0.9rem] leading-relaxed text-stone/65">
            Firm name and email are required. This sends a set-password invite and does not use a
            founding seat.
          </p>
          <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
            Firm name
            <span className="tracking-normal text-pearl/55 normal-case"> (required)</span>
            <input
              ref={firmRef}
              value={firm}
              onChange={(event) => onFirm(event.target.value)}
              required
              maxLength={200}
              autoComplete="organization"
              disabled={submitting}
              className="mt-2 block w-full border border-pearl/20 bg-ink px-3 py-3 text-[0.9rem] text-pearl normal-case disabled:opacity-40"
            />
          </label>
          <label className="block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
            Email
            <span className="tracking-normal text-pearl/55 normal-case"> (required)</span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
              required
              maxLength={320}
              autoComplete="off"
              placeholder="name@example.com"
              disabled={submitting}
              className="mt-2 block w-full border border-pearl/20 bg-ink px-3 py-3 text-[0.9rem] text-pearl normal-case disabled:opacity-40"
            />
          </label>
          {error && (
            <p className="text-[0.95rem] text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={sendDisabled}
              className="ba-primary inline-flex min-h-11 items-center justify-center px-4 text-[0.72rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
            >
              {submitting ? 'Sending invite' : 'Send invite'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center border border-pearl/20 px-4 text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/70 uppercase disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-pearl/45 uppercase">
          Invited and active
        </h3>
        {rows.length === 0 ? (
          <div className="mt-3">
            <EmptyState tone="staff" message="No sponsors invited yet." />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.userId} className="border border-pearl/10 px-4 py-4 sm:px-5">
                <p className="text-[0.95rem] break-all text-stone/85">{row.email}</p>
                <p className="mt-1 text-[0.8rem] text-pearl/45">
                  {row.firm ?? 'No firm name yet'} · {row.status}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.85rem] leading-relaxed text-pearl/45">
          Suspended sponsors do not hold a seat.
        </p>
      </div>
    </section>
  )
}
