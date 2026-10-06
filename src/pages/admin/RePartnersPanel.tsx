import { useEffect, useState } from 'react'
import { fetchRePartners } from '../../lib/demoFetch'
import {
  draftFromPartner,
  partnerMoveOrders,
  partnerSaveArgs,
  RE_PARTNER_STAFF,
  type RePartnerDraft,
} from '../../lib/rePartnerView'
import type { RePartnerCard, RePartnerInventory } from '../../lib/reRedaction'
import { supabase } from '../../lib/supabase'
import { RePartnersEditor, type RePartnersEditorStatus } from './RePartnersEditor'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'ready'; cards: RePartnerCard[] }

export function RePartnersPanel({ previewCards }: { previewCards?: readonly RePartnerCard[] } = {}) {
  const [load, setLoad] = useState<LoadState>(
    previewCards ? { status: 'ready', cards: [...previewCards] } : { status: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)

  useEffect(() => {
    if (previewCards) return
    let cancelled = false
    void fetchRePartners().then((result) => {
      if (cancelled) return
      if (result.status === 'error' || result.status === 'missing') {
        setLoad(result.status === 'missing' ? { status: 'unavailable' } : { status: 'error' })
        return
      }
      if (result.status === 'denied') {
        setLoad({ status: 'denied' })
        return
      }
      setLoad({ status: 'ready', cards: result.rows })
    })
    return () => {
      cancelled = true
    }
  }, [attempt, previewCards])

  async function save(draft: RePartnerDraft, busy: string) {
    const args = partnerSaveArgs(draft)
    if (!args) {
      setAlert(RE_PARTNER_STAFF.error)
      return false
    }
    setBusyId(busy)
    setNotice(null)
    setAlert(null)
    const { error } = await supabase.rpc('staff_save_re_partner', args)
    setBusyId(null)
    if (error) {
      setAlert(/demo_locked/i.test(error.message) ? RE_PARTNER_STAFF.demo : RE_PARTNER_STAFF.error)
      return false
    }
    return true
  }

  async function onSave(draft: RePartnerDraft) {
    const current = load.status === 'ready' ? load.cards.find((card) => card.id === draft.id) : null
    if (current?.is_demo) {
      setAlert(RE_PARTNER_STAFF.demo)
      return
    }
    const ok = await save(draft, draft.id ?? 'new')
    if (!ok) return
    setNotice(RE_PARTNER_STAFF.saved)
    setAttempt((value) => value + 1)
  }

  async function onMove(id: string, direction: -1 | 1) {
    if (load.status !== 'ready') return
    const live = load.cards.filter((card): card is RePartnerInventory => card.access === 'inventory' && !card.is_demo)
    const plans = partnerMoveOrders(live, id, direction)
    if (!plans) return
    setNotice(null)
    setAlert(null)
    for (const plan of plans) {
      const card = live.find((item) => item.id === plan.id)
      if (!card || card.sort_order === plan.sort_order) continue
      const ok = await save(draftFromPartner(card, plan.sort_order), id)
      if (!ok) return
    }
    setNotice(RE_PARTNER_STAFF.saved)
    setAttempt((value) => value + 1)
  }

  const status: RePartnersEditorStatus = load.status
  return (
    <RePartnersEditor
      status={status}
      cards={load.status === 'ready' ? load.cards : []}
      busyId={busyId}
      notice={notice}
      alert={alert}
      onRetry={() => {
        setAlert(null)
        setLoad({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
      onSave={(draft) => void onSave(draft)}
      onMove={(id, direction) => void onMove(id, direction)}
    />
  )
}
