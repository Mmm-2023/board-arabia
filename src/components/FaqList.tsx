import { Link } from 'react-router-dom'
import { FAQ, type FaqItem } from '../content/seo'
import { DisplayHeading, Eyebrow } from './Type'

export function FaqList({
  items = FAQ,
  heading = 'FAQ',
}: {
  items?: FaqItem[]
  heading?: string
}) {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-pearl py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-5 md:px-10">
        <Eyebrow>Answers</Eyebrow>
        <DisplayHeading id="faq-heading">{heading}</DisplayHeading>
        <div className="mt-8 border-t border-ink/10 md:mt-12">
          {items.map((item) => (
            <details key={item.question} className="border-b border-ink/10 py-3 md:py-8">
              <summary className="cursor-pointer font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink md:text-[1.35rem]">
                {item.question}
              </summary>
              <p className="mt-3 text-[1rem] leading-relaxed text-ink/70">{item.answer}</p>
              {item.to && item.toLabel && (
                <Link
                  to={item.to}
                  className="mt-4 inline-block border-b border-brass text-[0.95rem] text-ink"
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
