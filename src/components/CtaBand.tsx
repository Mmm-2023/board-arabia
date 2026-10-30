import { Link } from 'react-router-dom'
import { publicHref } from '../content/seo'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { trackApplyClick, trackLoginClick } from '../lib/tracking/browser'
import { Reveal } from './Reveal'
import { Eyebrow } from './Type'

export function CtaBand({
  eyebrow = 'Consideration',
  title,
  body,
  note,
  to,
  label,
  memberLogin = false,
  compact = false,
  location = 'closing',
}: {
  eyebrow?: string
  title?: string
  body?: string
  note?: string
  to?: string
  label?: string
  memberLogin?: boolean
  compact?: boolean
  location?: string
}) {
  const consideration = publicConsiderationCta()
  const href = to ?? consideration.to
  const ctaLabel = label ?? consideration.label
  const heading = title ?? `${ctaLabel}.`
  return (
    <section id={memberLogin ? 'closing' : undefined} className={`relative overflow-hidden bg-stone ${compact ? 'py-8 md:py-12' : 'py-16 md:py-24'}`}>
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-10">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className={`font-display font-bold leading-[1.05] tracking-[-0.04em] text-balance text-ink ${compact ? 'text-[clamp(1.7rem,4vw,2.4rem)]' : 'text-[clamp(2.3rem,5.5vw,4rem)]'}`}>
            {heading}
          </h2>
          {body ? (
            <p className="ba-quiet mx-auto mt-3 max-w-lg text-[1rem] leading-relaxed">
              {body}
            </p>
          ) : null}
          <Link
            to={publicHref(href)}
            className="ba-primary ba-apply mt-5 inline-flex items-center justify-center"
            data-consideration-cta="public"
            onClick={() => {
              if (href === consideration.to) trackApplyClick(location, ctaLabel)
            }}
          >
            {ctaLabel}
          </Link>
          {note ? (
            <p className="mx-auto mt-2 max-w-lg text-[1rem] leading-relaxed text-ink/70">{note}</p>
          ) : null}
          {memberLogin ? (
            <p className="mt-3 text-[0.9375rem] text-ink">
              Already a member?{' '}
              <Link
                to="/login"
                className="ba-textlink inline-flex min-h-11 min-w-11 items-center justify-center px-1"
                onClick={() => trackLoginClick('closing')}
              >
                Log in
              </Link>
            </p>
          ) : null}
        </Reveal>
      </div>
    </section>
  )
}
