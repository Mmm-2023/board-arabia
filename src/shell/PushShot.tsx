import { Capacitor } from '@capacitor/core'
import { PushNotificationSetting } from '../components/privacy/PushNotificationSetting'
import { NotFoundPage } from '../pages/NotFoundPage'
import { pushShotAllowed } from './pushRegistration'

/** Native capture route. Notification settings need a signed-in session, which CI does not have. */
export function PushShot() {
  if (!pushShotAllowed(Capacitor.isNativePlatform())) return <NotFoundPage />
  return (
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink" data-screen="push-settings-shot">
      <div className="max-w-xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Account</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Notifications</h1>
        <div className="mt-8 border-t border-ink/10 pt-8">
          <PushNotificationSetting enabled={false} onEnabled={() => undefined} />
        </div>
      </div>
    </div>
  )
}
