import assert from 'node:assert/strict'
import test from 'node:test'
import { endAuthSession, isStoredAuthTokenKey, storedAuthTokenKeys } from '../src/lib/endSession.ts'

function memoryStore(initial: Record<string, string>) {
  const data = { ...initial }
  return {
    get length() {
      return Object.keys(data).length
    },
    key(index: number) {
      return Object.keys(data)[index] ?? null
    },
    removeItem(key: string) {
      delete data[key]
    },
    snapshot() {
      return { ...data }
    },
  }
}

test('auth token keys are the supabase session entries only', () => {
  assert.equal(isStoredAuthTokenKey('sb-project-auth-token'), true)
  assert.equal(isStoredAuthTokenKey('sb-project-auth-token.0'), true)
  assert.equal(isStoredAuthTokenKey('ba-password-recovery'), false)
  assert.equal(isStoredAuthTokenKey('other'), false)
})

test('endAuthSession leaves no usable access token when global sign-out fails', async () => {
  const local = memoryStore({
    'sb-project-auth-token': '{"access_token":"still-here","refresh_token":"r"}',
    'sb-project-auth-token.0': 'chunk',
    'ba-password-recovery': '1',
  })
  const session = memoryStore({
    'sb-project-auth-token': '{"access_token":"tab-copy"}',
  })
  let localCalls = 0
  await endAuthSession(
    {
      auth: {
        async signOut(options) {
          if (options?.scope === 'global') return { error: { message: 'network' } }
          localCalls += 1
          local.removeItem('sb-project-auth-token')
          return { error: null }
        },
      },
    },
    [local, session],
  )
  assert.equal(localCalls, 1)
  assert.deepEqual(storedAuthTokenKeys([local, session]), [])
  assert.equal(local.snapshot()['ba-password-recovery'], '1')
  assert.equal(session.snapshot()['sb-project-auth-token'], undefined)
})

test('endAuthSession still wipes tokens when signOut throws', async () => {
  const local = memoryStore({
    'sb-ref-auth-token': '{"access_token":"jwt"}',
  })
  await endAuthSession(
    {
      auth: {
        async signOut() {
          throw new Error('lock')
        },
      },
    },
    [local],
  )
  assert.deepEqual(storedAuthTokenKeys([local]), [])
})
