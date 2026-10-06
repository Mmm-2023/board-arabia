import { SPONSOR_LABEL } from '../../lib/sponsorLabel'

export type SponsorWelcomeAllowances = {
  majlis_slots: number
  intro_credits: number
  room_credits: number
  monthly_base: number | null
}

export function SponsorWelcome({
  allowances,
  onDismiss,
}: {
  allowances: SponsorWelcomeAllowances | null
  onDismiss: () => void
}) {
  return (
    <section
      aria-labelledby="sponsor-welcome-title"
      className="mb-8 max-w-3xl border border-[var(--ba-line)] bg-white px-5 py-5"
      data-sponsor-welcome=""
    >
      <h2 id="sponsor-welcome-title" className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">
        What your seat includes
      </h2>
      <p className="mt-2 text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">{SPONSOR_LABEL}</p>
      {allowances ? (
        <ul className="mt-4 space-y-2 text-[1rem] leading-relaxed text-ink/80">
          <li>Majlis slots: {allowances.majlis_slots} included</li>
          <li>
            Intro credits: {allowances.intro_credits} per month, added to the monthly member allowance
            {allowances.monthly_base == null ? '' : ` of ${allowances.monthly_base}`}
          </li>
          <li>Room credits: {allowances.room_credits} included</li>
        </ul>
      ) : (
        <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">Admin will confirm your package.</p>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-5 inline-flex min-h-11 items-center text-[0.95rem] text-ink/60 underline"
      >
        Dismiss
      </button>
    </section>
  )
}
