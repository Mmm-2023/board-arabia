import { Capacitor } from '@capacitor/core'
import { BiometricUnlockSetting } from '../components/privacy/BiometricUnlockSetting'
import { NotFoundPage } from '../pages/NotFoundPage'
import { biometricShotAllowed } from './biometricLock'
import { BiometricLockScreen } from './BiometricLockScreen'

/** Native capture route. The member privacy page needs a signed-in session, which CI does not have. */
export function BiometricShot({ screen }: { screen: 'settings' | 'lock' }) {
  if (!biometricShotAllowed(Capacitor.isNativePlatform())) return <NotFoundPage />
  if (screen === 'lock') {
    return <BiometricLockScreen busy={false} onUnlock={() => undefined} onSignIn={() => undefined} />
  }
  return (
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink" data-screen="biometric-settings-shot">
      <div className="max-w-xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Account</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Your privacy</h1>
        <div className="mt-8 border-t border-ink/10 pt-8">
          <BiometricUnlockSetting enabled={false} onEnabled={() => undefined} />
        </div>
      </div>
    </div>
  )
}
