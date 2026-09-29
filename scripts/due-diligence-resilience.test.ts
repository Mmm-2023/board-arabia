import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DD_COPY } from '../src/lib/dueDiligenceCopy.ts'
import { DD_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../src/lib/fetchTimeout.ts'
import { postDueDiligenceStart, postDueDiligenceStatus } from '../src/lib/dueDiligenceRequests.ts'
import {
  AUTH_TIMEOUT_MS,
  resolveDueDiligenceUser,
  verifyLocalUserJwt,
} from '../supabase/functions/_shared/due_diligence_user.ts'
import { MEMBER_MESSAGES } from '../supabase/functions/_shared/due_diligence.ts'
import {
  handleDueDiligenceStart,
  ownedDeckPath,
  type DueDiligenceAdmin,
  type StartAuth,
} from '../supabase/functions/due-diligence-start/handle.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const userId = '11111111-1111-4111-8111-111111111111'
const deckId = '22222222-2222-4222-8222-222222222222'
const storagePath = `${userId}/${deckId}/source.pdf`
const jobId = '33333333-3333-4333-8333-333333333333'
const secret = 'test-jwt-secret'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js')) out.push(full)
  }
  return out
}

function importers(specifier: string): string[] {
  return walk(path.join(root, 'supabase/functions'))
    .filter((file) => readFileSync(file, 'utf8').includes(specifier))
    .map((file) => path.relative(root, file))
    .sort()
}

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function signJwt(payload: Record<string, unknown>, keySecret: string): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const data = new TextEncoder().encode(`${header}.${body}`)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
  return `${header}.${body}.${b64url(signature)}`
}

function claims(extra: Record<string, unknown> = {}) {
  return {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: 'authenticated',
    ...extra,
  }
}

function hangUntilAbort(calls: { n: number }): typeof fetch {
  return ((_url: string, init?: RequestInit) => {
    calls.n += 1
    return new Promise((_resolve, reject) => {
      const fail = () => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      }
      const signal = init?.signal
      if (!signal) {
        fail()
        return
      }
      if (signal.aborted) fail()
      else signal.addEventListener('abort', fail, { once: true })
    })
  }) as typeof fetch
}

type Behavior = {
  member?: { data: { status: string } | null; error: { message: string } | null }
  memberThrows?: boolean
  downloadError?: boolean
  rpc?: { error: { message: string } | null }
  deckInsert?: { data: { id: string } | null; error: { message: string } | null }
  jobInsert?: { data: { id: string } | null; error: { message: string } | null }
}

function createAdmin(behavior: Behavior = {}) {
  const removed: string[][] = []
  const deleted: string[] = []
  const scheduled: string[] = []
  const admin: DueDiligenceAdmin = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (behavior.memberThrows) throw new Error('member lookup failed')
                  if (table === 'members') return behavior.member ?? { data: { status: 'active' }, error: null }
                  return { data: null, error: { message: 'unexpected select' } }
                },
              }
            },
          }
        },
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                maybeSingle: async () => {
                  if (table === 'due_diligence_decks') {
                    return behavior.deckInsert ?? { data: { id: String(row.id) }, error: null }
                  }
                  if (table === 'due_diligence_jobs') {
                    return behavior.jobInsert ?? { data: { id: jobId }, error: null }
                  }
                  return { data: null, error: { message: 'unexpected insert' } }
                },
              }
            },
          }
        },
        delete() {
          return {
            eq: async (_column: string, value: string) => {
              deleted.push(value)
            },
          }
        },
      }
    },
    rpc: async () => behavior.rpc ?? { error: null },
    storage: {
      from() {
        return {
          download: async () => {
            if (behavior.downloadError) return { data: null, error: { message: 'missing' } }
            const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
            return {
              data: {
                arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
              },
              error: null,
            }
          },
          remove: async (paths: string[]) => {
            removed.push(paths)
          },
        }
      },
    },
  }
  return { admin, removed, deleted, scheduled }
}

