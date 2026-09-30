import { useMemo, useState } from 'react'
import { buildUtmLink } from '../lib/utmLink'

const SOURCES = ['linkedin', 'email', 'whatsapp', 'x', 'google', 'meta', 'member-invite'] as const
const MEDIUMS = ['social', 'paid_social', 'email', 'referral', 'cpc', 'display', 'qr', 'partner'] as const

export function UtmBuilder({ tone = 'member' }: { tone?: 'member' | 'staff' }) {
  const [path, setPath] = useState('/')
  const [source, setSource] = useState<string>('linkedin')
  const [medium, setMedium] = useState<string>('social')
  const [campaign, setCampaign] = useState('2026-10-founding-100')
  const [content, setContent] = useState('post-01')
  const [copied, setCopied] = useState(false)
  const link = useMemo(
    () => buildUtmLink({ path, source, medium, campaign, content }),
    [path, source, medium, campaign, content],
  )
  const field =
    tone === 'staff'
      ? 'mt-2 w-full min-h-11 border border-white/15 bg-white/5 px-3 text-[1rem] text-pearl'
      : 'mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem]'
  const label = tone === 'staff' ? 'text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/50 uppercase' : 'text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase'

  return (
    <section className="mt-8" data-screen="utm-builder">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Campaign link</h2>
      <p className={`mt-2 text-[0.95rem] leading-relaxed ${tone === 'staff' ? 'text-pearl/65' : 'text-ink/65'}`}>
        Lowercase, hyphens, no names. Copy the link before you post it.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Path</span>
          <input className={field} value={path} onChange={(event) => setPath(event.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Source</span>
          <select className={field} value={source} onChange={(event) => setSource(event.target.value)}>
            {SOURCES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Medium</span>
          <select className={field} value={medium} onChange={(event) => setMedium(event.target.value)}>
            {MEDIUMS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Campaign</span>
          <input className={field} value={campaign} onChange={(event) => setCampaign(event.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Content</span>
          <input className={field} value={content} onChange={(event) => setContent(event.target.value)} />
        </label>
      </div>
      <p className="mt-4 break-all text-[0.95rem]">{link}</p>
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center underline"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(() => setCopied(true))
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </section>
  )
}
