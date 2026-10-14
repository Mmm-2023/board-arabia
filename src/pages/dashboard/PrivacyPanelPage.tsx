import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { PrivacyPanelView } from '../../components/privacy/PrivacyPanelView'
import { LEGAL_PENDING, legalField } from '../../config/legal'
import { listTotpFactors } from '../../lib/mfa'
import { ANALYTICS_CONFIG } from '../../lib/tracking/flags'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { BIOMETRIC_PREF_EVENT, readUnlockState, showBiometricSetting } from '../../shell/biometricLock'
import { deviceSupportsBiometrics, disableNativeUnlock, enableNativeUnlock, nativeVault } from '../../shell/nativeBiometric'
import { askPushPermission, registerDevicePush, unregisterDevicePush } from '../../shell/nativePush'
import { PUSH_REGISTRATION_FAILED, pushEnabledFromPreference, shouldAskPushPermission, showPushSetting } from '../../shell/pushRegistration'

export function PrivacyPanelPage() {
  const [hidden, setHidden] = useState(false)
  const [showSponsors, setShowSponsors] = useState(false)
  const [digestOptIn, setDigestOptIn] = useState(false)
  const [newsOptIn, setNewsOptIn] = useState(false)
  const [deliveryConnected, setDeliveryConnected] = useState(false)
  const [noticeOptIn, setNoticeOptIn] = useState<Record<string, boolean>>({})
  const [noticesConnected, setNoticesConnected] = useState(false)
  const [twoStepOn, setTwoStepOn] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'ready' | 'limited' | 'error'>('idle')
  const [busy, setBusy] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushProblem, setPushProblem] = useState('')
  useNoIndex('Your privacy | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('own_directory_visibility').then(({ data }) => {
      if (cancelled || !data || typeof data !== 'object' || Array.isArray(data)) return
      const row = data as { directory_hidden?: boolean; show_card_to_sponsors?: boolean }
      if (row.directory_hidden === true) setHidden(true)
      if (row.show_card_to_sponsors === true) setShowSponsors(true)
    })
    void supabase.rpc('my_email_preferences').then(({ data }) => {
      if (cancelled || !data || typeof data !== 'object' || Array.isArray(data)) return
      const row = data as {
        weekly_digest?: boolean
        news_invitations?: boolean
        delivery_connected?: boolean
        notices?: Record<string, boolean>
      }
      setDigestOptIn(row.weekly_digest === true)
      setNewsOptIn(row.news_invitations === true)
      setDeliveryConnected(row.delivery_connected === true)
      setNoticesConnected(row.delivery_connected === true)
      if (row.notices && typeof row.notices === 'object' && !Array.isArray(row.notices)) setNoticeOptIn(row.notices)
    })
    void listTotpFactors().then((factors) => {
      if (!cancelled) setTwoStepOn(factors.some((factor) => factor.status === 'verified'))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void deviceSupportsBiometrics().then(async (hardware) => {
      if (cancelled) return
      const available = showBiometricSetting(Capacitor.isNativePlatform(), hardware)
      if (!available) return
      const state = await readUnlockState(nativeVault())
      if (cancelled) return
      setBiometricAvailable(true)
      setBiometricEnabled(state.enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showPushSetting(Capacitor.isNativePlatform())) return
    let cancelled = false
    setPushAvailable(true)
    void supabase.rpc('own_push_preference').then(({ data }) => {
      if (!cancelled) setPushEnabled(pushEnabledFromPreference(data))
    })
    function onFailed() {
      setPushEnabled(false)
      setPushProblem('This device could not register. Nothing was sent.')
      void supabase.rpc('set_push_notifications', { p_enabled: false })
    }
    window.addEventListener(PUSH_REGISTRATION_FAILED, onFailed)
    return () => {
      cancelled = true
      window.removeEventListener(PUSH_REGISTRATION_FAILED, onFailed)
    }
  }, [])

  async function onPush(next: boolean) {
    setPushProblem('')
    const native = Capacitor.isNativePlatform()
    if (!showPushSetting(native)) return
    if (!shouldAskPushPermission(native, next)) {
      const { error } = await supabase.rpc('set_push_notifications', { p_enabled: false })
      if (error) {
        setPushProblem('Could not save this choice. Retry.')
        return
      }
      await unregisterDevicePush()
      setPushEnabled(false)
      return
    }
    const granted = await askPushPermission()
    if (!granted) {
      setPushProblem('Permission was not granted. Push stays off.')
      return
    }
    const { error } = await supabase.rpc('set_push_notifications', { p_enabled: true })
    if (error) {
      setPushProblem('Could not save this choice. Retry.')
      return
    }
    setPushEnabled(true)
    const registered = await registerDevicePush()
    if (!registered) {
      await supabase.rpc('set_push_notifications', { p_enabled: false })
      setPushEnabled(false)
      setPushProblem('This device could not register. Nothing was sent.')
    }
  }

  async function onBiometric(next: boolean) {
    if (!next) {
      await disableNativeUnlock()
      setBiometricEnabled(false)
      window.dispatchEvent(new Event(BIOMETRIC_PREF_EVENT))
      return
    }
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const ok = await enableNativeUnlock(
      session?.access_token && session.refresh_token
        ? { access_token: session.access_token, refresh_token: session.refresh_token }
        : null,
    )
    if (!ok) return
    setBiometricEnabled(true)
    window.dispatchEvent(new Event(BIOMETRIC_PREF_EVENT))
  }

  async function onHidden(next: boolean) {
    const previous = hidden
    setHidden(next)
    const { error } = await supabase.rpc('set_directory_hidden', { p_hidden: next })
    if (error) setHidden(previous)
  }

  async function onShowSponsors(next: boolean) {
    const previous = showSponsors
    setShowSponsors(next)
    const { error } = await supabase.rpc('set_show_card_to_sponsors', { p_show: next })
    if (error) setShowSponsors(previous)
  }

  async function onDigest(next: boolean) {
    const previous = digestOptIn
    setDigestOptIn(next)
    const { error } = await supabase.rpc('set_digest_email_opt_in', { p_opt_in: next })
    if (error) setDigestOptIn(previous)
  }

  async function onNews(next: boolean) {
    const previous = newsOptIn
    setNewsOptIn(next)
    const { error } = await supabase.rpc('set_email_preference', { p_category: 'news_invitations', p_opt_in: next })
    if (error) setNewsOptIn(previous)
  }

  async function onNotice(key: string, next: boolean) {
    if (key === 'message_new') return
    const previous = noticeOptIn[key] === true
    setNoticeOptIn((current) => ({ ...current, [key]: next }))
    const { error } = await supabase.rpc('set_email_preference', { p_category: key, p_opt_in: next })
    if (error) setNoticeOptIn((current) => ({ ...current, [key]: previous }))
  }

  async function onDownload() {
    setBusy(true)
    setDownloadState('idle')
    const { data, error } = await supabase.rpc('download_my_data')
    setBusy(false)
    if (error) {
      setDownloadState(/rate_limited/i.test(error.message) ? 'limited' : 'error')
      return
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'board-arabia-data.json'
    link.click()
    URL.revokeObjectURL(url)
    setDownloadState('ready')
  }

  const contact = legalField('contactEmail')
  const privacyContact = contact && contact !== LEGAL_PENDING.en ? contact : null

  return (
    <PrivacyPanelView
      hidden={hidden}
      showSponsors={showSponsors}
      twoStepOn={twoStepOn}
      analyticsOn={ANALYTICS_CONFIG.enabled}
      privacyContact={privacyContact}
      downloadState={downloadState}
      busy={busy}
      onHidden={(next) => void onHidden(next)}
      onShowSponsors={(next) => void onShowSponsors(next)}
      onDownload={() => void onDownload()}
      digestOptIn={digestOptIn}
      onDigestOptIn={(next) => void onDigest(next)}
      newsOptIn={newsOptIn}
      onNewsOptIn={(next) => void onNews(next)}
      deliveryConnected={deliveryConnected}
      noticeOptIn={noticeOptIn}
      noticesConnected={noticesConnected}
      onNoticeOptIn={(key, next) => void onNotice(key, next)}
      biometricAvailable={biometricAvailable}
      biometricEnabled={biometricEnabled}
      onBiometricEnabled={(next) => void onBiometric(next)}
      pushAvailable={pushAvailable}
      pushEnabled={pushEnabled}
      pushProblem={pushProblem}
      onPushEnabled={(next) => void onPush(next)}
    />
  )
}
