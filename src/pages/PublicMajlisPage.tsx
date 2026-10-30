import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { mainLandmarkProps } from '../components/SkipLink'
import { TurnstileField } from '../components/TurnstileField'
import { legalField } from '../config/legal'
import { publicHref } from '../content/seo'
import { formatUpdated } from '../shell/destinations'
import {
  PUBLIC_MAJLIS_CONSENT,
  PUBLIC_MAJLIS_MAIL,
  PUBLIC_MAJLIS_REGIONS,
  PUBLIC_MAJLIS_ROLES,
  formatPublicWhen,
  placeLabel,
  presentPublicMajlis,
  publicMajlisReply,
  validatePublicMajlis,
  type PublicMajlisEvent,
} from '../lib/publicMajlis'
import { clearPublicMajlisDraft, readPublicMajlisDraft, savePublicMajlisDraft } from '../lib/publicMajlisDraft'
import { registerCandidate, supabase } from '../lib/supabase'
import { readSubmitAttribution } from '../lib/tracking/touch'
import { useNoIndex } from '../lib/usePageTitle'
import { rememberVerifyEmail } from '../lib/verifyEmail'

const fieldClass =
  'mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem] text-ink outline-none focus:border-[var(--ba-indigo)]'
const labelClass = 'text-[0.72rem] font-semibold tracking-[0.08em] text-ink/50 uppercase'
const card = 'border border-[var(--ba-line)] bg-white px-5 py-5'

