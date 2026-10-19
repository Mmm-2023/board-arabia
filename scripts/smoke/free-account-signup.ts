/**
 * MJ-3a signup smoke.
 * Default: in-process fixture, no network and no send.
 * Live: node --experimental-strip-types scripts/smoke/free-account-signup.ts --live
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in the environment. Uses example.com only.
 */
import { registerCandidate } from '../../supabase/functions/_shared/candidate_flow.ts'

const now = new Date('2026-10-19T15:00:00.000Z')

export async function smokeSignup() {
  const base = {
    now: () => now,
    pepper: 'test-pepper',
    turnstileSecret: '',
    site: 'https://boardarabia.com',
    verifyTurnstile: async () => true,
    findCandidate: async () => null,
    findAuthUserId: async () => null,
    createAuthUser: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
    insertCandidate: async () => ({}),
    issueCode: async () => 'ok' as const,
    voidLatestCode: async () => {},
    issueSignInLink: async () => ({ url: 'https://boardarabia.com/login' }),
    recordEvent: async () => {},
    claimInvite: async () => false,
    domainStatus: async () => 'ok' as const,
    mailboxOk: async () => true,
    consumeRegisterLimit: async () => 'ok' as const,
  }
  const form = {
    full_name: 'Ada Example',
    email: 'ada@example.com',
    role: 'chairperson',
    region: 'ksa_gcc',
    consent: true,
    form_started_at: now.getTime() - 10_000,
  }
  const fresh = await registerCandidate(form, '203.0.113.10', {
    ...base,
    emailIsMember: async () => false,
    sendMail: async () => ({ ok: true, dryRun: true }),
  })
  const existing = await registerCandidate(form, '203.0.113.10', {
    ...base,
    emailIsMember: async () => true,
    sendMail: async () => ({ ok: true, dryRun: true }),
  })
  return {
    same: fresh.status === existing.status && JSON.stringify(fresh.body) === JSON.stringify(existing.body),
    status: fresh.status,
    body: fresh.body,
  }
}

async function liveSignup() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY')
  }
  const response = await fetch(`${url}/functions/v1/register-candidate`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Ada Example',
      email: 'ada@example.com',
      role: 'chairperson',
      region: 'ksa_gcc',
      consent: true,
      company_fax: '',
      form_started_at: Date.now() - 10_000,
    }),
  })
  const body = (await response.json()) as Record<string, unknown>
  const leaked = JSON.stringify(body).includes('account_exists') || 'created' in body
  return { status: response.status, sameShape: body.ok === true && body.error_code === '' && !leaked }
}

const isMain = process.argv[1] && process.argv[1].endsWith('free-account-signup.ts')
if (isMain) {
  const run = process.argv.includes('--live') ? liveSignup : smokeSignup
  run()
    .then((result) => {
      console.log(JSON.stringify(result))
      if ('same' in result && !result.same) process.exit(1)
      if ('sameShape' in result && !result.sameShape) process.exit(1)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'signup failed')
      process.exit(1)
    })
}
