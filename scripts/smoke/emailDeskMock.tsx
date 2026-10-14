export const EMAIL_DESK_SHOTS = [
  'weekly',
  'letters',
  'results',
  'step-1',
  'step-3',
  'step-5',
  'step-6',
  'plain',
  'details',
  'contacts-list',
  'contacts-upload',
  'contacts-map',
  'contacts-basis',
  'contacts-summary',
] as const

export type EmailDeskShot = (typeof EMAIL_DESK_SHOTS)[number]

type TabId = 'weekly' | 'letters' | 'results' | 'contacts'
type Chip = 'Sending off' | 'Draft' | 'Approved' | 'Test sent' | 'Sent'

const STEPS = [
  'Write or edit',
  'Preview',
  'Choose tiers',
  'Approve',
  'Test to my address',
  'Release',
] as const

const actionClass =
  'inline-flex min-h-11 items-center border border-pearl/25 px-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40'
const fieldClass = 'mt-2 block w-full border border-pearl/20 bg-ink px-3 py-3 text-[0.95rem] text-pearl'
const labelClass = 'block text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase'

const CONTACT_ROWS = [
  ['Example Director', 'director.one@example.com', 'Example Company A', 'October briefing', 'Opted in'],
  ['Example Chair', 'chair.one@example.com', 'Example Company B', 'October briefing', 'Known contact'],
  ['Example Member', 'member.one@example.com', 'Example Company C', 'Majlis guests', 'Opted in'],
  ['Example Partner', 'partner.one@example.com', 'Example Company D', 'Majlis guests', 'Opted in'],
  ['Example Advisor', 'advisor.one@example.com', 'Example Company E', 'October briefing', 'Known contact'],
] as const

const PREVIEW_ROWS = [
  ['Example Director', 'director.one@example.com', 'Example Company A', 'Riyadh'],
  ['Example Chair', 'chair.one@example.com', 'Example Company B', 'Jeddah'],
  ['Example Member', 'member.one@example.com', 'Example Company C', 'Riyadh'],
  ['Example Partner', 'partner.one@example.com', 'Example Company D', 'Dubai'],
  ['Example Advisor', 'advisor.one@example.com', 'Example Company E', 'Riyadh'],
  ['Example Treasurer', 'treasurer.one@example.com', 'Example Company F', 'Dammam'],
  ['Example Secretary', 'secretary.one@example.com', 'Example Company G', 'Riyadh'],
  ['Example Founder', 'founder.one@example.com', 'Example Company H', 'Abu Dhabi'],
  ['Example Operator', 'operator.one@example.com', 'Example Company I', 'Riyadh'],
  ['Example Guest', 'guest.one@example.com', 'Example Company J', 'Jeddah'],
] as const

const TREND = [
  { week: 'W30', open: 28, click: 6, bounces: '6', unsubs: '6' },
  { week: 'W31', open: 31, click: 7, bounces: '8', unsubs: '5' },
  { week: 'W32', open: 29, click: 6, bounces: '6', unsubs: '6' },
  { week: 'W33', open: 34, click: 8, bounces: '7', unsubs: '<5' },
  { week: 'W34', open: 33, click: 7, bounces: '6', unsubs: '6' },
  { week: 'W35', open: 36, click: 9, bounces: '9', unsubs: '5' },
  { week: 'W36', open: 32, click: 8, bounces: '6', unsubs: '6' },
  { week: 'W37', open: 38, click: 8, bounces: '8', unsubs: '7' },
  { week: 'W38', open: 35, click: 9, bounces: '7', unsubs: '5' },
  { week: 'W39', open: 37, click: 10, bounces: '6', unsubs: '6' },
  { week: 'W40', open: 40, click: 9, bounces: '8', unsubs: '5' },
  { week: 'W41', open: 38, click: 11, bounces: '6', unsubs: '6' },
] as const

