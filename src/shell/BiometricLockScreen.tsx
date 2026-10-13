export function BiometricLockScreen({
  busy,
  onUnlock,
  onSignIn,
}: {
  busy: boolean
  onUnlock: () => void
  onSignIn: () => void
}) {
  return (
    <div
      id="ba-biometric-lock"
      data-biometric-lock=""
      data-screen="biometric-lock"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-lock-title"
      className="fixed inset-0 z-[80] flex flex-col justify-between bg-[var(--ba-indigo-deep)] px-6 text-[var(--ba-porcelain)]"
      style={{
        paddingTop: 'max(2.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <div>
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender)] uppercase">Board Arabia</p>
        <h1 id="biometric-lock-title" className="mt-4 font-display text-[2.2rem] font-semibold tracking-[-0.03em]">
          Unlock to continue
        </h1>
        <p className="mt-4 max-w-sm text-[1.05rem] leading-relaxed text-[var(--ba-porcelain)]/80">
          Use Face ID, Touch ID, or your fingerprint. Biometric data stays on this device.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="inline-flex min-h-12 w-full items-center justify-center bg-[var(--ba-porcelain)] px-4 text-[0.75rem] font-semibold tracking-[0.08em] text-[var(--ba-indigo-deep)] uppercase disabled:opacity-40"
          disabled={busy}
          onClick={onUnlock}
        >
          {busy ? 'Waiting…' : 'Unlock with Face ID / fingerprint'}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center text-[0.95rem] font-semibold underline disabled:opacity-40"
          disabled={busy}
          onClick={onSignIn}
        >
          Sign in another way
        </button>
      </div>
    </div>
  )
}
