# APP-3 handoff: Face ID, Touch ID, and Android biometrics

Base: `f17e56b` (main, APP-2). No migration. No Edge. The `/apply` route was not edited. Locked Pages files were not edited. `pr-checks.yml` again runs only on pull requests into `main`.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| Opt-in "Unlock with Face ID / fingerprint", off unless the member turns it on | `src/components/privacy/BiometricUnlockSetting.tsx:16`, `src/components/privacy/PrivacyPanelView.tsx:154` | VERIFIED |
| Hidden on the web and when the device has no biometric | `src/shell/biometricLock.ts:36`, `src/pages/dashboard/PrivacyPanelPage.tsx:48` | VERIFIED |
| Lock after 5 minutes in the background, and only when a session exists | `src/shell/biometricLock.ts:3`, `src/shell/biometricLock.ts:47` | VERIFIED |
| Cancel or failure signs out locally and drops the vault copy. The preference stays on | `src/shell/biometricLock.ts:162`, `src/shell/BiometricGateNative.tsx:36` | VERIFIED |
| Session JSON stays in Keychain and Keystore through `@capgo/capacitor-native-biometric` 8.6.7 | `src/shell/nativeBiometric.ts:50`, `package.json` | VERIFIED |
| Prompt does not accept the device passcode as success | `src/shell/nativeBiometric.ts:19` | VERIFIED |
| Face ID usage string | `ios/App/App/Info.plist` | VERIFIED |
| Android `USE_BIOMETRIC` | `android/app/src/main/AndroidManifest.xml` | VERIFIED |
| PR checks listen to `main` only | `.github/workflows/pr-checks.yml:4` | VERIFIED |
| Existing iOS simulator and Android emulator jobs also capture the settings toggle and the unlock screen | `.github/workflows/app-builds.yml` | VERIFIED |

The member privacy page needs a signed-in session. CI has no credentials, so the same jobs open `com.boardarabia.app://native/biometric-shot/settings` and `com.boardarabia.app://native/biometric-shot/lock`. Those routes render the real control and the real lock screen, and only inside the native app. On the web they are a not-found page.

Biometric data is never sent anywhere. The plugin stores the access token and refresh token on the device. A failed or cancelled prompt calls `signOut({ scope: 'local' })` and deletes that copy. There is no server change.

## Shots

Filled from the app build artifacts after CI:

- `handoff/app-3-biometric/ios-biometric-settings.png`
- `handoff/app-3-biometric/ios-biometric-lock.png`
- `handoff/app-3-biometric/android-biometric-settings.png`
- `handoff/app-3-biometric/android-biometric-lock.png`

## Not done

No migration. No Edge deploy. No store upload. No signing material in git.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, JWT, private key, certificate, keystore, provisioning profile, team id, or fingerprint. The only address-like strings in tests stay out of this change. The plugin record in `package-lock.json` is the public npm tarball and its integrity hash.
