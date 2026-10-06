import { promptStorageKey, promptWasDismissed, rememberPromptDismissed } from './mfaFlow'
import { supabase } from './supabase'

export type Assurance = {
  userId: string | null
  currentLevel: string | null
  verifiedFactor: boolean
  promptDismissed: boolean
}

export async function readAssurance(): Promise<Assurance> {
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) {
    return { userId: null, currentLevel: null, verifiedFactor: false, promptDismissed: false }
  }
  const [level, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  const verified = (factors.data?.totp ?? []).some((factor) => factor.status === 'verified')
  const metadata = session.user.user_metadata?.ba_mfa_prompt_dismissed === true
  let stored: string | null = null
  try {
    stored = localStorage.getItem(promptStorageKey())
  } catch {
    stored = null
  }
  return {
    userId: session.user.id,
    currentLevel: level.data?.currentLevel ?? null,
    verifiedFactor: verified,
    promptDismissed: promptWasDismissed(session.user.id, stored, metadata),
  }
}

export async function dismissMfaPrompt(userId: string): Promise<void> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(promptStorageKey())
    localStorage.setItem(promptStorageKey(), rememberPromptDismissed(userId, raw))
  } catch {
    // The account flag below still remembers the choice.
  }
  await supabase.auth.updateUser({ data: { ba_mfa_prompt_dismissed: true } })
}

export async function enrollTotp(): Promise<
  { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Authenticator app',
  })
  if (error || !data?.id || !data.totp?.qr_code || !data.totp.secret) {
    return { ok: false, error: error?.message || 'Could not start two-step sign-in.' }
  }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyTotp(factorId: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenged = await supabase.auth.mfa.challenge({ factorId })
  if (challenged.error || !challenged.data?.id) {
    return { ok: false, error: challenged.error?.message || 'Could not start the code check.' }
  }
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenged.data.id,
    code: code.trim(),
  })
  if (verified.error) return { ok: false, error: verified.error.message || 'That code was not accepted.' }
  return { ok: true }
}

export async function listTotpFactors(): Promise<Array<{ id: string; status: string }>> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) return []
  return (data.totp ?? []).map((factor) => ({ id: factor.id, status: factor.status }))
}

export async function removeTotpFactor(factorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) return { ok: false, error: error.message || 'Could not remove that authenticator app.' }
  return { ok: true }
}
