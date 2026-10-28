import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ABOUT_CONTACT_WARNING, ABOUT_HELPER, ABOUT_MAX, aboutHasContact, aboutLengthError } from '../../lib/about'
import { CITIES, cityLabel, isCityKey, profileCityState, resolveProfileCity, type CityKey } from '../../lib/cities'
import { Avatar } from '../../components/Avatar'
import { DefaultPicturePicker } from '../../components/DefaultPicturePicker'
import { SponsorBadge } from '../../components/SponsorBadge'
import { DEFAULT_PICTURE_NOTE, normalizeAvatarStyle, type AvatarStyle } from '../../lib/avatarStyle'
import { formatPrivateUsd, PLATFORM_TOTALS_NOTE, readNumeric } from '../../lib/capacity'
import { useConfirmLeave } from '../../lib/confirmLeave'
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
import { profileCompleteness, profilePasswordTarget, type CompletenessRow } from '../../lib/profileCompleteness'
import {
  isAvailability,
  normalizeTags,
  SECTOR_TAGS,
  toggleTag,
  VISION_2030_THEMES,
  type Availability,
} from '../../lib/profileTags'
import { supabase } from '../../lib/supabase'
import { useSignedAvatar } from '../../lib/useSignedAvatar'
import { useNoIndex } from '../../lib/usePageTitle'
import { useMember } from './context'
import { LinkedInConnect } from './LinkedInConnect'
import { MemberAvatar } from './MemberAvatar'
import { ProfileTagFields } from './ProfileTagFields'

const fieldClass =
  'mt-2 w-full min-h-12 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

const SECTION_IDS = ['your-card', 'focus', 'profile-tags', 'private', 'boardroom']

type Draft = {
  fullName: string
  headline: string
  company: string
  cityKey: CityKey | ''
  otherCity: string
  linkedin: string
  phone: string
  calendar: string
  bio: string
  includeInPublic: boolean
  availability: Availability | null
  sectors: string
  themes: string
}

