/** Opt-in app lock. Biometric data never leaves the device. */

export const BIOMETRIC_LOCK_TIMEOUT_MS = 5 * 60 * 1000
export const BIOMETRIC_SESSION_KEY = 'ba-auth-session'
export const BIOMETRIC_ENABLED_KEY = 'ba-biometric-unlock'
export const BIOMETRIC_BACKGROUND_KEY = 'ba-biometric-background-at'
export const BIOMETRIC_PREF_EVENT = 'ba-biometric-pref'
export const FACE_ID_USAGE = 'Board Arabia uses Face ID to unlock the app.'

const MAX_TOKEN_LENGTH = 4096
const MAX_PAYLOAD_LENGTH = 12000

export type UnlockAttempt = 'success' | 'cancel' | 'failure'
export type UnlockOutcome = 'reveal' | 'sign-out'

export type LocalSession = {
  access_token: string
  refresh_token: string
}

export type VaultStore = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export type SessionHost = {
  getSession(): Promise<LocalSession | null>
  setSession(session: LocalSession): Promise<{ error: boolean }>
  signOutLocal(): Promise<void>
  clearStoredTokens(): void
}

export function showBiometricSetting(native: boolean, biometryAvailable: boolean): boolean {
  return native === true && biometryAvailable === true
}

/** The capture routes exist only inside the native shell. */
export function biometricShotAllowed(native: boolean): boolean {
  return native === true
}

/**
 * Shot screens load as a document so the WebView paints them.
 * Client-side routing left the home page up after a deep link.
 */
const NATIVE_SHOT_PATHS = new Set([
  '/native/biometric-shot/settings',
  '/native/biometric-shot/lock',
  '/native/push-shot/settings',
])

export function nativeShotHref(path: string, search: string, hash: string): string | null {
  if (!NATIVE_SHOT_PATHS.has(path)) return null
  return `${path}${search}${hash}`
}

/**
 * Lock after the app has been in the background for the timeout.
 * A missing background time means the app has not been left, so it stays open.
 */
export function shouldShowLock(input: {
  enabled: boolean
  backgroundedAt: number | null
  now: number
  hasSession: boolean
  timeoutMs?: number
}): boolean {
  return input.hasSession === true && shouldRequireBiometricUnlock(input)
}

export function shouldRequireBiometricUnlock(input: {
  enabled: boolean
  backgroundedAt: number | null
  now: number
  timeoutMs?: number
}): boolean {
  if (input.enabled !== true) return false
  if (input.backgroundedAt == null || !Number.isInteger(input.backgroundedAt)) return false
  if (!Number.isInteger(input.now)) return false
  const timeout = input.timeoutMs ?? BIOMETRIC_LOCK_TIMEOUT_MS
  if (!Number.isInteger(timeout) || timeout < 0) return false
  return input.now - input.backgroundedAt >= timeout
}

export function parseUnlockEnabled(raw: string | null): boolean {
  return raw === '1'
}

export function parseBackgroundedAt(raw: string | null): number | null {
  if (raw == null || !/^[1-9][0-9]{0,15}$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return null
  return value
}

export function unlockOutcome(attempt: UnlockAttempt): UnlockOutcome {
  return attempt === 'success' ? 'reveal' : 'sign-out'
}

/** Cancel and system dismiss follow the same path as a failed match. */
export function biometricAttemptFromError(error: unknown): Exclude<UnlockAttempt, 'success'> {
  const code = readErrorCode(error)
  if (code === 11 || code === 15 || code === 16 || code === 17) return 'cancel'
  return 'failure'
}

export function sessionPayload(session: Partial<LocalSession> | null): string | null {
  if (!session) return null
  if (!isToken(session.access_token) || !isToken(session.refresh_token)) return null
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
}

export function parseSessionPayload(raw: string | null): LocalSession | null {
  if (raw == null || raw.length === 0 || raw.length > MAX_PAYLOAD_LENGTH) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const row = parsed as { access_token?: unknown; refresh_token?: unknown }
  if (!isToken(row.access_token) || !isToken(row.refresh_token)) return null
  return { access_token: row.access_token, refresh_token: row.refresh_token }
}

export async function readUnlockState(vault: VaultStore): Promise<{
  enabled: boolean
  backgroundedAt: number | null
}> {
  const [enabledRaw, backgroundRaw] = await Promise.all([
    vault.get(BIOMETRIC_ENABLED_KEY),
    vault.get(BIOMETRIC_BACKGROUND_KEY),
  ])
  return {
    enabled: parseUnlockEnabled(enabledRaw),
    backgroundedAt: parseBackgroundedAt(backgroundRaw),
  }
}

/** Copy the current session into the vault and remember that unlock is on. */
export async function markUnlockEnabled(vault: VaultStore, session: Partial<LocalSession> | null): Promise<boolean> {
  const payload = sessionPayload(session)
  if (!payload) return false
  await vault.set(BIOMETRIC_SESSION_KEY, payload)
  await vault.set(BIOMETRIC_ENABLED_KEY, '1')
  await vault.remove(BIOMETRIC_BACKGROUND_KEY)
  return true
}

export async function markUnlockDisabled(vault: VaultStore): Promise<void> {
  await vault.remove(BIOMETRIC_SESSION_KEY)
  await vault.remove(BIOMETRIC_ENABLED_KEY)
  await vault.remove(BIOMETRIC_BACKGROUND_KEY)
}

/**
 * Hide the local session before the lock screen.
 * The vault copy is what biometric success restores. A second call does not wipe that copy.
 */
export async function prepareLock(vault: VaultStore, host: SessionHost, now: number): Promise<void> {
  const payload = sessionPayload(await host.getSession())
  if (payload) await vault.set(BIOMETRIC_SESSION_KEY, payload)
  if (Number.isInteger(now) && now > 0) await vault.set(BIOMETRIC_BACKGROUND_KEY, String(now))
  await host.signOutLocal()
  host.clearStoredTokens()
}

/**
 * Success restores the vault session and shows the app.
 * Cancel, failure, or a missing session signs out locally and drops the vault copy.
 */
export async function completeUnlock(
  vault: VaultStore,
  host: SessionHost,
  attempt: UnlockAttempt,
): Promise<UnlockOutcome> {
  if (unlockOutcome(attempt) !== 'reveal') {
    await abandonLockedSession(vault, host)
    return 'sign-out'
  }
  const session = parseSessionPayload(await vault.get(BIOMETRIC_SESSION_KEY))
  if (!session) {
    await abandonLockedSession(vault, host)
    return 'sign-out'
  }
  const restored = await host.setSession(session)
  if (restored.error) {
    await abandonLockedSession(vault, host)
    return 'sign-out'
  }
  await vault.remove(BIOMETRIC_BACKGROUND_KEY)
  return 'reveal'
}

async function abandonLockedSession(vault: VaultStore, host: SessionHost): Promise<void> {
  await vault.remove(BIOMETRIC_SESSION_KEY)
  await vault.remove(BIOMETRIC_BACKGROUND_KEY)
  await host.signOutLocal()
  host.clearStoredTokens()
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && !/\s/.test(value)
}

function readErrorCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  if (typeof code === 'number' && Number.isInteger(code)) return code
  if (typeof code === 'string' && /^[0-9]{1,3}$/.test(code)) return Number(code)
  return null
}
