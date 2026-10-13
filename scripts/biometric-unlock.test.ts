import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  BIOMETRIC_BACKGROUND_KEY,
  BIOMETRIC_ENABLED_KEY,
  BIOMETRIC_LOCK_TIMEOUT_MS,
  BIOMETRIC_SESSION_KEY,
  FACE_ID_USAGE,
  biometricAttemptFromError,
  biometricShotAllowed,
  completeUnlock,
  markUnlockDisabled,
  markUnlockEnabled,
  parseBackgroundedAt,
  parseSessionPayload,
  parseUnlockEnabled,
  prepareLock,
  sessionPayload,
  shouldRequireBiometricUnlock,
  shouldShowLock,
  showBiometricSetting,
  unlockOutcome,
  type LocalSession,
  type SessionHost,
  type VaultStore,
} from '../src/shell/biometricLock.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const SESSION: LocalSession = { access_token: 'access-token', refresh_token: 'refresh-token' }

function memoryVault(): VaultStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get(key) {
      return values.get(key) ?? null
    },
    async set(key, value) {
      values.set(key, value)
    },
    async remove(key) {
      values.delete(key)
    },
  }
}

function host(session: LocalSession | null, setError = false) {
  const state = { session, signedOut: false, cleared: false, restored: null as LocalSession | null }
  const api: SessionHost = {
    async getSession() {
      return state.session
    },
    async setSession(next) {
      if (setError) return { error: true }
      state.session = next
      state.restored = next
      return { error: false }
    },
    async signOutLocal() {
      state.session = null
      state.signedOut = true
    },
    clearStoredTokens() {
      state.cleared = true
    },
  }
  return { state, api }
}

function panel(
  View: (props: Record<string, unknown>) => unknown,
  extra: { biometricAvailable?: boolean; biometricEnabled?: boolean } = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(View, {
        hidden: false,
        showSponsors: false,
        twoStepOn: false,
        analyticsOn: false,
        privacyContact: null,
        downloadState: 'idle',
        onHidden: () => undefined,
        onShowSponsors: () => undefined,
        onDownload: () => undefined,
        ...extra,
      }),
    ),
  )
}

test('the lock waits five minutes in the background and stays off by default', () => {
  assert.equal(BIOMETRIC_LOCK_TIMEOUT_MS, 5 * 60 * 1000)
  const start = 1_700_000_000_000
  assert.equal(shouldRequireBiometricUnlock({ enabled: false, backgroundedAt: start, now: start + BIOMETRIC_LOCK_TIMEOUT_MS }), false)
  assert.equal(shouldRequireBiometricUnlock({ enabled: true, backgroundedAt: null, now: start }), false)
  assert.equal(
    shouldRequireBiometricUnlock({ enabled: true, backgroundedAt: start, now: start + BIOMETRIC_LOCK_TIMEOUT_MS - 1 }),
    false,
  )
  assert.equal(
    shouldRequireBiometricUnlock({ enabled: true, backgroundedAt: start, now: start + BIOMETRIC_LOCK_TIMEOUT_MS }),
    true,
  )
  assert.equal(shouldRequireBiometricUnlock({ enabled: true, backgroundedAt: start, now: start + 1, timeoutMs: 1 }), true)
  assert.equal(shouldShowLock({ enabled: true, backgroundedAt: start, now: start + BIOMETRIC_LOCK_TIMEOUT_MS, hasSession: false }), false)
  assert.equal(shouldShowLock({ enabled: true, backgroundedAt: start, now: start + BIOMETRIC_LOCK_TIMEOUT_MS, hasSession: true }), true)
  assert.equal(parseUnlockEnabled(null), false)
  assert.equal(parseUnlockEnabled('0'), false)
  assert.equal(parseUnlockEnabled('1'), true)
  assert.equal(parseBackgroundedAt(null), null)
  assert.equal(parseBackgroundedAt('0'), null)
  assert.equal(parseBackgroundedAt(String(start)), start)
})