/** Surface: marketing. Job: request a place at a virtual majlis. */
export function PublicMajlisPage() {
  const { eventId = '' } = useParams()
  const wanted = /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : ''
  useNoIndex('Request a majlis place | Board Arabia')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [events, setEvents] = useState<PublicMajlisEvent[]>([])
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const [thanks, setThanks] = useState<'account' | 'signed-in' | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      const email = data.session?.user.email || ''
      setSignedIn(Boolean(data.session))
      setSessionEmail(email)
      const listed = await supabase.rpc('list_public_majlis')
      if (cancelled) return
      if (listed.error) {
        setState('error')
        setUpdatedLabel(formatUpdated(new Date()))
        return
      }
      const next = presentPublicMajlis(listed.data)
      setEvents(next)
      setUpdatedLabel(formatUpdated(new Date()))
      setState(next.length === 0 ? 'empty' : 'ready')
      if (!data.session) return
      const draft = readPublicMajlisDraft()
      if (!draft || (wanted && draft.eventId !== wanted)) return
      const { error } = await supabase.rpc('submit_own_majlis_application', {
        p_event: draft.eventId,
        p_snapshot: { ...draft.snapshot, company_fax: '' },
        p_consent: draft.consent,
      })
      if (cancelled || error) return
      clearPublicMajlisDraft()
      setThanks('signed-in')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, wanted])

  const event = wanted ? events.find((item) => item.id === wanted) || null : null
  const closed = Boolean(eventId) && state === 'ready' && !event

  return (
    <>
      <Nav />
      <main {...mainLandmarkProps} className="min-h-dvh bg-pearl px-5 pt-24 pb-20 md:px-10 md:pt-28" data-screen="public-majlis">
        <div className="mx-auto max-w-3xl">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Virtual majlis</p>
          <h1 className="mt-2 font-display text-[clamp(2rem,4.5vw,3.1rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            Request a place
          </h1>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-ink/75">
            A virtual majlis is for Chairpersons, Board members, and C-suite executives. A free Board Arabia account is required. It is not membership. Our admin team reviews the request after you confirm your email. The Join link stays inside your account.
          </p>
          <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-ink/65">
            The session runs on Google Meet, with questions and polls. This page does not show the Join link.
          </p>
          {updatedLabel ? <p className="mt-3 text-[0.92rem] text-ink/55">{updatedLabel}</p> : null}

          {state === 'loading' ? (
            <div className="mt-8 space-y-3" aria-busy="true" data-state="loading">
              <p className="text-[1rem] text-ink/60">Loading open majlis.</p>
              <div className={`${card} h-28 bg-[var(--ba-lavender-mist)]`} />
              <div className={`${card} h-28 bg-[var(--ba-lavender-mist)]`} />
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="mt-8" data-state="error" role="alert">
              <p className="text-[1rem] text-ink/75">Could not load majlis.</p>
              <button
                type="button"
                className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
                onClick={() => {
                  setState('loading')
                  setAttempt((value) => value + 1)
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {state === 'empty' ? (
            <div className={`${card} mt-8`} data-state="empty">
              <p className="text-[1rem] leading-relaxed text-ink/75">No virtual majlis is open for requests right now.</p>
              <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/60">
                Questions: {legalField('contactEmail')}
              </p>
            </div>
          ) : null}

          {state === 'ready' && !eventId ? (
            <ul className="mt-8 space-y-4">
              {events.map((item) => (
                <li key={item.id}>
                  <EventCard item={item} />
                </li>
              ))}
            </ul>
          ) : null}

          {closed ? (
            <div className={`${card} mt-8`} data-state="closed">
              <p className="text-[1rem] leading-relaxed text-ink/75">This majlis is not open for requests.</p>
              <Link to="/majlis" className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] underline">
                See open majlis
              </Link>
            </div>
          ) : null}

          {event && thanks ? <Thanks kind={thanks} /> : null}
          {event && !thanks ? (
            <RequestForm
              event={event}
              signedIn={signedIn}
              sessionEmail={sessionEmail}
              onThanks={setThanks}
            />
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  )
}

function EventCard({ item }: { item: PublicMajlisEvent }) {
  return (
    <article className={card} data-event={item.id} data-place={item.place}>
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">{placeLabel(item.place)}</p>
      <h2 className="mt-2 font-display text-[1.45rem] font-semibold tracking-[-0.02em]">{item.title}</h2>
      <p className="mt-2 text-[0.98rem] text-ink/70">{formatPublicWhen(item.startsAt)}</p>
      {item.region ? <p className="mt-1 text-[0.98rem] text-ink/70">{item.region}</p> : null}
      {item.description ? <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{item.description}</p> : null}
      {item.focusTags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {item.focusTags.map((tag) => (
            <li key={tag} className="border border-[var(--ba-line)] px-2 py-1 text-[0.85rem] text-ink/70">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        to={`/majlis/${item.id}`}
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
      >
        Request a place
      </Link>
    </article>
  )
}

function Thanks({ kind }: { kind: 'account' | 'signed-in' }) {
  return (
    <div className={`${card} mt-8`} data-state="thanks" role="status">
      <h2 className="font-display text-[1.45rem] font-semibold">{publicMajlisReply()}</h2>
      {kind === 'account' ? <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">{PUBLIC_MAJLIS_MAIL}</p> : null}
      {kind === 'signed-in' ? (
        <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">
          Our admin team reviews it after your email is confirmed. You can see the request in your account.
        </p>
      ) : (
        <Link to="/register/verify" className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] underline">
          Enter the code from your email
        </Link>
      )}
    </div>
  )
}

function RequestForm({
  event,
  signedIn,
  sessionEmail,
  onThanks,
}: {
  event: PublicMajlisEvent
  signedIn: boolean
  sessionEmail: string
  onThanks: (kind: 'account' | 'signed-in') => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [why, setWhy] = useState('')
  const [region, setRegion] = useState('')
  const [consent, setConsent] = useState(false)
  const [companyFax, setCompanyFax] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formStartedAt] = useState(() => Date.now())
  const turnstileOn = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim())
  const blocked = submitting || (turnstileOn && !token)

  async function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setError('')
    const parsed = validatePublicMajlis({
      fullName,
      email: signedIn ? sessionEmail : email,
      company,
      role,
      phone,
      linkedin,
      why,
      consent,
      region,
      signedIn,
    })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (turnstileOn && !token) {
      setError('Complete the security check, then try again.')
      return
    }
    setSubmitting(true)
    if (signedIn) {
      const { data, error: rpcError } = await supabase.rpc('submit_own_majlis_application', {
        p_event: event.id,
        p_snapshot: { ...parsed.snapshot, company_fax: companyFax },
        p_consent: PUBLIC_MAJLIS_CONSENT,
      })
      setSubmitting(false)
      if (rpcError) {
        const message = rpcError.message || ''
        if (message.includes('phone')) {
          setError('Enter a phone number with a country code, such as +966 or +44.')
          return
        }
        if (message.includes('consent')) {
          setError('Agree to the Terms and Privacy notice to continue.')
          return
        }
        if (message.includes('missing_fields')) {
          setError('Name, company, and role are required.')
          return
        }
        setError('Could not send the request. Try again.')
        return
      }
      const code =
        data && typeof data === 'object' && 'error_code' in data
          ? String((data as { error_code?: unknown }).error_code || '')
          : ''
      if (code === 'rate_limited') {
        setError('Too many attempts. Try again later.')
        return
      }
      onThanks('signed-in')
      return
    }

    const result = await registerCandidate({
      full_name: parsed.snapshot.full_name,
      email: parsed.email,
      role: parsed.roleId,
      region: parsed.region,
      consent: true,
      turnstile_token: token,
      company_fax: companyFax,
      form_started_at: formStartedAt,
      ...readSubmitAttribution(),
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    savePublicMajlisDraft({
      eventId: event.id,
      snapshot: parsed.snapshot,
      consent: PUBLIC_MAJLIS_CONSENT,
    })
    rememberVerifyEmail(parsed.email)
    onThanks('account')
  }

  return (
    <form className={`${card} relative mt-8 space-y-5`} onSubmit={(formEvent) => void onSubmit(formEvent)} data-event={event.id}>
      <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">{event.title}</h2>
      <p className="text-[0.98rem] text-ink/70">{formatPublicWhen(event.startsAt)}</p>
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase" data-place={event.place}>
        {placeLabel(event.place)}
      </p>
      {event.place === 'full' ? (
        <p className="text-[0.98rem] leading-relaxed text-ink/70">
          This majlis is full. You can still send a request and join the waitlist.
        </p>
      ) : null}
      <p className="text-[0.98rem] leading-relaxed text-ink/70">
        {signedIn
          ? 'You are signed in. This request uses your account.'
          : 'A free account is required. Full members reply from the member Majlis page.'}
      </p>

      <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
        <label>
          Fax
          <input tabIndex={-1} autoComplete="off" value={companyFax} onChange={(change) => setCompanyFax(change.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Full name</span>
        <input required value={fullName} onChange={(change) => setFullName(change.target.value)} className={fieldClass} autoComplete="name" />
      </label>
      <label className="block">
        <span className={labelClass}>Work email</span>
        {signedIn ? (
          <p className="mt-2 text-[1rem]">{sessionEmail || 'Signed in'}</p>
        ) : (
          <input required type="email" value={email} onChange={(change) => setEmail(change.target.value)} className={fieldClass} autoComplete="email" />
        )}
      </label>
      <label className="block">
        <span className={labelClass}>Company</span>
        <input required value={company} onChange={(change) => setCompany(change.target.value)} className={fieldClass} autoComplete="organization" />
      </label>
      <label className="block">
        <span className={labelClass}>Role</span>
        <select required value={role} onChange={(change) => setRole(change.target.value)} className={fieldClass}>
          <option value="">Choose a role</option>
          {PUBLIC_MAJLIS_ROLES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {signedIn ? null : (
        <label className="block">
          <span className={labelClass}>Region</span>
          <select required value={region} onChange={(change) => setRegion(change.target.value)} className={fieldClass}>
            <option value="">Choose a region</option>
            {PUBLIC_MAJLIS_REGIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className={labelClass}>Phone</span>
        <input
          required
          type="tel"
          value={phone}
          onChange={(change) => setPhone(change.target.value)}
          className={fieldClass}
          autoComplete="tel"
          placeholder="+966"
          aria-describedby="phone-hint"
        />
        <span id="phone-hint" className="mt-2 block text-[0.92rem] leading-relaxed text-ink/60">
          Include the country code. Saudi Arabia uses +966. The United Kingdom uses +44.
        </span>
      </label>
      <label className="block">
        <span className={labelClass}>LinkedIn, optional</span>
        <input value={linkedin} onChange={(change) => setLinkedin(change.target.value)} className={fieldClass} autoComplete="url" placeholder="https://www.linkedin.com/in/" />
      </label>
      <label className="block">
        <span className={labelClass}>Why attend, optional</span>
        <textarea value={why} onChange={(change) => setWhy(change.target.value)} rows={4} className={fieldClass} />
      </label>
      <label className="flex min-h-11 items-start gap-3 text-[0.98rem] leading-relaxed">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(change) => setConsent(change.target.checked)} required />
        <span>
          I agree to the <Link to={publicHref('/terms')} className="underline">Terms</Link> and have read the <Link to={publicHref('/privacy')} className="underline">Privacy Notice</Link>
        </span>
      </label>
      {/* LEGAL CHANGE: majlis request notice. Legal clears this before merge. */}
      <p className="text-[0.92rem] leading-relaxed text-ink/60">
        Requesting a place creates a free Board Arabia account and means you agree to our <Link to={publicHref('/terms')} className="underline">Terms</Link>. It is not full membership. We use your name, work email, company, role and phone number to review this request and check it fits the majlis, and, if we accept it, to send your joining details and contact you about that majlis. We only send messages about this request, never marketing. Unverified accounts are deleted after 7 days. Other free accounts are deleted 12 months after your last majlis, or 12 months after a declined, undecided or cancelled request if you were never accepted. You can ask us to delete it sooner at {legalField('contactEmail')}. See our <Link to={publicHref('/terms')} className="underline">Terms</Link> and <Link to={publicHref('/privacy')} className="underline">Privacy Notice</Link>.
      </p>
      <p className="text-[0.92rem] leading-relaxed text-ink/60">
        Mail about this request is transactional only. A newsletter opt-in is not part of this form. Questions: {legalField('contactEmail')}
      </p>
      <TurnstileField onToken={setToken} />
      {error ? (
        <p className="text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="ba-primary inline-flex min-h-11 w-full items-center justify-center px-5 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40 sm:w-auto"
        disabled={blocked}
      >
        {submitting ? 'Sending…' : 'Request a place'}
      </button>
    </form>
  )
}
