import { useEffect, useState } from 'react'
import { DashboardPreviewFrame } from './DashboardPreviewFrame'
import {
  LANDING_PREVIEW_EXAMPLES,
  presentLandingDealList,
  type LandingDeal,
} from '../lib/landingPreview'
import { supabase } from '../lib/supabase'

export function DashboardPreview({ deals: controlled }: { deals?: LandingDeal[] }) {
  const [live, setLive] = useState<LandingDeal[]>(LANDING_PREVIEW_EXAMPLES)

  useEffect(() => {
    if (controlled) return
    let cancelled = false
    void supabase.rpc('list_landing_preview_deals').then(({ data, error }) => {
      if (cancelled || error) return
      setLive(presentLandingDealList(data))
    })
    return () => {
      cancelled = true
    }
  }, [controlled])

  return <DashboardPreviewFrame deals={controlled ?? live} />
}
