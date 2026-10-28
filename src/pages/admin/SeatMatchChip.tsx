import { adminSeatMatchLabel } from '../../lib/boardroom'

/** Admin Profiles chip. Hidden when the board fields are not on the row yet. */
export function SeatMatchChip({ on }: { on: boolean | null }) {
  const label = adminSeatMatchLabel(on)
  if (!label) return null
  const filled = on === true
  return (
    <span
      className={`inline-flex min-h-12 items-center px-3 text-[0.85rem] md:min-h-11 ${
        filled ? 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]' : 'border border-[var(--ba-line)] bg-white text-ink'
      }`}
    >
      {label}
    </span>
  )
}