test('cancel and failure sign out locally, and success restores the vault session', async () => {
  assert.equal(unlockOutcome('success'), 'reveal')
  assert.equal(unlockOutcome('cancel'), 'sign-out')
  assert.equal(unlockOutcome('failure'), 'sign-out')
  assert.equal(biometricAttemptFromError({ code: '16' }), 'cancel')
  assert.equal(biometricAttemptFromError({ code: 11 }), 'cancel')
  assert.equal(biometricAttemptFromError({ code: 15 }), 'cancel')
  assert.equal(biometricAttemptFromError({ code: 17 }), 'cancel')
  assert.equal(biometricAttemptFromError({ code: '10' }), 'failure')
  assert.equal(biometricAttemptFromError(new Error('no code')), 'failure')

  const vault = memoryVault()
  const open = host(SESSION)
  assert.equal(await markUnlockEnabled(vault, null), false)
  assert.equal(vault.values.has(BIOMETRIC_ENABLED_KEY), false)
  assert.equal(await markUnlockEnabled(vault, SESSION), true)
  assert.equal(vault.values.get(BIOMETRIC_ENABLED_KEY), '1')
  assert.equal(parseSessionPayload(vault.values.get(BIOMETRIC_SESSION_KEY) ?? null)?.refresh_token, 'refresh-token')

  await prepareLock(vault, open.api, 50)
  assert.equal(open.state.signedOut, true)
  assert.equal(open.state.cleared, true)
  assert.equal(open.state.session, null)
  assert.equal(vault.values.get(BIOMETRIC_BACKGROUND_KEY), '50')
  assert.equal(parseSessionPayload(vault.values.get(BIOMETRIC_SESSION_KEY) ?? null)?.access_token, 'access-token')

  const again = host(null)
  await prepareLock(vault, again.api, 60)
  assert.equal(parseSessionPayload(vault.values.get(BIOMETRIC_SESSION_KEY) ?? null)?.access_token, 'access-token')

  const restored = host(null)
  assert.equal(await completeUnlock(vault, restored.api, 'success'), 'reveal')
  assert.deepEqual(restored.state.restored, SESSION)
  assert.equal(vault.values.has(BIOMETRIC_BACKGROUND_KEY), false)
  assert.equal(vault.values.has(BIOMETRIC_SESSION_KEY), true)

  assert.equal(await completeUnlock(vault, host(null).api, 'cancel'), 'sign-out')
  assert.equal(vault.values.has(BIOMETRIC_SESSION_KEY), false)
  assert.equal(vault.values.has(BIOMETRIC_ENABLED_KEY), true)

  await markUnlockDisabled(vault)
  assert.equal(vault.values.size, 0)
  assert.equal(sessionPayload({ access_token: 'has space', refresh_token: 'refresh-token' }), null)
  assert.equal(parseSessionPayload('not-json'), null)
})

test('a failed restore signs out locally and drops the vault copy', async () => {
  const vault = memoryVault()
  await markUnlockEnabled(vault, SESSION)
  const broken = host(null, true)
  assert.equal(await completeUnlock(vault, broken.api, 'success'), 'sign-out')
  assert.equal(broken.state.signedOut, true)
  assert.equal(broken.state.cleared, true)
  assert.equal(vault.values.has(BIOMETRIC_SESSION_KEY), false)
  assert.equal(vault.values.get(BIOMETRIC_ENABLED_KEY), '1')
})

