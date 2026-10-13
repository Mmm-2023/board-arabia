import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'
import { clearStoredAuthTokens } from '../lib/endSession'
import { supabase } from '../lib/supabase'
import { BiometricLockScreen } from './BiometricLockScreen'
import {
  BIOMETRIC_BACKGROUND_KEY,
  BIOMETRIC_PREF_EVENT,
  BIOMETRIC_SESSION_KEY,
  completeUnlock,
  parseSessionPayload,
  prepareLock,
  readUnlockState,
  sessionPayload,
  shouldShowLock,
  type SessionHost,
  type VaultStore,
} from './biometricLock'
import { deviceSupportsBiometrics, nativeVault, promptForBiometrics } from './nativeBiometric'

function sessionHost(): SessionHost {
  return {
    async getSession() {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session?.access_token || !session.refresh_token) return null
      return { access_token: session.access_token, refresh_token: session.refresh_token }
    },
    async setSession(session) {
      const { error } = await supabase.auth.setSession(session)
      return { error: Boolean(error) }
    },
    async signOutLocal() {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // The storage wipe still removes a token the client failed to drop.
      }
    },
    clearStoredTokens() {
      clearStoredAuthTokens([window.localStorage, window.sessionStorage])
    },
  }
}

export function BiometricGateNative() {
  const navigate = useNavigate()
  const vaultRef = useRef<VaultStore | null>(null)
  const enabledRef = useRef(false)
  const sealingRef = useRef(false)
  const promptedRef = useRef(false)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)

  function vault(): VaultStore {
    vaultRef.current ??= nativeVault()
    return vaultRef.current
  }

  function hideLock() {
    document.documentElement.classList.remove('ba-biometric-locked')
    promptedRef.current = false
    setLocked(false)
    setBusy(false)
  }

  async function seal(store: VaultStore) {
    sealingRef.current = true
    try {
      await prepareLock(store, sessionHost(), Date.now())
    } finally {
      sealingRef.current = false
    }
  }

  async function finish(attempt: 'success' | 'cancel' | 'failure') {
    setBusy(true)
    const outcome = await completeUnlock(vault(), sessionHost(), attempt)
    hideLock()
    if (outcome === 'sign-out') navigate('/login')
  }

  useEffect(() => {
    const store = vault()
    let cancelled = false

    let generation = 0

    async function refreshEnabled() {
      const gen = ++generation
      const available = await deviceSupportsBiometrics()
      const state = await readUnlockState(store)
      if (cancelled || gen !== generation) return null
      const enabled = available && state.enabled
      enabledRef.current = enabled
      return { enabled, backgroundedAt: state.backgroundedAt }
    }

    async function hasSession() {
      const local = await sessionHost().getSession()
      if (local) return true
      return parseSessionPayload(await store.get(BIOMETRIC_SESSION_KEY)) != null
    }

    async function boot() {
      const state = await refreshEnabled()
      if (!state?.enabled) return
      const now = Date.now()
      const show = shouldShowLock({
        enabled: true,
        backgroundedAt: state.backgroundedAt,
        now,
        hasSession: await hasSession(),
      })
      if (show) {
        document.documentElement.classList.add('ba-biometric-locked')
        setLocked(true)
        await seal(store)
        return
      }
      if (state.backgroundedAt != null) await store.remove(BIOMETRIC_BACKGROUND_KEY)
    }

    void boot()

    const auth = supabase.auth.onAuthStateChange((event, session) => {
      if (!enabledRef.current) return
      if (event === 'SIGNED_OUT') {
        if (!sealingRef.current) {
          void store.remove(BIOMETRIC_SESSION_KEY)
          void store.remove(BIOMETRIC_BACKGROUND_KEY)
        }
        return
      }
      if (!session) return
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') return
      const payload = sessionPayload(session)
      if (payload) void store.set(BIOMETRIC_SESSION_KEY, payload)
    })

    const appState = App.addListener('appStateChange', ({ isActive }) => {
      if (!enabledRef.current) return
      if (!isActive) {
        void store.set(BIOMETRIC_BACKGROUND_KEY, String(Date.now()))
        void sessionHost()
          .getSession()
          .then((session) => {
            const payload = sessionPayload(session)
            if (payload) void store.set(BIOMETRIC_SESSION_KEY, payload)
          })
        return
      }
      void (async () => {
        const state = await readUnlockState(store)
        if (!state.enabled || cancelled) return
        const show = shouldShowLock({
          enabled: true,
          backgroundedAt: state.backgroundedAt,
          now: Date.now(),
          hasSession: await hasSession(),
        })
        if (!show) {
          if (state.backgroundedAt != null) await store.remove(BIOMETRIC_BACKGROUND_KEY)
          return
        }
        document.documentElement.classList.add('ba-biometric-locked')
        setLocked(true)
        await seal(store)
      })()
    })

    function onPref() {
      void refreshEnabled()
    }
    window.addEventListener(BIOMETRIC_PREF_EVENT, onPref)

    return () => {
      cancelled = true
      document.documentElement.classList.remove('ba-biometric-locked')
      auth.data.subscription.unsubscribe()
      window.removeEventListener(BIOMETRIC_PREF_EVENT, onPref)
      void appState.then((handle) => handle.remove())
    }
  }, [])

  const finishRef = useRef(finish)

  useEffect(() => {
    finishRef.current = finish
  })

  useEffect(() => {
    if (!locked || promptedRef.current) return
    promptedRef.current = true
    setBusy(true)
    void promptForBiometrics().then((attempt) => finishRef.current(attempt))
  }, [locked])

  if (!locked) return null

  return (
    <BiometricLockScreen
      busy={busy}
      onUnlock={() => {
        if (busy) return
        void promptForBiometrics().then((attempt) => finish(attempt))
      }}
      onSignIn={() => {
        if (busy) return
        void finish('cancel')
      }}
    />
  )
}