function shotState(shot: EmailDeskShot): {
  tab: TabId
  step: number
  chip: Chip
  plain: boolean
  details: boolean
  contacts: 'list' | 'upload' | 'map' | 'basis' | 'summary' | null
} {
  if (shot === 'letters') return { tab: 'letters', step: 3, chip: 'Approved', plain: false, details: false, contacts: null }
  if (shot === 'results') return { tab: 'results', step: 0, chip: 'Sent', plain: false, details: false, contacts: null }
  if (shot === 'step-1') return { tab: 'weekly', step: 0, chip: 'Draft', plain: false, details: false, contacts: null }
  if (shot === 'step-3') return { tab: 'weekly', step: 2, chip: 'Approved', plain: false, details: false, contacts: null }
  if (shot === 'step-5') return { tab: 'weekly', step: 4, chip: 'Test sent', plain: false, details: false, contacts: null }
  if (shot === 'step-6') return { tab: 'weekly', step: 5, chip: 'Sending off', plain: false, details: false, contacts: null }
  if (shot === 'plain') return { tab: 'weekly', step: 0, chip: 'Draft', plain: true, details: false, contacts: null }
  if (shot === 'details') return { tab: 'weekly', step: 1, chip: 'Draft', plain: false, details: true, contacts: null }
  if (shot === 'contacts-list') return { tab: 'contacts', step: 0, chip: 'Sending off', plain: false, details: false, contacts: 'list' }
  if (shot === 'contacts-upload') return { tab: 'contacts', step: 0, chip: 'Sending off', plain: false, details: false, contacts: 'upload' }
  if (shot === 'contacts-map') return { tab: 'contacts', step: 0, chip: 'Sending off', plain: false, details: false, contacts: 'map' }
  if (shot === 'contacts-basis') return { tab: 'contacts', step: 0, chip: 'Sending off', plain: false, details: false, contacts: 'basis' }
  if (shot === 'contacts-summary') return { tab: 'contacts', step: 0, chip: 'Sending off', plain: false, details: false, contacts: 'summary' }
  return { tab: 'weekly', step: 1, chip: 'Draft', plain: false, details: false, contacts: null }
}

export function EmailDeskMock({ shot }: { shot: EmailDeskShot }) {
  const state = shotState(shot)
  const letter = state.tab === 'letters'
  return (
    <div className="max-w-5xl" data-email-mock={shot} data-tab={state.tab}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
          <p className="mt-2 max-w-xl text-[0.95rem] text-stone/65">
            Weekly roundup, letters, results, and contacts. Nothing on this page sends by itself.
          </p>
        </div>
        <p
          data-status={state.chip}
          className="inline-flex min-h-11 items-center border border-brass-bright/50 px-3 text-[0.72rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
        >
          {state.chip}
        </p>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto" role="tablist" aria-label="Email">
        <Tab label="Weekly roundup" active={state.tab === 'weekly'} />
        <Tab label="Letters" active={state.tab === 'letters'} />
        <Tab label="Results" active={state.tab === 'results'} />
        <Tab label="Contacts" active={state.tab === 'contacts'} />
      </div>

      {state.tab === 'results' ? <Results /> : null}
      {state.tab === 'contacts' && state.contacts ? <Contacts view={state.contacts} /> : null}
      {state.tab === 'weekly' || state.tab === 'letters' ? (
        <LetterFlow
          letter={letter}
          step={state.step}
          plain={state.plain}
          details={state.details}
          releaseOff={shot === 'step-6' || state.chip === 'Sending off'}
        />
      ) : null}

      <OwnerRow />
    </div>
  )
}

