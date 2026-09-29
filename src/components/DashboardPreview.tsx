import { useEffect, useRef, useState } from 'react'
import { DashboardPreviewFrame } from './DashboardPreviewFrame'
import {
  LANDING_PREVIEW_EXAMPLES,
  presentLandingDealList,
  type LandingDeal,
} from '../lib/landingPreview'
import {
  attachPreviewLock,
  isPreviewMember,
  openingLock,
  previewVisibility,
  readPreviewLock,
} from '../lib/previewLock'
import { supabase } from '../lib/supabase'

async function loadPreviewMember(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return false
    const { data: member, error } = await supabase
      .from('members')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !member) return false
    return isPreviewMember(member.status)
  } catch {
    return false
  }
}

export function DashboardPreview({
  deals: controlled,
  density = 'page',
}: {
  deals?: LandingDeal[]
  density?: 'page' | 'landing'
}) {
  const [live, setLive] = useState<LandingDeal[]>(LANDING_PREVIEW_EXAMPLES)
  const [locked, setLocked] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

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

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const node = sectionRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    let cancelled = false
    let stop = () => {}

    void loadPreviewMember().then((member) => {
      if (cancelled) return
      if (member) {
        setLocked(false)
        return
      }
      const storage = window.sessionStorage
      if (openingLock({ member: false, stored: readPreviewLock(storage) })) {
        setLocked(true)
        return
      }
      stop = attachPreviewLock({
        member: false,
        storage,
        onLock: () => {
          if (!cancelled) setLocked(true)
        },
        observe(report) {
          const observer = new IntersectionObserver(
            (entries) => {
              const entry = entries[0]
              if (!entry) return
              report(
                previewVisibility({
                  isIntersecting: entry.isIntersecting,
                  intersectionHeight: entry.intersectionRect.height,
                  bottom: entry.boundingClientRect.bottom,
                }),
              )
            },
            { threshold: [0, 0.15, 0.3, 0.6, 1] },
          )
          observer.observe(node)
          return () => observer.disconnect()
        },
      })
    })

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return (
    <DashboardPreviewFrame
      deals={controlled ?? live}
      density={density}
      locked={locked}
      reduceMotion={reduceMotion}
      sectionRef={sectionRef}
    />
  )
}
