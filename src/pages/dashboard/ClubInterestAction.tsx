import { MEMBER_VIEWS } from '../../shell/viewCopy'

export function ClubInterestAction({
  sample,
  pending,
  recorded,
  busy,
  onExpress,
}: {
  sample: boolean
  pending: boolean
  recorded: boolean
  busy: boolean
  onExpress?: () => void
}) {
  const copy = MEMBER_VIEWS.realEstate.club
  if (pending) {
    return (
      <div
        className="mt-4 h-11 animate-pulse border border-[var(--ba-line)] bg-[var(--ba-lavender-mist)] motion-reduce:animate-none"
        aria-busy="true"
        aria-label={copy.loading}
        data-re-club="loading"
      />
    )
  }
  if (recorded) {
    return (
      <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/75" data-re-club="recorded" role="status">
        {copy.recorded}
      </p>
    )
  }
  if (sample) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        data-re-club="sample"
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
      >
        {copy.cta}
      </button>
    )
  }
  if (!onExpress) return null
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      data-re-club="express"
      onClick={onExpress}
      className="ba-primary mt-4 inline-flex min-h-11 w-full items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto"
    >
      {copy.cta}
    </button>
  )
}
