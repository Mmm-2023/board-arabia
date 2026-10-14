import { Capacitor } from '@capacitor/core'
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric'
import {
  biometricAttemptFromError,
  FACE_ID_USAGE,
  markUnlockDisabled,
  markUnlockEnabled,
  type LocalSession,
  type UnlockAttempt,
  type VaultStore,
} from './biometricLock'

const PROMPT = {
  reason: FACE_ID_USAGE,
  title: 'Unlock Board Arabia',
  subtitle: 'Face ID, Touch ID, or fingerprint',
  description: 'Biometric data stays on this device.',
  negativeButtonText: 'Cancel',
  useFallback: false,
  maxAttempts: 1,
}

/** True only on a native device that has Face ID, Touch ID, or an Android biometric enrolled. */
export async function deviceSupportsBiometrics(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await NativeBiometric.isAvailable()
    if (result.isAvailable !== true) return false
    return result.biometryType !== BiometryType.NONE && result.biometryType !== BiometryType.DEVICE_CREDENTIAL
  } catch {
    return false
  }
}

export async function promptForBiometrics(): Promise<UnlockAttempt> {
  try {
    await NativeBiometric.verifyIdentity(PROMPT)
    return 'success'
  } catch (error) {
    return biometricAttemptFromError(error)
  }
}

/** Keychain on iOS and Keystore on Android. Values stay on the device. */
export function nativeVault(): VaultStore {
  return {
    async get(key) {
      try {
        const stored = await NativeBiometric.getData({ key })
        return typeof stored.value === 'string' ? stored.value : null
      } catch {
        return null
      }
    },
    async set(key, value) {
      await NativeBiometric.setData({ key, value })
    },
    async remove(key) {
      try {
        await NativeBiometric.deleteData({ key })
      } catch {
        // A missing key is already the state we want.
      }
    },
  }
}

export async function enableNativeUnlock(session: Partial<LocalSession> | null): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const attempt = await promptForBiometrics()
  if (attempt !== 'success') return false
  return markUnlockEnabled(nativeVault(), session)
}

export async function disableNativeUnlock(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await markUnlockDisabled(nativeVault())
}
