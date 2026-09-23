import { useEffect, useRef, useState } from 'react'
import { AVATAR_BUCKET, avatarContentType, avatarObjectPath, validateAvatarFile } from '../../lib/avatar'
import { supabase } from '../../lib/supabase'
import { useMember } from './context'

type LoadedPhoto = {
  path: string
  attempt: number
  url: string | null
  error: string
}

export function MemberAvatar() {
  const { userId, profile, reload } = useMember()
  const inputRef = useRef<HTMLInputElement>(null)
  const path = profile?.avatar_path ?? null
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const current =
    loaded?.path === path && loaded.attempt === loadAttempt ? loaded : null
  const signedUrl = current?.url ?? null
  const loadError = current?.error ?? ''

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
          setLoaded({ path, attempt, url: null, error: "Couldn't load your photo." })
          return
        }
        setLoaded({ path, attempt, url: data.signedUrl, error: '' })
      })
    return () => {
      cancelled = true
    }
  }, [path, loadAttempt])

  async function onFile(file: File | undefined) {
    setFormError('')
    if (!file || !profile) return
    const invalid = validateAvatarFile(file)
    if (invalid) {
      setFormError(invalid)
      return
    }
    const contentType = avatarContentType(file.type)
    if (!contentType) {
      setFormError('Use a JPG, PNG, or WebP under 2 MB.')
      return
    }
    const objectPath = avatarObjectPath(userId)
    setBusy('save')
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, file, {
        upsert: true,
        contentType,
        cacheControl: '3600',
      })
    if (uploadError) {
      setBusy(null)
      setFormError(storageError(uploadError.message))
      return
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_path: objectPath })
      .eq('user_id', userId)
    setBusy(null)
    if (saveError) {
      setFormError(storageError(saveError.message))
      return
    }
    await reload()
  }

  async function onRemove() {
    if (!path) return
    setFormError('')
    setBusy('remove')
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
    if (removeError) {
      setBusy(null)
      setFormError(storageError(removeError.message))
      return
    }
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('user_id', userId)
    setBusy(null)
    if (saveError) {
      setFormError(storageError(saveError.message))
      return
    }
    await reload()
  }

  const hasPhoto = Boolean(signedUrl)
  const photoLabel = !path ? 'No photo yet.' : hasPhoto ? 'Photo saved.' : loadError ? 'Photo on file.' : 'Loading photo…'
  const alert = formError || loadError

  return (
    <section className="mt-10 border border-ink/10 px-5 py-5">
      <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.03em]">Photo</h2>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
        Shown on your profile. The directory does not publish it.
      </p>
      <div className="mt-5 flex items-center gap-4">
        {hasPhoto ? (
          <img
            src={signedUrl ?? undefined}
            alt="Your profile photo"
            className="h-16 w-16 rounded-full object-cover"
            onError={() => {
              if (!path) return
              setLoaded({ path, attempt: loadAttempt, url: null, error: "Couldn't load your photo." })
            }}
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-ink/10" aria-hidden="true" />
        )}
        <div>
          <p className="text-[0.92rem] text-ink/55">{photoLabel}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!profile || busy !== null}
              onClick={() => inputRef.current?.click()}
              className="bg-ink px-4 py-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : hasPhoto ? 'Replace photo' : 'Add photo'}
            </button>
            {path ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onRemove()}
                className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase disabled:opacity-40"
              >
                {busy === 'remove' ? 'Removing…' : 'Remove photo'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void onFile(file)
        }}
      />
      {alert ? (
        <p className="mt-4 text-[0.92rem] text-red-700" role="alert">
          {alert}{' '}
          {loadError ? (
            <button
              type="button"
              onClick={() => setLoadAttempt((value) => value + 1)}
              className="border-b border-brass font-semibold text-ink"
            >
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}

function storageError(message: string) {
  if (/avatar_path|member-avatars|bucket|schema cache/i.test(message)) {
    return "Couldn't save the photo yet. Photo storage is not ready."
  }
  return "Couldn't save the photo. Retry."
}
