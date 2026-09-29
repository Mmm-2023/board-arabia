type AdmitShareCardProps = {
  href: string
  dismissing?: boolean
  error?: string
  onShare?: () => void
  onDismiss?: () => void
}

/** Optional Home card. Hidden by the parent unless the server says to show it. */
export function AdmitShareCard({ href, dismissing = false, error = '', onShare, onDismiss }: AdmitShareCardProps) {
  return (
    <section
      id="admit-share-card"
      aria-label="Share your admission"
      data-admit-share-card=""
      className="border border-[var(--ba-line)] bg-white px-4 py-4"
    >
      <h3 className="font-display text-[1.15rem] font-semibold text-ink">Share your admission</h3>
      <p className="mt-1 text-[0.95rem] text-[var(--ba-muted)]">Optional. We never post for you.</p>
      <div className="mt-3 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onShare}
          className="inline-flex min-h-11 items-center bg-[#1C1343] px-4 text-[0.95rem] font-semibold text-[#F6F5FB]"
        >
          Share on LinkedIn
        </a>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="inline-flex min-h-11 items-center px-1 text-[0.95rem] font-semibold text-[var(--ba-indigo)] disabled:opacity-60"
        >
          Dismiss
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[0.95rem] text-[var(--ba-error)]">
          {error}
        </p>
      ) : null}
    </section>
  )
}
