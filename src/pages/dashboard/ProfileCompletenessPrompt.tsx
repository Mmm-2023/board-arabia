import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  isProfilePromptDismissed,
  PROFILE_PROMPT_LINE,
  profilePromptStorageKey,
  profilePromptShowing,
  SUGGESTION_PROFILE_HREF,
  type SuggestionProfile,
} from '../../lib/suggestionProfile'

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
    // The prompt can show again on the next visit if storage is blocked.
  }
}

export function ProfileCompletenessPrompt({
  userId,
  staff,
  profile,
  onDismiss,
}: {
  userId: string
  staff: boolean
  profile: SuggestionProfile
  onDismiss?: () => void
}) {
  const [seenUser, setSeenUser] = useState(userId)
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  if (seenUser !== userId) {
    setSeenUser(userId)
    setDismissed(readDismissed(userId))
  }

  if (!profilePromptShowing({ staff, dismissed, profile })) return null

  return (
    <section aria-label="Profile for introductions" className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4" data-profile-prompt="">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink">{PROFILE_PROMPT_LINE}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link to={SUGGESTION_PROFILE_HREF} className="inline-flex min-h-11 items-center text-ink underline">
          Profile
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 items-center font-semibold text-ink/70"
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
