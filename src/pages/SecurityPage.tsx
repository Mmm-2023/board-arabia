import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'
import {
  COOKIES_AND_ANALYTICS,
  DD_RETENTION_LINE,
  FILES_AND_AI,
  IF_SOMETHING_GOES_WRONG,
  ISO_FOOTNOTE,
  PRIVATE_BY_DESIGN,
  SECURITY_H1,
  SECURITY_LEAD,
  SIGNING_IN,
  WHERE_DATA_LIVES,
  YOUR_RIGHTS_LEAD,
} from '../content/trust'

const sectionTitle = 'mt-10 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-ink'
const body = 'mt-3 space-y-3 text-[1.05rem] leading-relaxed text-ink/75'

export function SecurityPage() {
  const [ddRetention, setDdRetention] = useState(false)

  useEffect(() => {
    let cancelled = false
    void import('../lib/supabase').then(async ({ supabase }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) return
      const { data } = await supabase.rpc('read_dd_retention_copy')
      if (!cancelled && data === true) setDdRetention(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MarketingLayout path="/security">
      <article className="mx-auto max-w-3xl px-5 pt-12 pb-16 md:px-10 md:pt-20" data-page="security">
        <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">Trust</p>
        <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
          {SECURITY_H1}
        </h1>
        <p className="mt-6 text-[1.08rem] leading-relaxed text-ink/75">{SECURITY_LEAD}</p>

        <Section title="Private by design" items={PRIVATE_BY_DESIGN} />
        <Section title="Where your data lives" items={WHERE_DATA_LIVES} />
        <section aria-labelledby="trust-files">
          <h2 id="trust-files" className={sectionTitle}>
            Your files and AI tools
          </h2>
          <ul className={body}>
            {FILES_AND_AI.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {ddRetention ? <li data-dd-retention="on">{DD_RETENTION_LINE}</li> : null}
          </ul>
        </section>
        <Section title="Signing in" items={SIGNING_IN} />

        <section aria-labelledby="trust-running">
          <h2 id="trust-running" className={sectionTitle}>
            Keeping it running
          </h2>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/75">
            Data we no longer need is deleted on a published schedule. See our{' '}
            <Link to="/privacy" className="border-b border-brass text-ink">
              Privacy Notice
            </Link>
            .
          </p>
        </section>

        <Section title="Cookies and analytics" items={[COOKIES_AND_ANALYTICS]} />
        <Section title="If something goes wrong" items={[IF_SOMETHING_GOES_WRONG]} />

        <section aria-labelledby="trust-rights">
          <h2 id="trust-rights" className={sectionTitle}>
            Your rights
          </h2>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/75">
            {YOUR_RIGHTS_LEAD} Members can also manage visibility and download their data from{' '}
            <Link to="/dashboard/privacy" className="border-b border-brass text-ink">
              Your privacy
            </Link>
            .
          </p>
        </section>

        <p className="mt-12 text-[0.8125rem] leading-relaxed text-[var(--ba-muted)]" data-trust-footnote="">
          {ISO_FOOTNOTE}
        </p>
      </article>
    </MarketingLayout>
  )
}

function Section({ title, items }: { title: string; items: readonly string[] }) {
  const id = `trust-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={sectionTitle}>
        {title}
      </h2>
      <ul className={body}>
        {items.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
