import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import {
  currentPushPlatform,
  listenForPush,
  pushPermissionGranted,
  registerDevicePush,
} from './nativePush'
import type { InAppLink } from './incomingLink'
import { PUSH_REGISTRATION_FAILED, pushEnabledFromPreference } from './pushRegistration'

/** Native listeners only. Permission is requested from the notification setting, not from here. */
export function PushBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    let stop = async () => undefined as void

    function openInApp(link: InAppLink) {
      navigate({ pathname: link.path, search: link.search, hash: link.hash })
    }

    void (async () => {
      stop = await listenForPush({
        onToken: (token) => {
          const platform = currentPushPlatform()
          if (!platform) return
          void supabase.rpc('register_push_token', { p_platform: platform, p_token: token }).then(({ error }) => {
            if (error) window.dispatchEvent(new Event(PUSH_REGISTRATION_FAILED))
          })
        },
        onRegistrationError: () => {
          window.dispatchEvent(new Event(PUSH_REGISTRATION_FAILED))
        },
        onOpen: (link) => {
          if (link.kind === 'in-app') openInApp(link)
        },
      })
      if (cancelled) {
        await stop()
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      const { data: pref, error } = await supabase.rpc('own_push_preference')
      if (error || !pushEnabledFromPreference(pref)) return
      if (await pushPermissionGranted()) await registerDevicePush()
    })()

    return () => {
      cancelled = true
      void stop()
    }
  }, [navigate])

  return null
}