test('the web privacy page hides the toggle and the native page can turn it on', async () => {
  assert.equal(showBiometricSetting(false, true), false)
  assert.equal(showBiometricSetting(true, false), false)
  assert.equal(showBiometricSetting(true, true), true)
  assert.equal(biometricShotAllowed(false), false)
  assert.equal(biometricShotAllowed(true), true)

  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
  const viewMod = await vite.ssrLoadModule('/src/components/privacy/PrivacyPanelView.tsx')
  const settingMod = await vite.ssrLoadModule('/src/components/privacy/BiometricUnlockSetting.tsx')
  const lockMod = await vite.ssrLoadModule('/src/shell/BiometricLockScreen.tsx')
  const hidden = panel(viewMod.PrivacyPanelView)
  const off = panel(viewMod.PrivacyPanelView, { biometricAvailable: true })
  const on = panel(viewMod.PrivacyPanelView, { biometricAvailable: true, biometricEnabled: true })
  assert.equal(hidden.includes('Unlock with Face ID / fingerprint'), false)
  assert.equal(hidden.includes('data-biometric-unlock'), false)
  assert.match(off, /data-biometric-unlock="off"/)
  assert.match(off, /Off\. The app opens without Face ID, Touch ID, or a fingerprint\./)
  assert.match(off, /Off unless you turn it on\. Biometric data stays on this device\./)
  assert.match(on, /data-biometric-unlock="on"/)
  assert.match(on, /after 5 minutes in the background/)
  for (const html of [hidden, off, on]) {
    assert.equal(html.includes('\u2014'), false)
    assert.equal(html.includes('\u2013'), false)
    assert.equal(/the desk/i.test(html), false)
  }

  const setting = renderToStaticMarkup(
    createElement(settingMod.BiometricUnlockSetting, { enabled: false, onEnabled: () => undefined }),
  )
  assert.match(setting, /aria-label="Unlock with Face ID \/ fingerprint"/)
  const lock = renderToStaticMarkup(
    createElement(lockMod.BiometricLockScreen, { busy: false, onUnlock: () => undefined, onSignIn: () => undefined }),
  )
  assert.match(lock, /data-screen="biometric-lock"/)
  assert.match(lock, /Unlock to continue/)
  assert.match(lock, /Unlock with Face ID \/ fingerprint/)
  assert.match(lock, /Sign in another way/)
  assert.match(lock, /Biometric data stays on this device/)
  assert.equal(lock.includes('\u2014'), false)
  } finally {
    await vite.close()
  }
})

test('Face ID usage, the Android biometric permission, and main-only PR checks are in place', () => {
  const plist = read('ios/App/App/Info.plist')
  assert.match(plist, new RegExp(`<string>${FACE_ID_USAGE}</string>`))
  assert.equal(FACE_ID_USAGE, 'Board Arabia uses Face ID to unlock the app.')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /<uses-permission android:name="android\.permission\.USE_BIOMETRIC" \/>/)
  const checks = read('.github/workflows/pr-checks.yml')
  assert.match(checks, /branches:\s*\[main\]/)
  assert.equal(checks.includes('cursor/app-1-capacitor-shell-88cd'), false)

  const workflow = read('.github/workflows/app-builds.yml')
  assert.match(workflow, /ios-biometric-settings\.png/)
  assert.match(workflow, /ios-biometric-lock\.png/)
  assert.match(workflow, /android-biometric-settings\.png/)
  assert.match(workflow, /android-biometric-lock\.png/)
  assert.match(workflow, /native\/biometric-shot\/settings/)
  assert.match(workflow, /native\/biometric-shot\/lock/)
  assert.equal(workflow.includes('secrets.'), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(workflow), false)

  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(app, /path="\/native\/biometric-shot\/settings"/)
  assert.match(app, /path="\/native\/biometric-shot\/lock"/)
  assert.match(app, /<BiometricGate \/>/)

  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@capgo/capacitor-native-biometric'], '8.6.7')
  assert.match(read('android/capacitor.settings.gradle'), /capgo-capacitor-native-biometric/)
  assert.match(read('android/app/capacitor.build.gradle'), /capgo-capacitor-native-biometric/)
  assert.match(read('ios/App/CapApp-SPM/Package.swift'), /CapgoCapacitorNativeBiometric/)

  const gate = read('src/shell/BiometricGateNative.tsx')
  assert.match(gate, /signOut\(\{ scope: 'local' \}\)/)
  assert.equal(gate.includes("scope: 'global'"), false)
  assert.match(read('src/shell/nativeBiometric.ts'), /NativeBiometric\.setData/)
  assert.match(read('src/shell/nativeBiometric.ts'), /useFallback: false/)

  const files = [
    'src/shell/biometricLock.ts',
    'src/shell/nativeBiometric.ts',
    'src/shell/BiometricGate.tsx',
    'src/shell/BiometricGateNative.tsx',
    'src/shell/BiometricLockScreen.tsx',
    'src/shell/BiometricShot.tsx',
    'src/components/privacy/BiometricUnlockSetting.tsx',
    'src/pages/dashboard/PrivacyPanelPage.tsx',
  ]
  for (const file of files) {
    const text = read(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/the desk/i.test(text), false, file)
    assert.equal(/nammco/i.test(text), false, file)
    assert.equal(/\bsponsor\b/i.test(text), false, file)
    assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), false, file)
    assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(text), false, file)
  }
})
