import { LINKEDIN_CONNECT_ENABLED, LINKEDIN_COPY } from '../../lib/linkedinFlag'

const primaryClass =
  'ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50 sm:w-auto'
const quietClass =
  'inline-flex min-h-11 w-full items-center justify-center border border-ink/20 bg-white/50 px-4 py-3 text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase disabled:opacity-50 sm:w-auto'

export function LinkedInConnect({
  placement,
  linked,
  note,
  errorKind,
  busy,
  onConnect,
  onDismiss,
  onManual,
}: {
  placement: 'signup' | 'profile'
  linked: boolean
  note: string
  errorKind: '' | 'cancel' | 'tech'
  busy: boolean
  onConnect: () => void
  onDismiss: () => void
  onManual: () => void
}) {
  if (!LINKEDIN_CONNECT_ENABLED) return null

  return (
    <section aria-label={LINKEDIN_COPY.section} className="mt-8 border border-ink/10 bg-white/50 px-4 py-4 sm:px-5">
      <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">{LINKEDIN_COPY.section}</p>
      {linked ? (
        <>
          <p className="mt-2 text-[0.98rem] text-ink/70">{LINKEDIN_COPY.connected}</p>
          <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">{LINKEDIN_COPY.refreshHelp}</p>
          <button type="button" disabled={busy} onClick={onConnect} className={`${primaryClass} mt-4`}>
            {busy ? LINKEDIN_COPY.opening : LINKEDIN_COPY.refresh}
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-2 font-display text-[1.45rem] font-semibold tracking-[-0.03em]">{LINKEDIN_COPY.heading}</h2>
          <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/65">{LINKEDIN_COPY.body}</p>
          {busy ? <p className="mt-3 text-[0.95rem] leading-relaxed text-ink/60">{LINKEDIN_COPY.redirect}</p> : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" disabled={busy} onClick={onConnect} className={primaryClass}>
              {busy ? LINKEDIN_COPY.opening : LINKEDIN_COPY.connect}
            </button>
            {placement === 'signup' ? (
              <button type="button" onClick={onManual} className={quietClass}>
                {LINKEDIN_COPY.manual}
              </button>
            ) : null}
          </div>
        </>
      )}
      {note ? (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink/70" role="status">
          {note}
        </p>
      ) : null}
      {errorKind === 'cancel' ? (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--ba-error)]" role="alert">
          {LINKEDIN_COPY.cancelled}{' '}
          <button type="button" onClick={onConnect} className="inline-flex min-h-11 items-center border-b border-brass font-semibold text-ink">
            {LINKEDIN_COPY.tryAgain}
          </button>
        </p>
      ) : null}
      {errorKind === 'tech' ? (
        <div className="mt-3" role="alert">
          <p className="text-[0.95rem] leading-relaxed text-[var(--ba-error)]">{LINKEDIN_COPY.technical}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onConnect} className={primaryClass}>
              {LINKEDIN_COPY.tryAgain}
            </button>
            {placement === 'signup' ? (
              <button type="button" onClick={onManual} className={quietClass}>
                {LINKEDIN_COPY.manual}
              </button>
            ) : (
              <button type="button" onClick={onDismiss} className={quietClass}>
                {LINKEDIN_COPY.dismiss}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
