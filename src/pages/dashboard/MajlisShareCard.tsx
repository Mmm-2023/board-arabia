import { useId, useState } from 'react'
import {
  MAJLIS_SHARE_CARDS_ENABLED,
  majlisShareModel,
  type MajlisShareEvent,
  type MajlisShareModel,
} from '../../lib/majlisShare'

const actionClass =
  'inline-flex min-h-11 w-full items-center justify-center px-4 text-[0.95rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-indigo)] sm:w-auto'

type MajlisShareCardProps = {
  event: MajlisShareEvent
  nowMs: number
  enabled?: boolean
  dismissed?: boolean
  onDismiss?: () => void
}

/** Small control on the member majlis card. Hidden unless the flag is on and the RSVP is active. */
export function MajlisShareCard({ event, nowMs, enabled, dismissed = false, onDismiss }: MajlisShareCardProps) {
  const [localDismissed, setLocalDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const show = enabled ?? MAJLIS_SHARE_CARDS_ENABLED
  const model = show && !dismissed && !localDismissed ? majlisShareModel(event, nowMs, true) : null
  if (!model) return null
  const draft = model

  function dismiss() {
    setLocalDismissed(true)
    onDismiss?.()
  }

  async function copy() {
    try {
      const write = navigator.clipboard?.writeText
      if (!write) throw new Error('unavailable')
      await write.call(navigator.clipboard, draft.text)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

  return (
    <MajlisShareCardView
      model={model}
      copied={copied}
      copyError={copyError}
      onCopy={() => void copy()}
      onDismiss={dismiss}
    />
  )
}

export function MajlisShareCardView({
  model,
  copied,
  copyError,
  onCopy,
  onDismiss,
}: {
  model: MajlisShareModel
  copied: boolean
  copyError: boolean
  onCopy: () => void
  onDismiss: () => void
}) {
  const headingId = useId()
  const heading = model.phase === 'attending' ? 'Share that you are attending' : 'Share that you attended'
  const state = copyError ? 'error' : copied ? 'copied' : model.phase
  return (
    <section
      className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-4"
      data-majlis-share-card=""
      data-share-phase={model.phase}
      data-share-state={state}
      aria-labelledby={headingId}
    >
      <h4 id={headingId} className="font-display text-[1.05rem] font-semibold text-ink">
        {heading}
      </h4>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">You post this yourself. We do not post for you.</p>
      {model.phase === 'attended' ? (
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
          Saying you joined is your choice. We do not record who attended.
        </p>
      ) : null}
      <p
        data-share-text=""
        className="mt-3 whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink [overflow-wrap:anywhere]"
      >
        {model.text}
      </p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">
        If LinkedIn opens with an empty box, paste the post text.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a className={`ba-primary ${actionClass}`} href={model.shareUrl} target="_blank" rel="noopener noreferrer">
          Open LinkedIn
        </a>
        <button type="button" className={`border border-[var(--ba-line)] bg-white text-ink ${actionClass}`} onClick={onCopy}>
          Copy post text
        </button>
        <button type="button" className={`border border-[var(--ba-line)] bg-white text-ink ${actionClass}`} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {copied ? (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink" role="status">
          Post text copied.
        </p>
      ) : null}
      {copyError ? (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--ba-error)]" role="alert">
          Could not copy the post text. Select the post above and copy it yourself.
        </p>
      ) : null}
    </section>
  )
}
