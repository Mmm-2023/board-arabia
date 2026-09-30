import { useRef, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { AVATAR_BUCKET, AVATAR_COPY, avatarObjectPath } from '../../lib/avatar'
import { prepareAvatarUpload } from '../../lib/avatarImage'
import { supabase } from '../../lib/supabase'
import { useMember } from './context'
import { useSignedAvatar } from './useSignedAvatar'

const actionClass =
  'ba-primary inline-flex min-h-11 w-full items-center justify-center px-4 py-2.5 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto'
const quietClass =
  'inline-flex min-h-11 w-full items-center justify-center px-4 py-2.5 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/55 uppercase disabled:opacity-40 sm:w-auto'

export function MemberAvatar({
  preview,
  refreshKey = 0,
}: {
  preview?: { src: string | null }
  refreshKey?: number
}) {
  const { userId, profile, reload } = useMember()
  const inputRef = useRef<HTMLInputElement>(null)
  const path = profile?.avatar_path ?? null
  const [uploadError, setUploadError] = useState(false)
  const [removeError, setRemoveError] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const live = useSignedAvatar(path, refreshKey + loadAttempt, preview === undefined)
  const src = preview ? preview.src : live.failed ? null : live.url
  const waiting = preview ? false : live.loading

  function openPicker() {
    setUploadError(false)
    setRemoveError(false)
    inputRef.current?.click()
  }

  async function onFile(file: File | undefined) {
    setUploadError(false)
    setRemoveError(false)
    setConfirming(false)
    if (!file || !profile) return
    setBusy('save')
    let prepared: Awaited<ReturnType<typeof prepareAvatarUpload>>
    try {
      prepared = await prepareAvatarUpload(file)
    } catch {
      setBusy(null)
      setUploadError(true)
      return
    }
    const objectPath = avatarObjectPath(userId)
    const { error: uploadFailed } = await supabase.storage.from(AVATAR_BUCKET).upload(objectPath, prepared.body, {
      upsert: true,
      contentType: prepared.contentType,
      cacheControl: '3600',
    })
    if (uploadFailed) {
      setBusy(null)
      setUploadError(true)
      return
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_path: objectPath })
      .eq('user_id', userId)
    setBusy(null)
    if (saveError) {
      setUploadError(true)
      return
    }
    setLoadAttempt((value) => value + 1)
    await reload()
  }

  async function onRemove() {
    if (!path) return
    setUploadError(false)
    setRemoveError(false)
    setBusy('remove')
    const { error: removeFailed } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
    if (removeFailed) {
      setBusy(null)
      setRemoveError(true)
      return
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('user_id', userId)
    setBusy(null)
    if (saveError) {
      setRemoveError(true)
      return
    }
    setConfirming(false)
    await reload()
  }

  return (
    <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center">
      <Avatar
        src={src}
        avatarStyle={profile?.avatar_style}
        size={112}
        busy={waiting || busy === 'save'}
        alt="Your profile photo"
        onError={preview ? undefined : live.markFailed}
      />
      <div className="min-w-0 w-full flex-1">
        <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          {AVATAR_COPY.section}
        </p>
        <div className="mt-2 flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {path ? (
            <>
              <button type="button" disabled={!profile || busy !== null} onClick={openPicker} className={actionClass}>
                {busy === 'save' ? 'Saving\u2026' : AVATAR_COPY.change}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setRemoveError(false)
                  setConfirming(true)
                }}
                className={quietClass}
              >
                {AVATAR_COPY.remove}
              </button>
            </>
          ) : (
            <button type="button" disabled={!profile || busy !== null} onClick={openPicker} className={actionClass}>
              {busy === 'save' ? 'Saving\u2026' : AVATAR_COPY.add}
            </button>
          )}
        </div>
        {path ? null : (
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-ink/60">{AVATAR_COPY.helper}</p>
        )}
        {uploadError ? (
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-[var(--ba-error)]" role="alert">
            {AVATAR_COPY.uploadError}{' '}
            <button type="button" onClick={openPicker} className="inline-flex min-h-11 items-center border-b border-brass font-semibold text-ink">
              {AVATAR_COPY.tryAgain}
            </button>
          </p>
        ) : null}
        {removeError ? (
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-[var(--ba-error)]" role="alert">
            Couldn&apos;t remove that photo.{' '}
            <button type="button" onClick={() => void onRemove()} className="inline-flex min-h-11 items-center border-b border-brass font-semibold text-ink">
              {AVATAR_COPY.tryAgain}
            </button>
          </p>
        ) : null}
        {live.failed && !uploadError && !preview ? (
          <p className="mt-3">
            <button
              type="button"
              onClick={() => setLoadAttempt((value) => value + 1)}
              className="inline-flex min-h-11 items-center border-b border-brass text-[0.95rem] font-semibold text-ink"
            >
              {AVATAR_COPY.tryAgain}
            </button>
          </p>
        ) : null}
        {confirming ? (
          <div
            role="dialog"
            aria-labelledby="remove-photo-title"
            className="mt-4 max-w-sm border border-ink/15 bg-white/80 px-4 py-4"
          >
            <h2 id="remove-photo-title" className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
              {AVATAR_COPY.removeTitle}
            </h2>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/65">{AVATAR_COPY.removeBody}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => setConfirming(false)} className={quietClass}>
                {AVATAR_COPY.cancel}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void onRemove()} className={actionClass}>
                {busy === 'remove' ? 'Removing\u2026' : AVATAR_COPY.remove}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void onFile(file)
        }}
      />
    </div>
  )
}
