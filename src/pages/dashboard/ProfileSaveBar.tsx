export type SaveBarMode = 'dirty' | 'saving' | 'saved' | 'error'

const COPY: Record<SaveBarMode, { status: string; button: string; alert: boolean }> = {
  dirty: { status: 'Unsaved changes', button: 'Save profile', alert: false },
  saving: { status: 'Saving your profile', button: 'Saving', alert: false },
  saved: { status: 'Saved. Admitted members now see these picks on your card.', button: '', alert: false },
  error: { status: 'Not saved. Your changes are still here. Try again.', button: 'Try again', alert: true },
}

export function ProfileSaveBar({ mode, fixed = true }: { mode: SaveBarMode; fixed?: boolean }) {
  const copy = COPY[mode]
  return (
    <div
      data-profile-save-sticky=""
      data-save-mode={mode}
      className={
        fixed
          ? 'fixed inset-x-0 z-30 border-t border-ink/10 bg-[var(--ba-porcelain)] px-4 py-3 md:hidden'
          : 'border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-4 py-3'
      }
      style={fixed ? { bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      <p className="flex items-start gap-2 text-[15px] leading-relaxed text-ink" role={copy.alert ? 'alert' : 'status'}>
        {mode === 'saved' ? <CheckIcon /> : <Dot error={copy.alert} />}
        <span>{copy.status}</span>
      </p>
      {copy.button ? (
        <button
          type="submit"
          form="profile-form"
          disabled={mode === 'saving'}
          className="ba-primary mt-3 inline-flex min-h-12 w-full items-center justify-center px-5 text-[16px] font-semibold text-[var(--ba-porcelain)] disabled:opacity-60"
        >
          {copy.button}
        </button>
      ) : null}
    </div>
  )
}

function Dot({ error }: { error: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-full ${error ? 'bg-[var(--ba-error)]' : 'bg-[var(--ba-indigo)]'}`}
    />
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-[var(--ba-indigo)]" aria-hidden="true">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
