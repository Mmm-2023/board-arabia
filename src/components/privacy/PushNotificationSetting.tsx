const heading = 'font-display text-[1.35rem] font-semibold tracking-[-0.02em]'
const body = 'mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/75'
const choice =
  'inline-flex min-h-11 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase'

/** Opt-in control. The parent hides it on the web. */
export function PushNotificationSetting({
  enabled,
  problem = '',
  onEnabled,
}: {
  enabled: boolean
  problem?: string
  onEnabled: (enabled: boolean) => void
}) {
  return (
    <div data-push-notifications={enabled ? 'on' : 'off'}>
      <h2 id="privacy-push" className={heading}>
        Push notifications
      </h2>
      <p className={body}>
        {enabled
          ? 'On. This device is registered. Nothing is sent from here.'
          : 'Off. This device is not registered for notifications.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Push notifications">
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
        Off unless you turn it on. Turning this on asks this device for permission. Nothing is sent now.
      </p>
      {problem ? (
        <p className="mt-3 max-w-xl text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
