/** Engaged time counts only while the tab is visible and input was recent. */

const ACTIVE_WINDOW_MS = 30_000

export type EngagementState = {
  engagedMs: number
  maxScrollPct: number
  lastActivityAt: number
  visible: boolean
  segmentStartedAt: number | null
  sent: boolean
}

export function startEngagement(now: number): EngagementState {
  return {
    engagedMs: 0,
    maxScrollPct: 0,
    lastActivityAt: now,
    visible: true,
    segmentStartedAt: now,
    sent: false,
  }
}

function fold(state: EngagementState, now: number): EngagementState {
  if (!state.visible || state.segmentStartedAt == null) return state
  const activeUntil = state.lastActivityAt + ACTIVE_WINDOW_MS
  const end = Math.min(now, activeUntil)
  const gained = Math.max(0, end - state.segmentStartedAt)
  return {
    ...state,
    engagedMs: state.engagedMs + gained,
    segmentStartedAt: now < activeUntil ? now : null,
  }
}

export function noteActivity(state: EngagementState, now: number): EngagementState {
  const folded = fold(state, now)
  return {
    ...folded,
    lastActivityAt: now,
    segmentStartedAt: folded.visible ? now : null,
  }
}

export function noteVisibility(state: EngagementState, visible: boolean, now: number): EngagementState {
  const folded = fold(state, now)
  return {
    ...folded,
    visible,
    segmentStartedAt: visible ? now : null,
  }
}

export function noteScroll(state: EngagementState, pct: number): EngagementState {
  const rounded = Math.max(0, Math.min(100, Math.round(pct)))
  return { ...state, maxScrollPct: Math.max(state.maxScrollPct, rounded) }
}

export function engagementSnapshot(state: EngagementState, now: number) {
  const folded = fold(state, now)
  const seconds = Math.round(folded.engagedMs / 1000)
  const pct = folded.maxScrollPct
  return {
    engaged_seconds: seconds,
    max_scroll_pct: pct,
    reached_50: pct >= 50,
    reached_75: pct >= 75,
    reached_90: pct >= 90,
  }
}
