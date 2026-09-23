import type { ShellTone } from './destinations'
import { toneClasses } from './ViewState'

export function ConfirmDialog({
  tone,
  title,
  body,
  busy,
  onCancel,
  onConfirm,
}: {
  tone: ShellTone
  title: string
  body: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const styles = toneClasses(tone)
  const surface = tone === 'staff' ? 'bg-ink text-pearl' : 'bg-pearl text-ink'
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className={`w-full max-w-md border px-5 py-5 ${styles.border} ${surface}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        <p className={`mt-3 text-[0.98rem] leading-relaxed ${styles.muted}`}>{body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.secondary}`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 ${styles.primary}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