export function ProfilePage({ preview }: { preview?: { src: string | null } }) {
  const { userId, email, profile, member, reload } = useMember()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [headline, setHeadline] = useState(profile?.headline ?? '')
  const [company, setCompany] = useState(profile?.company ?? '')
  const initialCity = profileCityState(profile)
  const [cityKey, setCityKey] = useState<CityKey | ''>(initialCity.key)
  const [otherCity, setOtherCity] = useState(initialCity.other)
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
  const [includeInPublic, setIncludeInPublic] = useState(profile?.include_in_public_aggregates !== false)
  const [includeSource, setIncludeSource] = useState(profile?.include_in_public_aggregates)
  const saved = useRef<Draft>({
    fullName: profile?.full_name ?? '',
    headline: profile?.headline ?? '',
    company: profile?.company ?? '',
    cityKey: initialCity.key,
    otherCity: initialCity.other,
    linkedin: profile?.linkedin_url ?? '',
    phone: profile?.phone ?? '',
    calendar: profile?.calendar_url ?? '',
    bio: profile?.bio ?? '',
    includeInPublic: profile?.include_in_public_aggregates !== false,
    availability: isAvailability(profile?.availability) ? profile.availability : null,
    sectors: normalizeTags(profile?.sector_tags, SECTOR_TAGS).join('\n'),
    themes: normalizeTags(profile?.vision_themes, VISION_2030_THEMES).join('\n'),
  })
  if (profile?.include_in_public_aggregates !== includeSource) {
    const next = profile?.include_in_public_aggregates !== false
    setIncludeSource(profile?.include_in_public_aggregates)
    setIncludeInPublic(next)
    saved.current = { ...saved.current, includeInPublic: next }
  }
  const [profileNote, setProfileNote] = useState('')
  const [profileError, setProfileError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
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
  const photoLive = useSignedAvatar(profile?.avatar_path ?? null, avatarRefresh, preview === undefined)
  const photoSrc = preview ? preview.src : photoLive.failed ? null : photoLive.url

  function draftNow(
    next: Partial<Pick<Draft, 'fullName' | 'headline' | 'company' | 'linkedin'>> = {},
  ): Draft {
    return {
      fullName: next.fullName ?? fullName,
      headline: next.headline ?? headline,
      company: next.company ?? company,
      cityKey,
      otherCity,
      linkedin: next.linkedin ?? linkedin,
      phone,
      calendar,
      bio,
      includeInPublic,
      availability,
      sectors: sectors.join('\n'),
      themes: themes.join('\n'),
    }
  }

  function applyLinkedIn(patch: LinkedInProfilePatch, refreshed: boolean) {
    const next: Partial<Pick<Draft, 'fullName' | 'headline' | 'company' | 'linkedin'>> = {}
    if (patch.full_name) {
      setFullName(patch.full_name)
      next.fullName = patch.full_name
    }
    if (patch.headline) {
      setHeadline(patch.headline)
      next.headline = patch.headline
    }
    if (patch.company) {
      setCompany(patch.company)
      next.company = patch.company
    }
    if (patch.linkedin_url) {
      setLinkedin(patch.linkedin_url)
      next.linkedin = patch.linkedin_url
    }
    saved.current = { ...saved.current, ...next }
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
        const nextAvailability = isAvailability(data?.availability) ? data.availability : null
        const nextSectors = normalizeTags(data?.sector_tags, SECTOR_TAGS)
        const nextThemes = normalizeTags(data?.vision_themes, VISION_2030_THEMES)
        if (!tagEdited.current) {
          saved.current = {
            ...saved.current,
            availability: nextAvailability,
            sectors: nextSectors.join('\n'),
            themes: nextThemes.join('\n'),
          }
          setAvailability(nextAvailability)
          setSectors(nextSectors)
          setThemes(nextThemes)
        }
        setTagStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [userId, tagAttempt, tagsFromProfile])

  useEffect(() => {
    const id = hash.startsWith('#') ? hash.slice(1) : ''
    if (!SECTION_IDS.includes(id)) return
    let frame = 0
    const jump = () => {
      const form = document.getElementById(id)
      if (!(form instanceof HTMLElement)) return
      const header = document.querySelector('header')
      const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0
      const top = form.getBoundingClientRect().top + window.scrollY - headerHeight - 12
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    }
    jump()
    frame = requestAnimationFrame(jump)
    return () => cancelAnimationFrame(frame)
  }, [hash, tagStatus])

  const draft = draftNow()
  const dirty = tagStatus === 'ready' && !sameDraft(draft, saved.current)
  useConfirmLeave(dirty)

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
    if (fullName.trim().length > 200) {
      setProfileError('Shorten the name.')
      return
    }
    const aboutError = aboutLengthError(bio)
    if (aboutError) {
      setProfileError(aboutError)
      return
    }
    const city = resolveProfileCity(cityKey, otherCity)
    if (!city.ok) {
      setProfileError(city.error)
      return
    }

    const base = {
      full_name: emptyToNull(fullName),
      headline: emptyToNull(headline),
      company: emptyToNull(company),
      location: city.location,
      city_key: city.city_key,
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
    let savedRow = await supabase.from('profiles').update(withTags).eq('user_id', userId)
    if (savedRow.error && schemaMissing(savedRow.error.message) && 'city_key' in withTags) {
      const { city_key: droppedCity, ...rest } = withTags
      void droppedCity
      savedRow = await supabase.from('profiles').update(rest).eq('user_id', userId)
      if (savedRow.error && schemaMissing(savedRow.error.message) && 'calendar_url' in rest) {
        delete rest.calendar_url
        savedRow = await supabase.from('profiles').update(rest).eq('user_id', userId)
      }
    } else if (savedRow.error && schemaMissing(savedRow.error.message) && 'calendar_url' in withTags) {
      const rest = { ...withTags }
      delete rest.calendar_url
      savedRow = await supabase.from('profiles').update(rest).eq('user_id', userId)
    }
    if (savedRow.error && tagsReady && schemaMissing(savedRow.error.message)) {
      const { city_key: droppedCity, ...rest } = base
      void droppedCity
      delete rest.calendar_url
      savedRow = await supabase.from('profiles').update(rest).eq('user_id', userId)
      setSavingProfile(false)
      if (savedRow.error) {
        setProfileError(savedRow.error.message)
        return
      }
      setProfileNote('Profile saved. Availability and tags are not available yet.')
      saved.current = draftNow()
      tagEdited.current = false
      await reload()
      return
    }
    setSavingProfile(false)
    if (savedRow.error) {
      setProfileError(savedRow.error.message)
      return
    }
    setProfileNote('Profile saved.')
    saved.current = draftNow()
    tagEdited.current = false
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

  const passwordTarget = profilePasswordTarget(hash)
  if (passwordTarget) return <Navigate to={passwordTarget} replace />

  const cityText = previewCity(cityKey, otherCity)
  const rows = profileCompleteness({
    photo: Boolean(profile?.avatar_path) || Boolean(preview?.src),
    name: fullName,
    title: headline,
    organisation: company,
    city: cityText,
    sectorCount: sectors.length,
    availabilitySet: availability != null,
  })

  return (
    <div className={`max-w-xl ${dirty ? 'pb-24 md:pb-0' : ''}`}>
      <div className="space-y-2">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Profile</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.04em] md:text-[2.4rem]">Your details</h1>
          {member.seat === 'sponsor' && <SponsorBadge />}
        </div>
        <p className="text-[1rem] leading-relaxed text-ink/60">Admitted members see this card. Keep it current.</p>
        <p className="text-[0.92rem] text-ink/45">{email}</p>
      </div>

      <ProfileCardPreview
        name={fullName}
        title={headline}
        organisation={company}
        city={cityText}
        photoSrc={photoSrc}
        avatarStyle={pendingStyle ?? avatarStyle}
      />
      <BenefitRows rows={rows} />

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

      <form id="profile-form" onSubmit={onSaveProfile} className="mt-6 space-y-8">
        <div className="hidden md:block">
          <SaveProfileButton saving={savingProfile} error={profileError} disabled={savingProfile || !profile} />
        </div>

        <section aria-labelledby="your-card-title" className="space-y-5">
          <div id="your-card" className="scroll-mt-24">
            <h2 id="your-card-title" className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">
              Your card
            </h2>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
              Name, title, organisation, city, and photo on your directory card.
            </p>
          </div>
          <Field id="profile-name" label="Name" value={fullName} onChange={setFullName} autoComplete="name" />
          <Field id="profile-title" label="Title" value={headline} onChange={setHeadline} />
          <Field id="profile-organisation" label="Organisation" value={company} onChange={setCompany} autoComplete="organization" />
          <div id="profile-city-block">
            <label className="block" htmlFor="profile-city">
              <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">City</span>
              <select
                id="profile-city"
                value={cityKey}
                onChange={(event) => setCityKey(event.target.value as CityKey | '')}
                autoComplete="address-level2"
                className={fieldClass}
              >
                <option value="">Choose a city</option>
                {CITIES.map((city) => (
                  <option key={city.key} value={city.key}>
                    {city.label}
                  </option>
                ))}
              </select>
            </label>
            {cityKey === 'other' ? (
              <label className="mt-5 block" htmlFor="profile-city-other">
                <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">City name</span>
                <input
                  id="profile-city-other"
                  value={otherCity}
                  onChange={(event) => setOtherCity(event.target.value)}
                  maxLength={120}
                  autoComplete="address-level2"
                  placeholder="Type a city"
                  className={fieldClass}
                />
              </label>
            ) : null}
          </div>
          <label className="block" htmlFor="profile-about">
            <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">About</span>
            <textarea
              id="profile-about"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              maxLength={ABOUT_MAX}
              className={fieldClass}
            />
          </label>
          <p className="-mt-2 text-[0.92rem] leading-relaxed text-ink/55">{ABOUT_HELPER}</p>
          <p className="-mt-2 text-[0.85rem] text-ink/45">
            {bio.trim().length} / {ABOUT_MAX}
          </p>
          {aboutHasContact(bio) ? (
            <p className="-mt-2 text-[0.92rem] text-ink/70" role="status">
              {ABOUT_CONTACT_WARNING}
            </p>
          ) : null}
          <MemberAvatar preview={preview} refreshKey={avatarRefresh} />
          <div>
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
                    className="inline-flex min-h-12 items-center border-b border-brass font-semibold text-ink"
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
        </section>

        <section id="focus" aria-labelledby="focus-title" className="scroll-mt-24 space-y-5">
          <div>
            <h2 id="focus-title" className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">
              Focus
            </h2>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
              A sector and availability switch on weekly introductions. A Vision 2030 theme is a bonus.
            </p>
          </div>
          <div id="profile-tags" className="scroll-mt-24 space-y-5">
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
                  className="inline-flex min-h-12 items-center border border-ink/20 px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
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
          </div>
        </section>

        <section id="private" aria-labelledby="private-title" className="scroll-mt-24 space-y-5">
          <div>
            <h2 id="private-title" className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">
              Private
            </h2>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
              Phone, calendar, and capacity stay off your directory card.
            </p>
          </div>
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
          <div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[0.98rem] leading-relaxed text-ink">
              <input
                type="checkbox"
                checked={includeInPublic}
                onChange={(event) => setIncludeInPublic(event.target.checked)}
                className="size-6 shrink-0"
              />
              <span>Include my capacity in Board Arabia&apos;s public platform totals (never shown individually).</span>
            </label>
            <p className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{PLATFORM_TOTALS_NOTE}</p>
          </div>
          <CapacityOnFile profile={profile} />
        </section>

        {profileError ? (
          <p className="text-[0.92rem] text-[var(--ba-error)]" role="alert">
            {profileError}
          </p>
        ) : null}
        {profileNote ? <p className="text-[0.92rem] text-ink/70">{profileNote}</p> : null}
        <div className="hidden md:block">
          <SaveProfileButton saving={savingProfile} error={profileError} disabled={savingProfile || !profile} />
        </div>
        {!profile ? (
          <p className="text-[0.92rem] text-ink/50">The profile record is missing. Ask our admin team to admit this seat again.</p>
        ) : null}
      </form>

      {dirty ? (
        <div
          data-profile-save-sticky=""
          className="fixed inset-x-0 z-30 border-t border-ink/10 bg-[var(--ba-porcelain)] px-4 py-2 md:hidden"
          style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="submit"
            form="profile-form"
            disabled={savingProfile || !profile}
            className="ba-primary inline-flex min-h-12 w-full items-center justify-center px-5 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50"
          >
            {savingProfile ? 'Saving…' : profileError ? 'Retry' : 'Save profile'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function sameDraft(draft: Draft, savedDraft: Draft) {
  return (
    draft.fullName === savedDraft.fullName &&
    draft.headline === savedDraft.headline &&
    draft.company === savedDraft.company &&
    draft.cityKey === savedDraft.cityKey &&
    draft.otherCity === savedDraft.otherCity &&
    draft.linkedin === savedDraft.linkedin &&
    draft.phone === savedDraft.phone &&
    draft.calendar === savedDraft.calendar &&
    draft.bio === savedDraft.bio &&
    draft.includeInPublic === savedDraft.includeInPublic &&
    draft.availability === savedDraft.availability &&
    draft.sectors === savedDraft.sectors &&
    draft.themes === savedDraft.themes
  )
}

function previewCity(cityKey: CityKey | '', otherCity: string) {
  if (cityKey === 'other') return otherCity.trim()
  if (cityKey && isCityKey(cityKey)) return cityLabel(cityKey)
  return ''
}

function ProfileCardPreview({
  name,
  title,
  organisation,
  city,
  photoSrc,
  avatarStyle,
}: {
  name: string
  title: string
  organisation: string
  city: string
  photoSrc: string | null
  avatarStyle: AvatarStyle
}) {
  return (
    <article
      data-profile-card-preview=""
      aria-label="Directory card preview"
      className="mt-4 border border-[var(--ba-line)] bg-white px-4 py-3"
    >
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">What members see</p>
      <div className="mt-3 flex items-start gap-3">
        <Avatar src={photoSrc} avatarStyle={avatarStyle} size={56} alt="" />
        <div className="min-w-0">
          <p className="truncate font-display text-[1.2rem] font-semibold tracking-[-0.03em]">{name.trim() || 'Your name'}</p>
          <p className="mt-0.5 truncate text-[0.95rem] text-ink/70">{title.trim() || 'Title'}</p>
          <p className="mt-0.5 truncate text-[0.95rem] text-ink/80">{organisation.trim() || 'Organisation'}</p>
          <p className="mt-0.5 text-[0.85rem] text-ink/50">{city || 'City'}</p>
        </div>
      </div>
    </article>
  )
}

function BenefitRows({ rows }: { rows: readonly CompletenessRow[] }) {
  return (
    <ul aria-label="Profile benefits" data-profile-benefits="" className="mt-3 border border-ink/10 bg-white/50 px-4 py-2">
      {rows.map((item) => (
        <li key={item.id} className="flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
          <Link to={item.href} className="text-ink">
            {item.label}
          </Link>
          <span className={item.done ? 'text-ink/45' : 'font-semibold text-brass'}>
            {item.done ? <span aria-label="Done">✓</span> : item.addLabel}
          </span>
        </li>
      ))}
    </ul>
  )
}

function SaveProfileButton({
  saving,
  error,
  disabled,
}: {
  saving: boolean
  error: string
  disabled: boolean
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="ba-primary inline-flex min-h-12 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50"
    >
      {saving ? 'Saving…' : error ? 'Retry' : 'Save profile'}
    </button>
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
      <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">{label}</span>
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
      <p>Held by our admin team. Not published as an individual amount.</p>
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
