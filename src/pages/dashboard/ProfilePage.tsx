import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { DefaultPicturePicker } from '../../components/DefaultPicturePicker'
import { SponsorBadge } from '../../components/SponsorBadge'
import { DEFAULT_PICTURE_NOTE, normalizeAvatarStyle, type AvatarStyle } from '../../lib/avatarStyle'
import { formatPrivateUsd, PLATFORM_TOTALS_NOTE, readNumeric } from '../../lib/capacity'
import { schemaMissing } from '../../lib/demoRows'
import {
  finishLinkedInConnect,
  linkedInLinked,
  linkedInStateMatches,
  startLinkedInConnect,
  type LinkedInProfilePatch,
} from '../../lib/linkedinConnect'
import { LINKEDIN_CONNECT_ENABLED, LINKEDIN_COPY } from '../../lib/linkedinFlag'
import type { ProfileRow } from '../../lib/member'
import {
  isAvailability,
  normalizeTags,
  SECTOR_TAGS,
  toggleTag,
  VISION_2030_THEMES,
  type Availability,
} from '../../lib/profileTags'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { useMember } from './context'
import { LinkedInConnect } from './LinkedInConnect'
import { MemberAvatar } from './MemberAvatar'
import { ProfileTagFields } from './ProfileTagFields'

