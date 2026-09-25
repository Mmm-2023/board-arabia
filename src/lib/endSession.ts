import type { SupabaseClient } from '@supabase/supabase-js'

/** The real client exposes sign-out on `auth`, not on the client root. */
type SignOutClient = {
  auth: Pick<SupabaseClient['auth'], 'signOut'>
}

type TokenStore = {
  length: number
  key: (index: number) => string | null
  removeItem: (key: string) => void
}

/** Supabase persists the session under `sb-<ref>-auth-token` (and chunked suffixes). */
export function isStoredAuthTokenKey(key: string): boolean {
  return key.startsWith('sb-') && key.includes('-auth-token')
}

export function clearStoredAuthTokens(stores: Array<TokenStore | null | undefined>): void {
  for (const store of stores) {
    if (!store) continue
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key && isStoredAuthTokenKey(key)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  }
}

export function storedAuthTokenKeys(stores: Array<TokenStore | null | undefined>): string[] {
  const keys: string[] = []
  for (const store of stores) {
    if (!store) continue
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key && isStoredAuthTokenKey(key)) keys.push(key)
    }
  }
  return keys
}

function browserTokenStores(): TokenStore[] {
  if (typeof window === 'undefined') return []
  return [window.localStorage, window.sessionStorage]
}

/**
 * Revoke the server session when possible, always drop the local session,
 * then delete leftover Supabase auth token keys.
 */
export async function endAuthSession(
  client: SignOutClient,
  stores: Array<TokenStore | null | undefined> = browserTokenStores(),
): Promise<void> {
  try {
    const globalResult = await client.auth.signOut({ scope: 'global' })
    if (globalResult.error) await client.auth.signOut({ scope: 'local' })
  } catch {
    try {
      await client.auth.signOut({ scope: 'local' })
    } catch {
      // Storage wipe below still removes a token the client failed to drop.
    }
  }
  clearStoredAuthTokens(stores)
}