function startRequest(body: unknown) {
  return new Request('https://example.com/functions/v1/due-diligence-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deps(auth: StartAuth, behavior: Behavior = {}) {
  const fake = createAdmin(behavior)
  return {
    fake,
    input: {
      resolveUser: async () => auth,
      createAdmin: () => fake.admin,
      assertSlides: () => {},
      scheduleJob: (_admin: DueDiligenceAdmin, id: string) => {
        fake.scheduled.push(id)
      },
    },
  }
}

test('local JWT checks do not call auth, and a bad signature stays unauthorized', async () => {
  const calls = { n: 0 }
  const token = await signJwt(claims(), secret)
  const ok = await resolveDueDiligenceUser({
    authorization: `Bearer ${token}`,
    nowMs: Date.now(),
    jwtSecret: secret,
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    fetchImpl: hangUntilAbort(calls),
    timeoutMs: 5_000,
  })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.userId, userId)
  assert.equal(calls.n, 0)

  const unsigned = await resolveDueDiligenceUser({
    authorization: `Bearer ${token}`,
    nowMs: Date.now(),
    jwtSecret: '',
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    fetchImpl: hangUntilAbort(calls),
  })
  assert.equal(unsigned.ok, true)
  assert.equal(calls.n, 0)

  const forged = await resolveDueDiligenceUser({
    authorization: `Bearer ${token}`,
    nowMs: Date.now(),
    jwtSecret: 'other-secret',
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    fetchImpl: hangUntilAbort(calls),
  })
  assert.equal(forged.ok, false)
  if (!forged.ok) {
    assert.equal(forged.status, 401)
    assert.equal(forged.code, 'unauthorized')
    assert.equal(forged.userId, null)
  }
  assert.equal(calls.n, 0)

  const expired = await verifyLocalUserJwt(
    await signJwt(claims({ exp: Math.floor(Date.now() / 1000) - 120 }), secret),
    { nowMs: Date.now(), jwtSecret: secret },
  )
  assert.equal(expired.ok, false)
  if (!expired.ok) {
    assert.equal(expired.reason, 'unauthorized')
    assert.equal(expired.userId, userId)
  }

  const anon = await resolveDueDiligenceUser({
    authorization: `Bearer ${await signJwt(claims({ role: 'anon' }), secret)}`,
    nowMs: Date.now(),
    jwtSecret: secret,
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    fetchImpl: hangUntilAbort(calls),
  })
  assert.equal(anon.ok, false)
  if (!anon.ok) assert.equal(anon.code, 'unauthorized')
  assert.equal(calls.n, 0)
})

test('auth lookup times out, retries once, then returns auth_unavailable', async () => {
  assert.equal(AUTH_TIMEOUT_MS, 5_000)
  const calls = { n: 0 }
  const started = Date.now()
  const result = await resolveDueDiligenceUser({
    authorization: 'Bearer not-a-jwt',
    nowMs: Date.now(),
    jwtSecret: secret,
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    fetchImpl: hangUntilAbort(calls),
    timeoutMs: 40,
  })
  const elapsed = Date.now() - started
  assert.equal(calls.n, 2)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 503)
    assert.equal(result.code, 'auth_unavailable')
    assert.equal(result.error, MEMBER_MESSAGES.authUnavailable)
    assert.equal(result.userId, null)
  }
  assert.ok(elapsed < 2_000, `auth lookup hung for ${elapsed}ms`)
  assert.ok(elapsed >= 40)
})

test('auth lookup retries once after HTTP 525 and does not retry a 401', async () => {
  let calls = 0
  const recovered = await resolveDueDiligenceUser({
    authorization: 'Bearer not-a-jwt',
    nowMs: Date.now(),
    jwtSecret: '',
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    timeoutMs: 1_000,
    fetchImpl: (async () => {
      calls += 1
      if (calls === 1) return new Response('timeout', { status: 525 })
      return new Response(JSON.stringify({ id: userId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch,
  })
  assert.equal(calls, 2)
  assert.equal(recovered.ok, true)
  if (recovered.ok) assert.equal(recovered.userId, userId)

  calls = 0
  const rejected = await resolveDueDiligenceUser({
    authorization: 'Bearer not-a-jwt',
    nowMs: Date.now(),
    jwtSecret: '',
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test',
    timeoutMs: 1_000,
    fetchImpl: (async () => {
      calls += 1
      return new Response('no', { status: 401 })
    }) as typeof fetch,
  })
  assert.equal(calls, 1)
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.code, 'unauthorized')
})

test('a failed start deletes only the caller deck', async () => {
  assert.equal(ownedDeckPath({ deck_id: deckId, storage_path: storagePath }, userId), storagePath)
  assert.equal(
    ownedDeckPath(
      { deck_id: deckId, storage_path: `99999999-9999-4999-8999-999999999999/${deckId}/source.pdf` },
      userId,
    ),
    null,
  )

  const authFail = deps({
    ok: false,
    status: 401,
    error: MEMBER_MESSAGES.unauthorized,
    code: 'unauthorized',
    userId,
  })
  const unauthorized = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath }),
    authFail.input,
  )
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(await unauthorized.json(), { error: MEMBER_MESSAGES.unauthorized, code: 'unauthorized' })
  assert.deepEqual(authFail.fake.removed, [[storagePath]])

  const other = deps({
    ok: false,
    status: 401,
    error: MEMBER_MESSAGES.unauthorized,
    code: 'unauthorized',
    userId,
  })
  await handleDueDiligenceStart(
    startRequest({
      deck_id: deckId,
      storage_path: `99999999-9999-4999-8999-999999999999/${deckId}/source.pdf`,
    }),
    other.input,
  )
  assert.deepEqual(other.fake.removed, [])

  const unknown = deps({
    ok: false,
    status: 503,
    error: MEMBER_MESSAGES.authUnavailable,
    code: 'auth_unavailable',
    userId: null,
  })
  const unavailable = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath }),
    unknown.input,
  )
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), {
    error: MEMBER_MESSAGES.authUnavailable,
    code: 'auth_unavailable',
  })
  assert.deepEqual(unknown.fake.removed, [])

  const member = deps({ ok: true, userId }, { member: { data: { status: 'suspended' }, error: null } })
  const forbidden = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath, file_name: 'sample-deck.pdf' }),
    member.input,
  )
  assert.equal(forbidden.status, 403)
  assert.equal((await forbidden.json()).code, 'members_only')
  assert.deepEqual(member.fake.removed, [[storagePath]])

  const missing = deps({ ok: true, userId }, { downloadError: true })
  const upload = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath }),
    missing.input,
  )
  assert.equal(upload.status, 400)
  assert.deepEqual(missing.fake.removed, [[storagePath]])

  const limited = deps({ ok: true, userId }, { rpc: { error: { message: 'rate_limited' } } })
  const rate = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath }),
    limited.input,
  )
  assert.equal(rate.status, 429)
  assert.equal((await rate.json()).code, 'rate_limited')
  assert.deepEqual(limited.fake.removed, [[storagePath]])

  const broken = deps({ ok: true, userId }, { memberThrows: true })
  const failed = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath }),
    broken.input,
  )
  assert.equal(failed.status, 500)
  assert.equal((await failed.json()).code, 'start_failed')
  assert.deepEqual(broken.fake.removed, [[storagePath]])

  const happy = deps({ ok: true, userId })
  const started = await handleDueDiligenceStart(
    startRequest({ deck_id: deckId, storage_path: storagePath, file_name: 'sample-deck.pdf' }),
    happy.input,
  )
  assert.equal(started.status, 200)
  assert.deepEqual(await started.json(), { ok: true, job_id: jobId, deck_id: deckId })
  assert.deepEqual(happy.fake.removed, [])
  assert.deepEqual(happy.fake.scheduled, [jobId])
})

