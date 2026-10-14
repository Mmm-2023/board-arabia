const heading = 'font-display text-[1.35rem] font-semibold tracking-[-0.02em]'
const body = 'mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/75'
const choice =
  'inline-flex min-h-11 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase'

/** Opt-in control. The parent hides it on the web and on devices without biometrics. */
export function BiometricUnlockSetting({
  enabled,
  onEnabled,
}: {
  enabled: boolean
  onEnabled: (enabled: boolean) => void
}) {
  return (
    <div data-biometric-unlock={enabled ? 'on' : 'off'}>
      <h2 id="privacy-biometric" className={heading}>
        Unlock with Face ID / fingerprint
      </h2>
      <p className={body}>
        {enabled
          ? 'On. Reopening the app after 5 minutes in the background asks for Face ID, Touch ID, or your fingerprint.'
          : 'Off. The app opens without Face ID, Touch ID, or a fingerprint.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Unlock with Face ID / fingerprint">
        <button
          type="button"
          className={`${choice} ${enabled ? 'border-ink/20 text-ink/70' : 'ba-primary border-transparent'}`}
          aria-pressed={!enabled}
          onClick={() => onEnabled(false)}
        >
          Off
        </button>
        <button
          type="button"
          className={`${choice} ${enabled ? 'ba-primary border-transparent' : 'border-ink/20 text-ink/70'}`}
          aria-pressed={enabled}
          onClick={() => onEnabled(true)}
        >
          On
        </button>
      </div>
      <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-ink/65">
        Off unless you turn it on. Biometric data stays on this device. If unlock fails or you cancel, you sign in
        again.
      </p>
    </div>
  )
}
