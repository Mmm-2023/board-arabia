import { Link } from 'react-router-dom'
import { membershipLine } from '../../../supabase/functions/_shared/membership_steps.ts'

const primary =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase'

export function FoundingWelcome({
  tier,
  foundingNumber,
  onDismiss,
}: {
  tier: string | null | undefined
  foundingNumber: number | null | undefined
  onDismiss: () => void
}) {
  const line = membershipLine(tier, foundingNumber)
  if (!line) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="w-full max-w-lg border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-5 py-6"
        data-screen="membership-approved"
      >
        <h2 id="upgrade-title" className="font-display text-[1.8rem] font-semibold tracking-[-0.03em]">
          Welcome to full membership
        </h2>
        <p className="mt-3 text-[1.05rem] leading-relaxed">{line}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link to="/dashboard/profile" className={primary} onClick={onDismiss}>
            Review your profile
          </Link>
          <Link to="/dashboard/people/invites" className="inline-flex min-h-11 items-center text-[0.95rem] underline" onClick={onDismiss}>
            Send your two invites
          </Link>
          <Link to="/dashboard/deals/mandates" className="inline-flex min-h-11 items-center text-[0.95rem] underline" onClick={onDismiss}>
            Open Mandates
          </Link>
        </div>
        <button type="button" className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] text-ink/60 underline" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  )
}
