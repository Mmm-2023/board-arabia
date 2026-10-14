import { useEffect, useState } from 'react'
import {
  confirmMatches,
  digestDraft,
  emptyDraft,
  presentEmailScreen,
  releaseReady,
  type CampaignDraft,
  type EmailScreen,
} from '../../lib/emailCampaign'
import { requestCampaignSend } from '../../lib/emailSend'
import { supabase } from '../../lib/supabase'
import { EmailCampaignView } from './EmailCampaignView'

export function EmailCampaignPanel() {
  const [screen, setScreen] = useState<EmailScreen | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft())
  const [digestIssueId, setDigestIssueId] = useState<string | null>(null)
  const [digestTiers, setDigestTiers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void supabase.rpc('staff_email_screen').then(({ data, error }) => {
      if (cancelled) return
      const next = error ? null : presentEmailScreen(data)
      if (!next) {
        setScreen(null)
        setState('error')
        return
      }
      setScreen(next)
      setState('ready')
      setSelectedId((current) => {
        if (current && next.campaigns.some((item) => item.id === current)) return current
        return next.campaigns[0]?.id ?? null
      })
    })
    void supabase.rpc('staff_digest_issue').then(({ data }) => {
      if (cancelled || !data || typeof data !== 'object' || Array.isArray(data)) return
      const issue = (data as { issue?: unknown }).issue
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
        setDigestIssueId(null)
        return
      }
      const row = issue as { status?: unknown; id?: unknown; audience?: unknown }
      if (row.status !== 'approved' || typeof row.id !== 'string') {
        setDigestIssueId(null)
        return
      }
      setDigestIssueId(row.id)
      setDigestTiers(Array.isArray(row.audience) ? row.audience.filter((item): item is string => typeof item === 'string') : [])
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    if (!screen) return
    const selected = screen.campaigns.find((item) => item.id === selectedId)
    if (!selected) return
    setDraft({
      id: selected.id,
      kind: selected.kind,
      category: selected.category,
      subject: selected.subject,
      preheader: selected.preheader,
      bodyText: selected.bodyText,
      tiers: selected.tiers,
      status: selected.status,
      digestIssueId: selected.digestIssueId,
    })
    setConfirmOpen(false)
    setConfirmText('')
  }, [screen, selectedId])

  const selected = screen?.campaigns.find((item) => item.id === selectedId) ?? null

  async function reload() {
    setAttempt((value) => value + 1)
  }

  async function save(next: CampaignDraft) {
    setBusy(true)
    setNotice('')
    const { data, error } = await supabase.rpc('staff_upsert_campaign', {
      p_id: next.id,
      p_kind: next.kind,
      p_category: next.category,
      p_subject: next.subject,
      p_preheader: next.preheader,
      p_body_text: next.bodyText,
      p_body_html: next.bodyText,
      p_audience: next.tiers,
      p_digest_issue_id: next.digestIssueId,
    })
    setBusy(false)
    if (error || !data || typeof data !== 'object') {
      setNotice('Could not save this letter.')
      return null
    }
    const id = (data as { id?: unknown }).id
    if (typeof id === 'string') setSelectedId(id)
    await reload()
    return typeof id === 'string' ? id : null
  }

  async function approve() {
    const id = draft.id ?? (await save(draft))
    if (!id) return
    setBusy(true)
    setNotice('')
    const { error } = await supabase.rpc('staff_approve_campaign', { p_id: id })
    setBusy(false)
    if (error) {
      setNotice('Could not approve this letter.')
      return
    }
    await reload()
  }

  async function sendTest() {
    if (!draft.id) return
    setBusy(true)
    setNotice('')
    const sent = await requestCampaignSend(draft.id, 'test')
    if (!sent.ok) {
      setBusy(false)
      setNotice(sent.message)
      return
    }
    const { error } = await supabase.rpc('staff_record_campaign_test', { p_id: draft.id })
    setBusy(false)
    if (error) {
      setNotice('The test call returned, but the letter was not marked.')
      return
    }
    setNotice(sent.message)
    await reload()
  }

  async function release() {
    if (!draft.id || !selected) return
    const gate = selected.release
    if (!releaseReady(gate) || !confirmMatches(confirmText, gate.eligible)) return
    setBusy(true)
    setNotice('')
    const { data, error } = await supabase.rpc('staff_email_release_gate', { p_id: draft.id })
    const fresh = data && typeof data === 'object' ? (data as { ready?: unknown }) : null
    if (error || fresh?.ready !== true) {
      setBusy(false)
      setNotice('Release is not open.')
      return
    }
    const sent = await requestCampaignSend(draft.id, 'live')
    setBusy(false)
    setNotice(sent.message)
    if (sent.ok) {
      setConfirmOpen(false)
      setConfirmText('')
    }
  }

  async function setMaster(enabled: boolean) {
    setBusy(true)
    setNotice('')
    const { error } = await supabase.rpc('staff_set_email_master', { p_enabled: enabled })
    setBusy(false)
    if (error) {
      setNotice('Could not change the master switch.')
      return
    }
    await reload()
  }

  return (
    <EmailCampaignView
      state={state}
      screen={screen}
      selected={selected}
      draft={draft}
      digestReady={Boolean(digestIssueId)}
      busy={busy}
      notice={notice}
      confirmOpen={confirmOpen}
      confirmText={confirmText}
      onSelect={(id) => setSelectedId(id)}
      onNew={() => {
        setSelectedId(null)
        setDraft(emptyDraft())
        setConfirmOpen(false)
        setConfirmText('')
      }}
      onDigest={() => {
        if (!digestIssueId) return
        setSelectedId(null)
        setDraft(digestDraft(digestIssueId, digestTiers))
      }}
      onDraft={setDraft}
      onToggleTier={(id) => {
        setDraft((current) => ({
          ...current,
          tiers: current.tiers.includes(id) ? current.tiers.filter((tier) => tier !== id) : [...current.tiers, id],
        }))
      }}
      onSave={() => void save(draft)}
      onApprove={() => void approve()}
      onTest={() => void sendTest()}
      onMaster={(enabled) => void setMaster(enabled)}
      onOpenConfirm={() => {
        setConfirmOpen(true)
        setConfirmText('')
      }}
      onConfirmText={setConfirmText}
      onRelease={() => void release()}
      onRetry={() => void reload()}
    />
  )
}

