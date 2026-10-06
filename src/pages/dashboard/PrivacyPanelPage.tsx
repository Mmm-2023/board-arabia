import { useEffect, useState } from 'react'
import { PrivacyPanelView } from '../../components/privacy/PrivacyPanelView'
import { LEGAL_PENDING, legalField } from '../../config/legal'
import { listTotpFactors } from '../../lib/mfa'
import { ANALYTICS_CONFIG } from '../../lib/tracking/flags'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

export function PrivacyPanelPage() {
  const [hidden, setHidden] = useState(false)
  const [showSponsors, setShowSponsors] = useState(false)
  const [twoStepOn, setTwoStepOn] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'ready' | 'limited' | 'error'>('idle')
  const [busy, setBusy] = useState(false)
  useNoIndex('Your privacy | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('own_directory_visibility').then(({ data }) => {
      if (cancelled || !data || typeof data !== 'object' || Array.isArray(data)) return
      const row = data as { directory_hidden?: boolean; show_card_to_sponsors?: boolean }
      if (row.directory_hidden === true) setHidden(true)
      if (row.show_card_to_sponsors === true) setShowSponsors(true)
    })
    void listTotpFactors().then((factors) => {
      if (!cancelled) setTwoStepOn(factors.some((factor) => factor.status === 'verified'))
    })
    return () => {
      cancelled = true
    }
  }, [])

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
    />
  )
}
