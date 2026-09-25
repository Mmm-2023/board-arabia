import { useEffect, useRef, useState } from 'react'
import { AVATAR_BUCKET, AVATAR_COPY, avatarContentType, avatarObjectPath, validateAvatarFile } from '../../lib/avatar'
import { supabase } from '../../lib/supabase'
import { useMember } from './context'

type LoadedPhoto = {
  path: string
  attempt: number
  url: string | null
  failed: boolean
}

const actionClass =
  'ba-primary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40'
const quietClass =
  'inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-[0.75rem] font-semibold tracking-[0.08em] text-ink/55 uppercase disabled:opacity-40'

export function MemberAvatar() {
  const { userId, profile, reload } = useMember()
  const inputRef = useRef<HTMLInputElement>(null)
  const path = profile?.avatar_path ?? null
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null)
  const [uploadError, setUploadError] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const current = loaded?.path === path && loaded.attempt === loadAttempt ? loaded : null
  const signedUrl = current?.url ?? null
  const loadFailed = Boolean(path) && current?.failed === true

  useEffect(() => {
    if (!path) return
    let cancelled = false
    const attempt = loadAttempt
    void supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data?.signedUrl) {
          setLoaded({ path, attempt, url: null, failed: true })
          return
        }
        setLoaded({ path, attempt, url: data.signedUrl, failed: false })
      })
    return () => {
      cancelled = true
    }
  }, [path, loadAttempt])

  function openPicker() {
    setUploadError(false)
    inputRef.current?.click()
  }

  async function onFile(file: File | undefined) {
    setUploadError(false)
    setConfirming(false)
    if (!file || !profile) return
    if (validateAvatarFile(file) || !avatarContentType(file.type)) {
      setUploadError(true)
      return
    }
    const contentType = avatarContentType(file.type)
    if (!contentType) {
      setUploadError(true)
      return
    }
    const objectPath = avatarObjectPath(userId)
    setBusy('save')
    const { error: uploadFailed } = await supabase.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
      upsert: true,
      contentType,
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
    await reload()
  }

  async function onRemove() {
    if (!path) return
    setUploadError(false)
    setBusy('remove')
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
    if (removeError) {
      setBusy(null)
      return
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('user_id', userId)
    setBusy(null)
    if (saveError) {
      return
    }
    setConfirming(false)
    await reload()
  }

  const hasPhoto = Boolean(signedUrl)

  return (
    <div className="flex items-center gap-3">
      {hasPhoto ? (
        <img
          src={signedUrl ?? undefined}
          alt="Your profile photo"
          className="h-28 w-28 shrink-0 rounded-full object-cover"
          onError={() => {
            if (!path) return
            setLoaded({ path, attempt: loadAttempt, url: null, failed: true })
          }}
        />
      ) : (
        <div className="h-28 w-28 shrink-0 rounded-full bg-ink/10" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
          {AVATAR_COPY.section}
        </p>
        <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          {path ? (
            <>
              <button
                type="button"
                disabled={!profile || busy !== null}
                onClick={openPicker}
                className={actionClass}
              >
                {busy === 'save' ? 'Saving…' : AVATAR_COPY.change}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirming(true)}
                className={quietClass}
              >
                {AVATAR_COPY.remove}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!profile || busy !== null}
              onClick={openPicker}
              className={actionClass}
            >
              {busy === 'save' ? 'Saving…' : AVATAR_COPY.add}
            </button>
          )}
        </div>
        {path ? null : (
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-ink/60">{AVATAR_COPY.helper}</p>
        )}
        {uploadError ? (
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-[var(--ba-error)]" role="alert">
            {AVATAR_COPY.uploadError}{' '}
            <button
              type="button"
              onClick={openPicker}
              className="border-b border-brass font-semibold text-ink"
            >
              {AVATAR_COPY.tryAgain}
            </button>
          </p>
        ) : null}
        {loadFailed && !uploadError ? (
          <p className="mt-3">
            <button
              type="button"
              onClick={() => setLoadAttempt((value) => value + 1)}
              className="border-b border-brass text-[0.95rem] font-semibold text-ink"
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
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setConfirming(false)} className={quietClass}>
                {AVATAR_COPY.cancel}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onRemove()}
                className={actionClass}
              >
                {busy === 'remove' ? 'Removing…' : AVATAR_COPY.remove}
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
