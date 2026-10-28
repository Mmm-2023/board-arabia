import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  firstMissingHref,
  profileCardVisible,
  WEEKLY_INTROS_CARD_CTA,
  WEEKLY_INTROS_CARD_LINE,
  type CompletenessRow,
} from '../../lib/profileCompleteness'
import { isProfilePromptDismissed, profilePromptStorageKey } from '../../lib/suggestionProfile'

function readDismissed(userId: string) {
  if (typeof window === 'undefined') return false
  try {
    return isProfilePromptDismissed(window.localStorage.getItem(profilePromptStorageKey(userId)))
  } catch {
    return false
  }
}

function writeDismissed(userId: string) {
  try {
    window.localStorage.setItem(profilePromptStorageKey(userId), '1')
  } catch {
    // The card can show again on the next visit if storage is blocked.
  }
}

/** One Home card. Hidden for staff, after dismiss, and when every visible row is done. */
export function ProfileCompletenessPrompt({
  userId,
  staff,
  status,
  rows,
  onDismiss,
  onRetry,
}: {
  userId: string
  staff: boolean
  status: 'loading' | 'ready' | 'error'
  rows: readonly CompletenessRow[]
  onDismiss?: () => void
  onRetry?: () => void
}) {
  const [seenUser, setSeenUser] = useState(userId)
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  if (seenUser !== userId) {
    setSeenUser(userId)
    setDismissed(readDismissed(userId))
  }

  if (staff) return null
  if (status === 'loading') {
    return (
      <section aria-label="Checking your profile" aria-busy="true" className="border border-[var(--ba-line)] bg-white px-4 py-4" data-profile-prompt-loading="">
        <div className="h-11 animate-pulse bg-[var(--ba-lavender)] motion-reduce:animate-none" />
      </section>
    )
  }
  if (status === 'error') {
    return (
      <section aria-label="Profile check" className="border border-[var(--ba-line)] bg-white px-4 py-4" data-profile-prompt-error="">
        <p className="text-[1rem] text-[var(--ba-error)]" role="alert">
          Could not check your profile.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-12 items-center border border-ink/20 px-4 text-[0.95rem] font-semibold"
          onClick={onRetry}
        >
          Retry
        </button>
      </section>
    )
  }
  if (!profileCardVisible({ staff, dismissed, status, rows })) return null
  const href = firstMissingHref(rows)
  if (!href) return null

  return (
    <section aria-label="Profile for introductions" className="border border-[var(--ba-line)] bg-white px-4 py-4" data-profile-prompt="">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink">{WEEKLY_INTROS_CARD_LINE}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link to={href} className="inline-flex min-h-12 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)] underline">
          {WEEKLY_INTROS_CARD_CTA}
        </Link>
        <button
          type="button"
          className="inline-flex min-h-12 items-center font-semibold text-ink/70"
          onClick={() => {
            writeDismissed(userId)
            setDismissed(true)
            onDismiss?.()
          }}
        >
          Dismiss
        </button>
      </div>
    </section>
  )
}