test('start and status fetches abort inside the front-end timeout', async () => {
  assert.ok(DD_FETCH_TIMEOUT_MS >= 20_000)
  assert.ok(DD_FETCH_TIMEOUT_MS <= 30_000)
  const calls = { n: 0 }
  const headers = { Authorization: 'Bearer test', apikey: 'test-anon-key' }
  const startedAt = Date.now()
  const started = await postDueDiligenceStart(
    {
      supabaseUrl: 'https://example.supabase.co',
      deckId,
      storagePath,
      fileName: 'sample-deck.pdf',
      companyUrl: null,
    },
    { headers, fetchImpl: hangUntilAbort(calls), timeoutMs: 40 },
  )
  assert.equal(started.ok, false)
  if (!started.ok) assert.equal(started.error, DD_COPY.errorTimeout)
  assert.equal(calls.n, 1)
  assert.ok(Date.now() - startedAt < 1_000)

  const status = await postDueDiligenceStatus(
    { supabaseUrl: 'https://example.supabase.co', jobId },
    { headers, fetchImpl: hangUntilAbort(calls), timeoutMs: 40 },
  )
  assert.equal(status.ok, false)
  if (!status.ok) assert.equal(status.error, DD_COPY.errorTimeout)
  assert.equal(calls.n, 2)

  let aborted = false
  await assert.rejects(
    fetchWithTimeout(
      ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              aborted = true
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true },
          )
        })) as typeof fetch,
      'https://example.supabase.co/functions/v1/due-diligence-start',
      { method: 'POST' },
      30,
    ),
  )
  assert.equal(aborted, true)
})

test('due diligence start is the only caller of the local auth helper', () => {
  assert.deepEqual(importers("from '../_shared/require_user.ts'"), [
    'supabase/functions/admit-li-share-card/index.ts',
    'supabase/functions/contact-desk/index.ts',
    'supabase/functions/due-diligence-status/index.ts',
    'supabase/functions/linkedin-oauth/index.ts',
    'supabase/functions/majlis-ics/index.ts',
    'supabase/functions/majlis-rsvp/index.ts',
  ])
  assert.deepEqual(importers("from '../_shared/due_diligence_user.ts'"), [
    'supabase/functions/due-diligence-start/index.ts',
  ])
  const requireUser = readFileSync(path.join(root, 'supabase/functions/_shared/require_user.ts'), 'utf8')
  assert.match(requireUser, /auth\.getUser\(token\)/)
  const start = readFileSync(path.join(root, 'supabase/functions/due-diligence-start/index.ts'), 'utf8')
  assert.equal(start.includes('require_user'), false)
  assert.match(start, /resolveDueDiligenceUser/)
  assert.match(start, /handleDueDiligenceStart/)
})
