import { Link } from 'react-router-dom'
import { FAQ, publicFaqItems, type FaqItem } from '../content/seo'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { DisplayHeading, Eyebrow } from './Type'

export function FaqList({
  items = FAQ,
  heading = 'FAQ',
  compact = false,
}: {
  items?: FaqItem[]
  heading?: string
  compact?: boolean
}) {
  const shown = publicFaqItems(items)
  const cta = publicConsiderationCta()
  return (
    <section id="faq" aria-labelledby="faq-heading" className={compact ? 'bg-pearl py-8 md:py-10' : 'bg-pearl py-16 md:py-20'}>
      <div className="mx-auto max-w-3xl px-5 md:px-10">
        <Eyebrow>Answers</Eyebrow>
        <DisplayHeading id="faq-heading" compact={compact}>
          {heading}
        </DisplayHeading>
        <div className="mt-4 border-t border-ink/10">
          {shown.map((item) => (
            <details key={item.question} className="border-b border-ink/10">
              <summary className="flex min-h-12 cursor-pointer items-center py-2 font-display text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink md:text-[1.05rem]">
                {item.question}
              </summary>
              <p className="pb-3 text-[0.9375rem] leading-relaxed text-[var(--ba-muted)]">{item.answer}</p>
              {item.to && item.toLabel && (
                <Link
                  to={item.to}
                  className="ba-textlink mb-3 inline-flex min-h-11 items-center text-[0.9375rem]"
                  data-consideration-cta={item.to === cta.to && item.toLabel === cta.label ? 'public' : undefined}
                >
                  {item.toLabel}
                </Link>
              )}
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