function Tab({ label, active }: { label: string; active: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[0.78rem] font-semibold tracking-[0.06em] uppercase ${
        active ? 'border-brass-bright text-brass-bright' : 'border-transparent text-pearl/55'
      }`}
    >
      {label}
    </button>
  )
}

function OwnerRow() {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-pearl/10 pt-4">
      <p className="text-[0.85rem] text-pearl/55">Owner only. Sending is off.</p>
      <button type="button" aria-pressed={false} disabled className={`${actionClass} normal-case tracking-normal`}>
        Sending off
      </button>
    </div>
  )
}

function SummaryLine({ open }: { open: boolean }) {
  return (
    <div className="mt-6 border border-pearl/10 px-4 py-3" data-details={open ? 'open' : 'closed'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-summary="" className="text-[0.95rem] text-pearl/80">
          128 to send · 0 sent · Sending off
        </p>
        <button type="button" className={actionClass} aria-expanded={open}>
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>
      {open ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Count label="Eligible" value="128" />
          <Count label="Not opted in" value="14" />
          <Count label="Suppressed" value="6" />
          <Count label="Inactive" value="6" />
        </dl>
      ) : null}
    </div>
  )
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">{label}</dt>
      <dd className="mt-1 text-[1.05rem] text-pearl">{value}</dd>
    </div>
  )
}

function LetterFlow({
  letter,
  step,
  plain,
  details,
  releaseOff,
}: {
  letter: boolean
  step: number
  plain: boolean
  details: boolean
  releaseOff: boolean
}) {
  const subject = letter ? 'Invitation to the October majlis' : 'The week in brief'
  return (
    <div data-step={step + 1}>
      <p className="mt-6 text-[0.85rem] text-pearl/55">{letter ? 'News and invitations' : 'Weekly email'}</p>
      <SummaryLine open={details} />
      <ol className="mt-6 space-y-3" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} className="border border-pearl/10">
            {index === step ? (
              <div className="px-4 py-4">
                <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
                  Step {index + 1}
                </p>
                <h2 className="mt-1 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">{label}</h2>
                <StepBody
                  index={index}
                  subject={subject}
                  letter={letter}
                  plain={plain}
                  releaseOff={releaseOff}
                />
              </div>
            ) : (
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                <p className={index < step ? 'text-[0.95rem] text-pearl/80' : 'text-[0.95rem] text-pearl/40'}>
                  {index + 1}. {label}
                </p>
                {index < step ? (
                  <button type="button" className={actionClass}>
                    Edit
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function StepBody({
  index,
  subject,
  letter,
  plain,
  releaseOff,
}: {
  index: number
  subject: string
  letter: boolean
  plain: boolean
  releaseOff: boolean
}) {
  if (index === 0) return <WriteStep subject={subject} plain={plain} />
  if (index === 1) return <PreviewStep subject={subject} letter={letter} plain={plain} />
  if (index === 2) return <TierStep />
  if (index === 3) return <ApproveStep subject={subject} />
  if (index === 4) return <TestStep />
  return <ReleaseStep disabled={releaseOff} />
}

function PlainToggle({ on }: { on: boolean }) {
  return (
    <div className="mt-4" data-plain={on ? 'on' : 'off'}>
      <button type="button" className={actionClass} aria-pressed={on}>
        {on ? 'Hide plain text' : 'Show plain text'}
      </button>
      {on ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-pearl/10 px-4 py-3 text-[0.85rem] leading-relaxed text-pearl/75">
{`The week in brief

Boards are asking for a shorter note before the next meeting.

Unsubscribe: https://example.com/email/unsubscribe?t=example
Manage email preferences: https://example.com/dashboard/privacy

powered by nammco`}
        </pre>
      ) : null}
    </div>
  )
}

function WriteStep({ subject, plain }: { subject: string; plain: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      <label className={labelClass}>
        Subject
        <input className={fieldClass} readOnly value={subject} />
      </label>
      <label className={labelClass}>
        Preheader
        <input className={fieldClass} readOnly value="A short note for members" />
      </label>
      <label className={labelClass}>
        Letter
        <textarea className={`${fieldClass} min-h-32`} readOnly value="Boards are asking for a shorter note before the next meeting." />
      </label>
      <PlainToggle on={plain} />
    </div>
  )
}

function PreviewStep({ subject, letter, plain }: { subject: string; letter: boolean; plain: boolean }) {
  return (
    <div className="mt-4">
      <article className="border border-pearl/15 px-4 py-4">
        <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
          {letter ? 'Letter' : 'Week 42, 13 Oct 2026'}
        </p>
        <h3 className="mt-2 font-display text-[1.4rem] font-semibold tracking-[-0.03em]">{subject}</h3>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-pearl/80">
          Boards are asking for a shorter note before the next meeting. The useful change is timing.
        </p>
        <p className="mt-3 text-[0.95rem] text-pearl/80">
          <span className="underline">https://example.com/briefing</span>
        </p>
      </article>
      <PlainToggle on={plain} />
    </div>
  )
}

function TierStep() {
  return (
    <fieldset className="mt-4 space-y-2">
      <legend className={labelClass}>Who receives this</legend>
      <TierBox label="Founding" checked count="86" />
      <TierBox label="Member" checked count="42" />
      <TierBox label="Partner" checked={false} count="0" />
      <p className="pt-2 text-[0.95rem] text-pearl/70">128 members in the chosen tiers. No addresses are shown.</p>
    </fieldset>
  )
}

function TierBox({ label, checked, count }: { label: string; checked: boolean; count: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 border border-pearl/10 px-3">
      <span className="flex items-center gap-3">
        <input type="checkbox" disabled defaultChecked={checked} />
        <span>{label}</span>
      </span>
      <span className="text-[0.85rem] text-pearl/55">{count}</span>
    </label>
  )
}

function ApproveStep({ subject }: { subject: string }) {
  return (
    <div className="mt-4">
      <p className="text-[0.95rem] text-pearl/80">Approve "{subject}" for the chosen tiers. Approval does not send it.</p>
      <button type="button" className={`${actionClass} mt-4`}>
        Approve
      </button>
    </div>
  )
}

function TestStep() {
  return (
    <div className="mt-4">
      <p className="text-[0.95rem] text-pearl/80">
        Send one test of this version to the address on your account. Members do not receive it.
      </p>
      <button type="button" className={`${actionClass} mt-4`}>
        Send test to me
      </button>
    </div>
  )
}

function ReleaseStep({ disabled }: { disabled: boolean }) {
  return (
    <div className="mt-4" data-release={disabled ? 'disabled' : 'enabled'}>
      <p className="text-[0.95rem] text-pearl/80">Release to 128 members. This stays off while sending is off.</p>
      <label className={`${labelClass} mt-4`}>
        Type 128 to release
        <input className={fieldClass} readOnly value="" />
      </label>
      <button type="button" className={`${actionClass} mt-4`} disabled={disabled}>
        Release
      </button>
      {disabled ? <p className="mt-3 text-[0.9rem] text-pearl/60">Sending is off.</p> : null}
    </div>
  )
}

function Results() {
  return (
    <div className="mt-6" data-results="">
      <p className="text-[0.85rem] text-pearl/55">Week 41, 12 Oct 2026. Weekly email.</p>
      <p className="mt-2 text-[0.95rem] text-pearl/75">These figures count only members who turned measurement on. Opens are approximate. Some mail apps download images on their own.</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sent" value="240" />
        <Stat label="Delivered" value="228" />
        <Stat label="Opens, approximate" value="86" hint="102 total · 37.7%" />
        <Stat label="Clicks" value="24" hint="31 total · 10.5%" />
        <Stat label="Bounces" value="6" />
        <Stat label="Complaints" value="<5" />
        <Stat label="Unsubscribes" value="<5" />
        <Stat label="Click rate" value="10.5%" hint="Unique clickers / delivered" />
      </dl>

      <h2 className="mt-8 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">By tier</h2>
      <div className="mt-3 space-y-3">
        <TierCard tier="Founding" cells={[['Sent', '140'], ['Delivered', '132'], ['Opens', '54'], ['Open rate', '40.9%'], ['Clicks', '16'], ['Click rate', '12.1%']]} />
        <TierCard tier="Member" cells={[['Sent', '80'], ['Delivered', '76'], ['Opens', '26'], ['Open rate', '34.2%'], ['Clicks', '8'], ['Click rate', '10.5%']]} />
        <TierCard tier="Partner" cells={[['Sent', '20'], ['Delivered', '20'], ['Opens', '6'], ['Open rate', '30%'], ['Clicks', '<5'], ['Click rate', '<5']]} />
      </div>

      <h2 className="mt-8 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Last 12 issues</h2>
      <TrendChart />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TREND.map((row) => (
          <li key={row.week} className="border border-pearl/10 px-3 py-3 text-[0.85rem]">
            <p className="font-semibold text-pearl">{row.week}</p>
            <p className="mt-1 text-pearl/70">Open rate {row.open}%</p>
            <p className="text-pearl/70">Click rate {row.click}%</p>
            <p className="text-pearl/70">Bounces {row.bounces}</p>
            <p className="text-pearl/70">Unsubscribes {row.unsubs}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Top links</h2>
      <ul className="mt-3 space-y-2">
        <LinkRow url="https://example.com/briefing" unique="12" total="16" />
        <LinkRow url="https://example.com/majlis" unique="8" total="9" />
        <LinkRow url="https://example.com/note" unique="<5" total="<5" />
      </ul>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-pearl/10 px-3 py-3">
      <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">{label}</dt>
      <dd className="mt-2 font-display text-[1.6rem] font-semibold tracking-[-0.03em]">{value}</dd>
      {hint ? <p className="mt-1 text-[0.75rem] text-pearl/50">{hint}</p> : null}
    </div>
  )
}

function TierCard({ tier, cells }: { tier: string; cells: Array<[string, string]> }) {
  return (
    <section className="border border-pearl/10 px-3 py-3">
      <h3 className="text-[0.95rem] font-semibold text-pearl">{tier}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">{label}</dt>
            <dd className="mt-1 text-[0.95rem] text-pearl">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function LinkRow({ url, unique, total }: { url: string; unique: string; total: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border border-pearl/10 px-3 py-3">
      <span className="text-[0.9rem] text-pearl/85">{url}</span>
      <span className="text-[0.8rem] text-pearl/55">{unique} people · {total} clicks</span>
    </li>
  )
}

function TrendChart() {
  const width = 640
  const height = 200
  const left = 36
  const right = 28
  const top = 16
  const bottom = 28
  const innerW = width - left - right
  const innerH = height - top - bottom
  const x = (index: number) => left + (index / (TREND.length - 1)) * innerW
  const yRate = (value: number) => top + innerH - (value / 50) * innerH
  const yCount = (value: number) => top + innerH - (value / 12) * innerH
  const line = (points: string) => points
  const open = TREND.map((row, index) => `${x(index)},${yRate(row.open)}`).join(' ')
  const click = TREND.map((row, index) => `${x(index)},${yRate(row.click)}`).join(' ')
  const bounces = TREND.map((row, index) => `${x(index)},${yCount(Number(row.bounces))}`).join(' ')
  const unsubPoints = TREND.flatMap((row, index) => (row.unsubs === '<5' ? [] : [`${x(index)},${yCount(Number(row.unsubs))}`]))
  return (
    <figure className="mt-4 border border-pearl/10 px-2 py-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Open rate, click rate, bounces, and unsubscribes for the last 12 issues">
        {[0, 25, 50].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yRate(tick)} y2={yRate(tick)} stroke="rgba(246,245,251,0.12)" />
            <text x={4} y={yRate(tick) + 4} fill="rgba(246,245,251,0.45)" fontSize="11">{tick}%</text>
          </g>
        ))}
        <polyline fill="none" stroke="#b8896a" strokeWidth="2" points={line(open)} />
        <polyline fill="none" stroke="#a796dc" strokeWidth="2" points={line(click)} />
        <polyline fill="none" stroke="#c48a2a" strokeWidth="2" points={line(bounces)} />
        <polyline fill="none" stroke="#f6f5fb" strokeWidth="2" strokeDasharray="4 3" points={unsubPoints.join(' ')} />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[0.75rem] text-pearl/60">
        <span>Open rate, approximate</span>
        <span>Click rate</span>
        <span>Bounces</span>
        <span>Unsubscribes. W33 is under 5 and is left off the line.</span>
      </figcaption>
    </figure>
  )
}

function Contacts({ view }: { view: 'list' | 'upload' | 'map' | 'basis' | 'summary' }) {
  const section = view === 'list' ? 'contacts' : 'import'
  return (
    <div className="mt-6" data-contacts={view}>
      <ContactNav current={section} />
      <p className="mt-4 text-[0.95rem] text-pearl/70">
        Sample rows use example.com only. Non-members can receive a newsletter or a letter. They do not get account mail and they do not get site access. This import does not send.
      </p>
      {view === 'list' ? <ContactList /> : null}
      {view === 'upload' ? <ContactUpload /> : null}
      {view === 'map' ? <ContactMap /> : null}
      {view === 'basis' ? <ContactBasis /> : null}
      {view === 'summary' ? <ContactSummary /> : null}
    </div>
  )
}

function ContactNav({ current }: { current: 'lists' | 'contacts' | 'import' }) {
  const items = [
    ['lists', 'Lists'],
    ['contacts', 'Contacts'],
    ['import', 'Import'],
  ] as const
  return (
    <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Contacts">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          className={`inline-flex min-h-11 shrink-0 items-center border px-3 text-[0.75rem] font-semibold tracking-[0.06em] uppercase ${
            current === id ? 'border-brass-bright text-brass-bright' : 'border-pearl/15 text-pearl/55'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ContactList() {
  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Lists and contacts</h2>
        <button type="button" className={actionClass}>Import</button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        <li className="border border-pearl/10 px-4 py-3">
          <p className="text-[0.95rem] text-pearl">October briefing</p>
          <p className="mt-1 text-[0.85rem] text-pearl/55">86 contacts</p>
        </li>
        <li className="border border-pearl/10 px-4 py-3">
          <p className="text-[0.95rem] text-pearl">Majlis guests</p>
          <p className="mt-1 text-[0.85rem] text-pearl/55">42 contacts</p>
        </li>
      </ul>
      <ul className="mt-4 space-y-2">
        {CONTACT_ROWS.map((row) => (
          <li key={row[1]} className="border border-pearl/10 px-4 py-3">
            <p className="text-[0.95rem] text-pearl">{row[0]}</p>
            <p className="mt-1 text-[0.85rem] text-pearl/60">{row[1]}</p>
            <p className="mt-1 text-[0.85rem] text-pearl/55">{row[2]} · {row[3]} · {row[4]}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContactUpload() {
  return (
    <div>
      <h2 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Upload</h2>
      <p className="mt-2 text-[0.9rem] text-pearl/60">CSV or XLSX. Up to 5,000 rows and 5 MB.</p>
      <div className="mt-4 border border-dashed border-pearl/25 px-4 py-8 text-center">
        <p className="text-[0.95rem] text-pearl/80">contacts-example.csv</p>
        <p className="mt-2 text-[0.85rem] text-pearl/55">240 rows, under 5 MB. Columns: name, email, company, city.</p>
      </div>
      <p className="mt-3 text-[0.9rem] text-pearl/60">
        Later checks drop a bad address, a role address, a disposable domain, a duplicate, and anyone already suppressed.
      </p>
      <button type="button" className={`${actionClass} mt-4`}>Map columns</button>
    </div>
  )
}

function ContactMap() {
  const rows = [
    ['Name', 'Name'],
    ['Email', 'Email'],
    ['Company', 'Company'],
    ['City', 'Extra'],
    ['Notes', 'Do not import'],
  ]
  return (
    <div>
      <h2 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Map columns</h2>
      <p className="mt-2 text-[0.9rem] text-pearl/60">Name, email and company are required. City is kept as an extra. First 10 rows.</p>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row[0]} className="flex min-h-11 flex-wrap items-center justify-between gap-2 border border-pearl/10 px-3 py-2">
            <span className="text-[0.95rem] text-pearl/80">{row[0]}</span>
            <span className="text-[0.85rem] font-semibold tracking-[0.06em] text-brass-bright uppercase">{row[1]}</span>
          </li>
        ))}
      </ul>
      <ol className="mt-4 space-y-2">
        {PREVIEW_ROWS.map((row, index) => (
          <li key={row[1]} className="border border-pearl/10 px-3 py-3 text-[0.85rem]">
            <p className="text-pearl/45">{index + 1}</p>
            <p className="mt-1 text-pearl">{row[0]}</p>
            <p className="text-pearl/70">{row[1]}</p>
            <p className="text-pearl/55">{row[2]} · {row[3]}</p>
          </li>
        ))}
      </ol>
      <button type="button" className={`${actionClass} mt-4`}>Choose a basis</button>
    </div>
  )
}

function ContactBasis() {
  return (
    <div className="mt-4" data-basis="unset" data-import="blocked">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Consent basis</h2>
      <p className="mt-2 text-[0.9rem] text-pearl/60">contacts-example.csv. The import stays blocked until you choose a basis and write a source note.</p>
      <fieldset className="mt-4">
        <legend className={labelClass}>Basis</legend>
        <div className="mt-2 space-y-2">
          <BasisOption name="basis" label="Opted in" detail="They asked to receive letters from Board Arabia." />
          <BasisOption name="basis" label="Known contact" detail="You already know them. Legal Counsel signs this off before the first send. Sending is off." />
        </div>
      </fieldset>
      <label className={`${labelClass} mt-4`}>
        Source note
        <textarea className={`${fieldClass} min-h-24`} readOnly value="" placeholder="Where this list came from" />
      </label>
      <fieldset className="mt-4">
        <legend className={labelClass}>List</legend>
        <p className="mt-1 text-[0.85rem] text-pearl/55">Pick a list or create one. Lists can be an audience next to tiers.</p>
        <div className="mt-2 space-y-2">
          <BasisOption name="list" label="October briefing" detail="Existing list." />
          <BasisOption name="list" label="Majlis guests" detail="Existing list." />
          <BasisOption name="list" label="Create a new list" detail="Name it before import." />
        </div>
      </fieldset>
      <button type="button" className={`${actionClass} mt-4`} disabled>
        Import
      </button>
    </div>
  )
}

function BasisOption({ name, label, detail }: { name: string; label: string; detail: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3 border border-pearl/10 px-3 py-3 text-[0.95rem] text-pearl/85">
      <input type="radio" name={name} disabled defaultChecked={false} className="mt-1" />
      <span>
        <span className="block">{label}</span>
        <span className="mt-1 block text-[0.85rem] text-pearl/55">{detail}</span>
      </span>
    </label>
  )
}

function ContactSummary() {
  const skipped = [
    ['Role address', '8'],
    ['Disposable domain', '6'],
    ['Duplicate', '6'],
    ['Already a contact or member', '6'],
    ['Suppressed', '6'],
    ['Address not usable', '6'],
    ['Domain not found', '6'],
  ] as const
  return (
    <div data-import-summary="">
      <h2 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Import summary</h2>
      <p className="mt-2 text-[0.95rem] text-pearl/75">
        contacts-example.csv. 240 rows read. List: October briefing. Basis: Opted in. Source: sign-up sheet at an example event.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Added" value="196" />
        <Stat label="Skipped" value="44" />
      </dl>
      <ul className="mt-4 space-y-2">
        {skipped.map((row) => (
          <li key={row[0]} className="flex min-h-11 items-center justify-between gap-3 border border-pearl/10 px-3">
            <span className="text-[0.9rem] text-pearl/80">{row[0]}</span>
            <span className="text-[0.95rem] text-pearl">{row[1]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.9rem] text-pearl/60">No addresses are listed here. The skipped-rows file is built in the browser and is not stored.</p>
      <button type="button" className={`${actionClass} mt-4`}>Download skipped rows</button>
      <p className="mt-4 text-[0.95rem] text-pearl/70">Nothing was emailed. Sending is off.</p>
    </div>
  )
}
