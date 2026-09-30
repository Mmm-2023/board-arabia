import { Link } from 'react-router-dom'
import { CLOSING_CTA_BODY, LEGACY_CTA_BODY } from '../content/twoTierCopy'
import { isTwoTierRegisterEnabled, publicConsiderationCta } from '../lib/twoTierRegister'
import { trackApplyClick, trackLoginClick } from '../lib/tracking/browser'
import { Reveal } from './Reveal'
import { Eyebrow } from './Type'

export function CtaBand({
  eyebrow = 'Consideration',
  title,
  body,
  to,
  label,
  memberLogin = false,
  compact = false,
  location = 'closing',
}: {
  eyebrow?: string
  title?: string
  body?: string
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
  const copy = body ?? (isTwoTierRegisterEnabled() ? CLOSING_CTA_BODY : LEGACY_CTA_BODY)
  return (
    <section id={memberLogin ? 'closing' : undefined} className={`relative overflow-hidden bg-stone ${compact ? 'py-8 md:py-12' : 'py-16 md:py-24'}`}>
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-10">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className={`font-display font-bold leading-[1.05] tracking-[-0.04em] text-balance text-ink ${compact ? 'text-[clamp(1.7rem,4vw,2.4rem)]' : 'text-[clamp(2.3rem,5.5vw,4rem)]'}`}>
            {heading}
          </h2>
          <p className="ba-quiet mx-auto mt-3 max-w-lg text-[0.9375rem] leading-relaxed">
            {copy}
          </p>
          <Link
            to={href}
            className="ba-primary mt-5 inline-flex min-h-12 items-center justify-center px-6 text-[0.9375rem] font-semibold"
            data-consideration-cta="public"
            onClick={() => {
              if (href === consideration.to) trackApplyClick(location, ctaLabel)
            }}
          >
            {ctaLabel}
          </Link>
          {memberLogin ? (
            <p className="mt-3 text-[0.9375rem] text-ink">
              Already a member?{' '}
              <Link
                to="/login"
                className="ba-textlink inline-flex min-h-11 items-center"
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
