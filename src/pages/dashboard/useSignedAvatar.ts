import { useEffect, useState } from 'react'
import { AVATAR_BUCKET } from '../../lib/avatar'
import { supabase } from '../../lib/supabase'

type Loaded = {
  path: string
  key: number
  url: string | null
  failed: boolean
}

export function useSignedAvatar(path: string | null, refreshKey = 0, enabled = true) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!enabled || !path) return
    let cancelled = false
    const key = refreshKey
    void supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data?.signedUrl) {
          setState({ path, key, url: null, failed: true })
          return
        }
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
      setState({ path, key: refreshKey, url: null, failed: true })
    },
  }
}