const fieldClass =
  'mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function ProfilePage({ preview }: { preview?: { src: string | null } }) {
  const { userId, email, profile, member, reload } = useMember()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [headline, setHeadline] = useState(profile?.headline ?? '')
  const [company, setCompany] = useState(profile?.company ?? '')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [linkedin, setLinkedin] = useState(profile?.linkedin_url ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [calendar, setCalendar] = useState(profile?.calendar_url ?? '')
  const calendarKnown = profile?.calendar_url !== undefined
  const [bio, setBio] = useState(profile?.bio ?? '')
  const tagsFromProfile =
    profile?.availability !== undefined ||
    profile?.sector_tags !== undefined ||
    profile?.vision_themes !== undefined
  const [availability, setAvailability] = useState<Availability | null>(
    isAvailability(profile?.availability) ? profile.availability : null,
  )
  const [sectors, setSectors] = useState(() => normalizeTags(profile?.sector_tags, SECTOR_TAGS))
  const [themes, setThemes] = useState(() => normalizeTags(profile?.vision_themes, VISION_2030_THEMES))
  const [tagNote, setTagNote] = useState('')
  const [tagStatus, setTagStatus] = useState<'loading' | 'ready' | 'error'>(tagsFromProfile ? 'ready' : 'loading')
  const [tagAttempt, setTagAttempt] = useState(0)
  const [includeInPublic, setIncludeInPublic] = useState(
    profile?.include_in_public_aggregates !== false,
  )
  const [includeSource, setIncludeSource] = useState(profile?.include_in_public_aggregates)
  if (profile?.include_in_public_aggregates !== includeSource) {
    setIncludeSource(profile?.include_in_public_aggregates)
    setIncludeInPublic(profile?.include_in_public_aggregates !== false)
  }
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [profileNote, setProfileNote] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordNote, setPasswordNote] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [avatarRefresh, setAvatarRefresh] = useState(0)
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(normalizeAvatarStyle(profile?.avatar_style))
  const [styleSource, setStyleSource] = useState(profile?.avatar_style)
  const [savingStyle, setSavingStyle] = useState(false)
  const [styleError, setStyleError] = useState('')
  const [pendingStyle, setPendingStyle] = useState<AvatarStyle | null>(null)
  if (profile?.avatar_style !== styleSource) {
    setStyleSource(profile?.avatar_style)
    if (pendingStyle == null) setAvatarStyle(normalizeAvatarStyle(profile?.avatar_style))
  }
  const [linked, setLinked] = useState(() => LINKEDIN_CONNECT_ENABLED && linkedInLinked())
  const [liNote, setLiNote] = useState('')
  const [liError, setLiError] = useState<'' | 'cancel' | 'tech'>('')
  const [liBusy, setLiBusy] = useState(false)
  const oauthSeen = useRef('')
  const tagEdited = useRef(false)
  const { hash } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  useNoIndex('Profile | Board Arabia')

  function applyLinkedIn(patch: LinkedInProfilePatch, refreshed: boolean) {
    if (patch.full_name) setFullName(patch.full_name)
    if (patch.headline) setHeadline(patch.headline)
    if (patch.company) setCompany(patch.company)
    if (patch.linkedin_url) setLinkedin(patch.linkedin_url)
    if (patch.photo_saved) setAvatarRefresh((value) => value + 1)
    setLinked(true)
    setLiError('')
    setLiNote(refreshed ? LINKEDIN_COPY.refreshSuccess : LINKEDIN_COPY.success)
    void reload()
  }

  const applyLinkedInRef = useRef(applyLinkedIn)
  useEffect(() => {
    applyLinkedInRef.current = applyLinkedIn
  })

  useEffect(() => {
    const code = searchParams.get('code')
    const oauthError = searchParams.get('error')
    const state = searchParams.get('state')
    if (!code && !oauthError) return
    const token = `${oauthError ?? ''}:${state ?? ''}:${code ?? ''}`
    if (oauthSeen.current === token) return
    oauthSeen.current = token
    const next = new URLSearchParams(searchParams)
    next.delete('code')
    next.delete('state')
    next.delete('error')
    next.delete('error_description')
    setSearchParams(next, { replace: true })
    if (!LINKEDIN_CONNECT_ENABLED) return
    const returnedState = state
    void Promise.resolve().then(() => {
      if (oauthError) {
        setLiError(oauthError === 'access_denied' ? 'cancel' : 'tech')
        return
      }
      if (!code || !returnedState || !linkedInStateMatches(returnedState)) {
        setLiError('tech')
        return
      }
      setLiBusy(true)
      void finishLinkedInConnect(code, returnedState).then((result) => {
        setLiBusy(false)
        if (result.status === 'applied') {
          applyLinkedInRef.current(result.profile, result.refreshed)
          return
        }
        setLiError(result.status === 'cancelled' ? 'cancel' : 'tech')
      })
    })
  }, [searchParams, setSearchParams])

  async function onLinkedIn() {
    if (!LINKEDIN_CONNECT_ENABLED) return
    setLiError('')
    setLiNote('')
    setLiBusy(true)
    const result = await startLinkedInConnect()
    if (result.status === 'authorize') {
      window.location.assign(result.url)
      return
    }
    setLiBusy(false)
    if (result.status === 'off') return
    setLiError(result.status === 'cancelled' ? 'cancel' : 'tech')
  }

  function onManualProfile() {
    document.getElementById('profile-name')?.focus()
  }

  useEffect(() => {
    if (tagsFromProfile) return
    let cancelled = false
    const columns = 'availability, sector_tags, vision_themes' as const
    void supabase
      .from('profiles')
      .select(columns)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          if (schemaMissing(error.message)) {
            setTagStatus('ready')
            return
          }
          setTagStatus('error')
          return
        }
        if (!tagEdited.current) {
          setAvailability(isAvailability(data?.availability) ? data.availability : null)
          setSectors(normalizeTags(data?.sector_tags, SECTOR_TAGS))
          setThemes(normalizeTags(data?.vision_themes, VISION_2030_THEMES))
        }
        setTagStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [userId, tagAttempt, tagsFromProfile])

  useEffect(() => {
    if (hash !== '#password') return
    let frame = 0
    const jump = () => {
      const form = document.getElementById('password')
      if (!(form instanceof HTMLElement)) return
      const scroller = form.closest('.shell-main')
      if (scroller instanceof HTMLElement) {
        const top =
          form.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12
        scroller.scrollTop = Math.max(0, top)
      } else {
        form.scrollIntoView({ block: 'start' })
      }
      const input = form.querySelector('input')
      if (input instanceof HTMLInputElement) input.focus({ preventScroll: true })
    }
    jump()
    frame = requestAnimationFrame(jump)
    return () => cancelAnimationFrame(frame)
  }, [hash])

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileError('')
    setProfileNote('')
    const linkedinUrl = linkedin.trim()
    if (linkedinUrl && !/^https:\/\/\S+$/.test(linkedinUrl)) {
      setProfileError('LinkedIn needs a full https link, or leave it blank.')
      return
    }
    const calendarUrl = calendar.trim()
    if (calendarUrl && (!/^https:\/\/\S+$/.test(calendarUrl) || calendarUrl.includes('@'))) {
      setProfileError('Calendar needs a full https link, or leave it blank.')
      return
    }
    if (fullName.trim().length > 200 || bio.trim().length > 2000) {
      setProfileError('Shorten the name or the bio.')
      return
    }

    const base = {
      full_name: emptyToNull(fullName),
      headline: emptyToNull(headline),
      company: emptyToNull(company),
      location: emptyToNull(location),
      linkedin_url: linkedinUrl || null,
      phone: emptyToNull(phone),
      bio: emptyToNull(bio),
      include_in_public_aggregates: includeInPublic,
      ...(calendarKnown || calendarUrl ? { calendar_url: calendarUrl || null } : {}),
    }
    const tagsReady = tagStatus === 'ready'
    const withTags = tagsReady
      ? { ...base, availability, sector_tags: sectors, vision_themes: themes }
      : base

    setSavingProfile(true)
    let saved = await supabase.from('profiles').update(withTags).eq('user_id', userId)
    if (saved.error && schemaMissing(saved.error.message) && 'calendar_url' in withTags) {
      const rest = { ...withTags }
      delete rest.calendar_url
      saved = await supabase.from('profiles').update(rest).eq('user_id', userId)
    }
    if (saved.error && tagsReady && schemaMissing(saved.error.message)) {
      const rest = { ...base }
      delete rest.calendar_url
      saved = await supabase.from('profiles').update(rest).eq('user_id', userId)
      setSavingProfile(false)
      if (saved.error) {
        setProfileError(saved.error.message)
        return
      }
      setProfileNote('Profile saved. Availability and tags are not available yet.')
      await reload()
      return
    }
    setSavingProfile(false)
    if (saved.error) {
      setProfileError(saved.error.message)
      return
    }
    setProfileNote('Profile saved.')
    await reload()
  }

  async function onSetPassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordNote('')
    if (password.length < 12) {
      setPasswordError('Use at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setPasswordError('Those passwords do not match.')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setSavingPassword(false)
      setPasswordError(error.message)
      return
    }
    const { data: cleared, error: flagError } = await supabase
      .from('members')
      .update({ must_set_password: false })
      .eq('user_id', userId)
      .select('must_set_password')
      .maybeSingle()
    setSavingPassword(false)
    if (flagError || !cleared || cleared.must_set_password) {
      setPasswordNote('Password saved. Refresh if the reminder stays.')
      return
    }
    setPassword('')
    setConfirm('')
    setPasswordNote('Password saved.')
    await reload()
  }

  async function onAvatarStyle(patch: { avatar_style: AvatarStyle }) {
    setStyleError('')
    setSavingStyle(true)
    setPendingStyle(patch.avatar_style)
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId)
    setSavingStyle(false)
    if (error) {
      setStyleError('Could not save the default picture.')
      return
    }
    setPendingStyle(null)
    setAvatarStyle(patch.avatar_style)
    await reload()
  }

  return (
    <div className="max-w-xl">
      <div className="space-y-3">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
          Profile
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[2.4rem] font-bold tracking-[-0.04em]">
            Your details
          </h1>
          {member.seat === 'sponsor' && <SponsorBadge />}
        </div>
        <p className="text-[1.02rem] leading-relaxed text-ink/60">
          Admitted members see your directory card. Keep these details current.
        </p>
        <p className="text-[0.92rem] text-ink/45">{email}</p>
      </div>
      <ProfileChecklist
        name={fullName}
        passwordSet={!member.must_set_password}
        linkedin={linkedin}
        photo={Boolean(profile?.avatar_path)}
        showTags={tagStatus === 'ready'}
        availabilitySet={availability != null}
        sectorSet={sectors.length > 0}
      />

      {member.must_set_password ? (
        <LinkedInConnect
          placement="signup"
          linked={linked}
          note={liNote}
          errorKind={liError}
          busy={liBusy}
          onConnect={() => void onLinkedIn()}
          onDismiss={() => setLiError('')}
          onManual={onManualProfile}
        />
      ) : null}

      <div className="mt-8">
        <MemberAvatar preview={preview} refreshKey={avatarRefresh} />
      </div>

      <div className="mt-6">
        <DefaultPicturePicker
          value={pendingStyle ?? avatarStyle}
          disabled={savingStyle || !profile}
          onSave={(patch) => void onAvatarStyle(patch)}
        />
        <p className="mt-2 max-w-sm text-[0.95rem] leading-relaxed text-ink/60">{DEFAULT_PICTURE_NOTE}</p>
        {styleError ? (
          <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {styleError}{' '}
            {pendingStyle ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center border-b border-brass font-semibold text-ink"
                onClick={() => void onAvatarStyle({ avatar_style: pendingStyle })}
              >
                Try again
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      {member.must_set_password ? null : (
        <LinkedInConnect
          placement="profile"
          linked={linked}
          note={liNote}
          errorKind={liError}
          busy={liBusy}
          onConnect={() => void onLinkedIn()}
          onDismiss={() => setLiError('')}
          onManual={onManualProfile}
        />
      )}

      <form onSubmit={onSaveProfile} className="mt-8 space-y-5">
        <Field id="profile-name" label="Name" value={fullName} onChange={setFullName} autoComplete="name" />
        <Field label="Headline" value={headline} onChange={setHeadline} />
        <Field label="Company" value={company} onChange={setCompany} autoComplete="organization" />
        <Field label="Location" value={location} onChange={setLocation} autoComplete="address-level2" />
        {tagStatus === 'loading' ? (
          <div aria-busy="true" aria-label="Loading availability and tags" className="space-y-3">
            <div className="h-11 bg-[var(--ba-lavender)] motion-reduce:animate-none animate-pulse" />
            <div className="h-11 bg-[var(--ba-lavender)] motion-reduce:animate-none animate-pulse" />
          </div>
        ) : null}
        {tagStatus === 'error' ? (
          <div className="space-y-3">
            <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
              Could not load availability and tags.
            </p>
            <button
              type="button"
              className="inline-flex min-h-11 items-center border border-ink/20 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
              onClick={() => {
                setTagStatus('loading')
                setTagAttempt((value) => value + 1)
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {tagStatus === 'ready' ? (
          <ProfileTagFields
            availability={availability}
            sectors={sectors}
            themes={themes}
            limitNote={tagNote}
            onAvailability={(value) => {
              tagEdited.current = true
              setAvailability((current) => (current === value ? null : value))
            }}
            onSector={(tag) => {
              tagEdited.current = true
              const result = toggleTag(sectors, tag, SECTOR_TAGS)
              setSectors(result.next)
              setTagNote(result.limited ? 'Three sectors is the limit.' : '')
            }}
            onTheme={(tag) => {
              tagEdited.current = true
              const result = toggleTag(themes, tag, VISION_2030_THEMES)
              setThemes(result.next)
              setTagNote(result.limited ? 'Three Vision 2030 themes is the limit.' : '')
            }}
          />
        ) : null}
        <Field
          label="LinkedIn URL"
          value={linkedin}
          onChange={setLinkedin}
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          autoComplete="url"
        />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
        <Field
          label="Calendar link"
          value={calendar}
          onChange={setCalendar}
          type="url"
          placeholder="https://example.com/calendar"
          autoComplete="url"
        />
        <p className="-mt-2 text-[0.92rem] leading-relaxed text-ink/55">
          Optional. Shared only after an introduction is accepted.
        </p>
        <label className="block">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
            Short note
          </span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
            maxLength={2000}
            className={fieldClass}
          />
        </label>
        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.98rem] leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={includeInPublic}
              onChange={(event) => setIncludeInPublic(event.target.checked)}
              className="size-6 shrink-0"
            />
            <span>
              Include my capacity in Board Arabia&apos;s public platform totals
              (never shown individually).
            </span>
          </label>
          <p className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{PLATFORM_TOTALS_NOTE}</p>
        </div>
        <CapacityOnFile profile={profile} />
        {profileError && (
          <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
            {profileError}
          </p>
        )}
        {profileNote && <p className="text-[0.92rem] text-ink/70">{profileNote}</p>}
        <button
          type="submit"
          disabled={savingProfile || !profile}
          className="ba-primary px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : profileError ? 'Retry' : 'Save profile'}
        </button>
        {!profile && (
          <p className="text-[0.92rem] text-ink/50">
            The profile record is missing. Ask admin to admit this seat again.
          </p>
        )}
      </form>

      <form id="password" onSubmit={onSetPassword} className="mt-16 scroll-mt-24 border-t border-ink/10 pt-10">
        <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">
          Password
        </h2>
        <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
          {member.must_set_password
            ? 'Replace the invitation with a password only you know.'
            : 'Choose a new password for this dashboard.'}
        </p>
        <div className="mt-6 space-y-5">
          <Field
            label="New password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="new-password"
          />
          <Field
            label="Confirm"
            value={confirm}
            onChange={setConfirm}
            type="password"
            autoComplete="new-password"
          />
        </div>
        {passwordError && (
          <p className="mt-4 text-[0.92rem] text-[var(--ba-error)]" role="alert">
            {passwordError}
          </p>
        )}
        {passwordNote && <p className="mt-4 text-[0.92rem] text-ink/70">{passwordNote}</p>}
        <button
          type="submit"
          disabled={savingPassword}
          className="ba-primary mt-6 px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50"
        >
          {savingPassword ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}

function ProfileChecklist({
  name,
  passwordSet,
  linkedin,
  photo,
  showTags,
  availabilitySet,
  sectorSet,
}: {
  name: string
  passwordSet: boolean
  linkedin: string
  photo: boolean
  showTags: boolean
  availabilitySet: boolean
  sectorSet: boolean
}) {
  const items: { label: string; done: boolean; doneLabel?: string }[] = [
    { label: 'Name on file', done: name.trim().length > 0 },
    { label: 'Password set', done: passwordSet, doneLabel: 'Set' },
    { label: 'Photo', done: photo },
    { label: 'LinkedIn link', done: linkedin.trim().length > 0 },
  ]
  if (showTags) {
    items.push(
      { label: 'Availability', done: availabilitySet },
      { label: 'Sector tag', done: sectorSet },
    )
  }
  if (items.every((item) => item.done)) return null
  return (
    <ul className="mt-3 border border-ink/10 bg-white/50 px-5 py-5" aria-label="Incomplete profile">
      {items.map((item) => (
        <li key={item.label} className="flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
          <span>{item.label}</span>
          <span className={item.done ? 'text-ink/45' : 'text-brass'}>{item.done ? item.doneLabel ?? 'Done' : 'Needed'}</span>
        </li>
      ))}
    </ul>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={fieldClass}
      />
    </label>
  )
}

function CapacityOnFile({ profile }: { profile: ProfileRow | null }) {
  if (!profile) return null
  const lines = [
    line('Investable capacity', readNumeric(profile.investable_capacity_usd)),
    line('Family office AUM', readNumeric(profile.fo_aum_usd)),
    line('Business turnover', readNumeric(profile.turnover_usd)),
  ].filter((item): item is string => item != null)
  if (lines.length === 0) return null
  return (
    <div className="border border-ink/10 bg-white/40 px-4 py-4 text-[0.92rem] leading-relaxed text-ink/60">
      <p>Held by the desk. Not published as an individual amount.</p>
      <ul className="mt-2 space-y-1">
        {lines.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-2">
        {profile.capacity_verified
          ? 'Verified. It can enter a public sum while the box above stays checked.'
          : 'Not verified yet, so this figure is not in the public totals.'}
      </p>
    </div>
  )
}

function line(label: string, amount: number | null) {
  if (amount == null || amount <= 0) return null
  return `${label}: ${formatPrivateUsd(amount)}`
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
