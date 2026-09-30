import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ConsentBanner } from './ConsentBanner'
import { ANALYTICS_CONFIG } from '../lib/tracking/flags'
import { capture } from '../lib/tracking/browser'
import { isBlockedPath } from '../lib/tracking/decide'
import {
  engagementSnapshot,
  noteActivity,
  noteScroll,
  noteVisibility,
  startEngagement,
  type EngagementState,
} from '../lib/tracking/engagement'
import { observeVisit } from '../lib/tracking/touch'

/** Mounts consent UI and, only when the flag is on, page measurement. */
export function AnalyticsRoot() {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return
    observeVisit(window.location.href, document.referrer, document.cookie, window.localStorage)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!ANALYTICS_CONFIG.enabled || typeof window === 'undefined') return
    if (isBlockedPath(location.pathname)) return
    let state: EngagementState = startEngagement(Date.now())
    let sent = false
    const mark = () => {
      state = noteActivity(state, Date.now())
    }
    const onScroll = () => {
      state = noteActivity(state, Date.now())
      state = noteScroll(state, scrollPercent())
    }
    const onVisibility = () => {
      state = noteVisibility(state, document.visibilityState === 'visible', Date.now())
    }
    const flush = () => {
      if (sent) return
      sent = true
      state = noteScroll(state, scrollPercent())
      const snap = engagementSnapshot(state, Date.now())
      void capture('page_engaged', snap)
    }
    window.addEventListener('pointerdown', mark, { passive: true })
    window.addEventListener('keydown', mark)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    void capture('page_view', { title: document.title })
    return () => {
      flush()
      window.removeEventListener('pointerdown', mark)
      window.removeEventListener('keydown', mark)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [location.pathname])

  return <ConsentBanner />
}

function scrollPercent(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return 100
  return (window.scrollY / max) * 100
}
