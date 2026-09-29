import { useEffect, useState } from 'react'
import { AVATAR_BUCKET } from '../../lib/avatar'
import { supabase } from '../../lib/supabase'

type Loaded = {
  path: string
  key: number
  url: string | null
  failed: boolean
}

const signedCache = new Map<string, string>()

function cacheKey(path: string, refreshKey: number) {
  return `${refreshKey}:${path}`
}

export function useSignedAvatar(path: string | null, refreshKey = 0, enabled = true) {
  const cachedUrl = enabled && path ? signedCache.get(cacheKey(path, refreshKey)) ?? null : null
  const [state, setState] = useState<Loaded | null>(() =>
    enabled && path && cachedUrl ? { path, key: refreshKey, url: cachedUrl, failed: false } : null,
  )

  useEffect(() => {
    if (!enabled || !path) return
    let cancelled = false
    const key = refreshKey
    const known = signedCache.get(cacheKey(path, key))
    if (known) {
      setState({ path, key, url: known, failed: false })
      return
    }
    void supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data?.signedUrl) {
          setState({ path, key, url: null, failed: true })
          return
        }
        signedCache.set(cacheKey(path, key), data.signedUrl)
        setState({ path, key, url: data.signedUrl, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ path, key, url: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, path, refreshKey])

  const current = enabled && state && state.path === path && state.key === refreshKey ? state : null

  return {
    url: current?.url ?? null,
    failed: Boolean(enabled && path) && current?.failed === true,
    loading: Boolean(enabled && path) && current == null,
    markFailed: () => {
      if (!path) return
      signedCache.delete(cacheKey(path, refreshKey))
      setState({ path, key: refreshKey, url: null, failed: true })
    },
  }
}
