import { useState, type FormEvent } from 'react'
import { formatPrivateUsd, readNumeric } from '../../lib/capacity'
import type { ProfileRow } from '../../lib/member'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { useMember } from './context'
import { MemberAvatar } from './MemberAvatar'

const fieldClass =
  'mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

export function ProfilePage() {
  const { userId, email, profile, member, reload } = useMember()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [headline, setHeadline] = useState(profile?.headline ?? '')
  const [company, setCompany] = useState(profile?.company ?? '')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [linkedin, setLinkedin] = useState(profile?.linkedin_url ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
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
  useNoIndex('Profile | Board Arabia')

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileError('')
    setProfileNote('')
    const linkedinUrl = linkedin.trim()
    if (linkedinUrl && !/^https:\/\/\S+$/.test(linkedinUrl)) {
      setProfileError('LinkedIn needs a full https link, or leave it blank.')
      return
    }
    if (fullName.trim().length > 200 || bio.trim().length > 2000) {
      setProfileError('Shorten the name or the bio.')
      return
    }

    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: emptyToNull(fullName),
        headline: emptyToNull(headline),
        company: emptyToNull(company),
        location: emptyToNull(location),
        linkedin_url: linkedinUrl || null,
        phone: emptyToNull(phone),
        bio: emptyToNull(bio),
        include_in_public_aggregates: includeInPublic,
      })
      .eq('user_id', userId)
    setSavingProfile(false)
    if (error) {
      setProfileError(error.message)
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

  return (
    <div className="max-w-xl">
      <div className="space-y-3">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
          Profile
        </p>
        <h1 className="font-display text-[2.4rem] font-bold tracking-[-0.04em]">
          Your details
        </h1>
        <p className="text-[1.02rem] leading-relaxed text-ink/60">
          Visible to you. The directory is not open, and this page does not publish a profile.
        </p>
        <p className="text-[0.92rem] text-ink/45">{email}</p>
      </div>
      <ProfileChecklist
        name={fullName}
        passwordSet={!member.must_set_password}
        linkedin={linkedin}
      />

      <div className="mt-8">
        <MemberAvatar />
      </div>

      <form onSubmit={onSaveProfile} className="mt-8 space-y-5">
        <Field label="Name" value={fullName} onChange={setFullName} autoComplete="name" />
        <Field label="Headline" value={headline} onChange={setHeadline} />
        <Field label="Company" value={company} onChange={setCompany} autoComplete="organization" />
        <Field label="Location" value={location} onChange={setLocation} autoComplete="address-level2" />
        <Field
          label="LinkedIn URL"
          value={linkedin}
          onChange={setLinkedin}
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          autoComplete="url"
        />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
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
        <label className="flex items-start gap-3 text-[0.98rem] leading-relaxed text-ink/70">
          <input
            type="checkbox"
            checked={includeInPublic}
            onChange={(event) => setIncludeInPublic(event.target.checked)}
            className="mt-1"
          />
          <span>
            Include my capacity in Board Arabia&apos;s public platform totals
            (never shown individually).
          </span>
        </label>
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
}: {
  name: string
  passwordSet: boolean
  linkedin: string
}) {
  const items = [
    { label: 'Name on file', done: name.trim().length > 0 },
    { label: 'Password set', done: passwordSet },
    { label: 'LinkedIn link', done: linkedin.trim().length > 0 },
  ]
  if (items.every((item) => item.done)) return null
  return (
    <ul className="mt-3 border border-ink/10 bg-white/50 px-5 py-5" aria-label="Incomplete profile">
      {items.map((item) => (
        <li key={item.label} className="flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
          <span>{item.label}</span>
          <span className={item.done ? 'text-ink/45' : 'text-brass'}>{item.done ? 'Done' : 'Needed'}</span>
        </li>
      ))}
    </ul>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">
        {label}
      </span>
      <input
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
