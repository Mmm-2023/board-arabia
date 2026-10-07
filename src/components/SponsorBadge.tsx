import { SPONSOR_LABEL } from '../lib/sponsorLabel'

/** Quiet seat mark. Indigo on lavender mist, not a founding-seat label. */
export function SponsorBadge() {
  return (
    <span
      data-seat-badge="sponsor"
      data-chip=""
      className="inline-flex items-center border border-[var(--ba-indigo)]/35 bg-[var(--ba-lavender-mist)] px-2 py-1 text-[12px] font-semibold tracking-[0.04em] text-[var(--ba-indigo)] uppercase"
    >
      {SPONSOR_LABEL}
    </span>
  )
}
