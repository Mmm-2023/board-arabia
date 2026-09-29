import { presentedByLine } from '../lib/sponsorDesk'

export function PresentedBy({ label }: { label: string | null }) {
  const line = presentedByLine(label)
  if (!line) return null
  return (
    <p className="mt-1 text-[0.88rem] text-[var(--ba-muted)]" data-presented-by="">
      {line}
    </p>
  )
}
