import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Reveal } from '../components/Reveal'
import { Seo } from '../components/Seo'
import { DisplayHeading, Eyebrow } from '../components/Type'
import { MEMBER_TOOLS, PARTNER_CATEGORIES, PROCESS_STEPS } from '../content/marketing'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?auto=format&fit=crop&w=2400&q=80'

const PATHS = [
  'Chairpersons',
  'Board advisors',
  'Aspiring NEDs',
  'Saudi Arabia & the GCC',
  'International',
]

export function LandingPage() {
  return (
    <>
      <Seo path="/" />
      <Nav />
      <main>
        <Hero />
        <PathsStrip />
        <WhySection />
        <FoundingSection />
        <ToolsSection />
        <ProcessSection />
        <PartnersSection />
        <TrustSection />
        <FaqList />
        <CtaBand
          eyebrow="Begin"
          title="Apply for consideration."
          body="Submit the pre-vet. If you are accepted, the next step arrives by private email."
          label="Apply for consideration"
        />
      </main>
      <Footer />
    </>
  )
}

function Hero() {
  const ref = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '14%'])
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '6%'])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.45])

  return (
    <section id="top" ref={ref} className="relative min-h-dvh overflow-hidden bg-ink">
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        <img
          src={HERO_IMAGE}
          alt="Modern skyline over Riyadh at dusk"
          width={2400}
          height={1350}
          fetchPriority="high"
          decoding="async"
          className="h-[120%] w-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/45 via-ink/35 to-ink/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(6,42,40,0.55)_75%)]" />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity }}
        className="relative z-10 mx-auto flex min-h-dvh max-w-7xl flex-col px-5 pb-12 pt-28 sm:px-6 md:px-10 md:pb-16 md:pt-32"
      >
        <div className="mt-auto max-w-4xl pb-2 md:pb-4">
          <motion.p
            initial={{ opacity: 1, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mb-4 font-serif text-[1.1rem] italic text-stone/85 md:text-[1.25rem]"
          >
            Founding membership
          </motion.p>

          <motion.h1
            initial={{ opacity: 1, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1.05,
              delay: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-display text-[clamp(3.4rem,11vw,8.5rem)] font-extrabold leading-[0.88] tracking-[-0.045em] text-pearl"
          >
            Board
            <br />
            Arabia
          </motion.h1>

          <motion.div
            initial={{ opacity: 1, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 flex max-w-3xl flex-col gap-7 md:mt-9 md:flex-row md:items-end md:justify-between md:gap-12"
          >
            <p className="max-w-md text-[1.05rem] leading-relaxed text-stone/90 md:text-[1.12rem]">
              Board Arabia is a selective founding membership for Saudi, GCC,
              and international chairpersons, board advisors, and aspiring
              non-executive directors. Credentials are reviewed before any
              conversation; there is no public booking calendar on this site.
            </p>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link
                to="/apply"
                className="inline-flex items-center justify-center bg-brass px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:bg-brass-bright"
              >
                Apply for consideration
              </Link>
              <a
                href="#process"
                className="inline-flex items-center justify-center border border-pearl/35 px-6 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:border-pearl hover:bg-pearl/5"
              >
                How it works
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

function PathsStrip() {
  return (
    <section className="border-b border-ink/8 bg-pearl py-9 md:py-11">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <p className="text-center text-[0.7rem] font-semibold tracking-[0.16em] text-ink/40 uppercase">
          Held for
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:mt-5 md:gap-x-2">
          {PATHS.map((label, i) => (
            <li key={label} className="flex items-center gap-3 md:gap-4">
              {i > 0 && (
                <span aria-hidden className="hidden h-3 w-px bg-ink/15 sm:block" />
              )}
              <span className="font-display text-[0.9rem] font-semibold tracking-[-0.02em] text-ink/70 md:text-[1rem]">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function WhySection() {
  const points = [
    {
      n: '01',
      title: 'Proximity to capital',
      body: 'Mandates from family offices (FO), foreign direct investment (FDI), funds, and strategic investors arrive through an admin-gated inbox. Members are not left open to cold outreach.',
    },
    {
      n: '02',
      title: 'Proximity to peers',
      body: 'Saudi and international chairs and advisors, admitted on the same standard: credentials first, then a decision.',
    },
    {
      n: '03',
      title: 'Not an open directory',
      body: 'You cannot browse members, buy a seat, or arrange a conversation from this site. The pages explain the room. They do not open it.',
    },
  ]

  return (
    <section id="why" className="grain relative overflow-hidden bg-pearl py-24 md:py-32">
      <div className="relative mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Why Board Arabia</Eyebrow>
          <DisplayHeading className="max-w-3xl">
            Near capital. Near peers. Closed by design.
          </DisplayHeading>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink/60">
            Board Arabia is a reviewed membership. It is not a directory you
            can search, and it is not a calendar you can book.
          </p>
        </Reveal>

        <ol className="mt-16 grid gap-12 md:mt-20 md:grid-cols-3 md:gap-10">
          {points.map((point, i) => (
            <li key={point.n} className="border-t border-ink/12 pt-6">
              <Reveal delay={0.06 * i}>
                <span className="font-display text-[0.78rem] font-semibold tracking-[0.18em] text-brass">
                  {point.n}
                </span>
                <h3 className="mt-4 font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-ink">
                  {point.title}
                </h3>
                <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
                  {point.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function FoundingSection() {
  return (
    <section id="founding" className="bg-stone">
      <div className="mx-auto grid max-w-7xl md:grid-cols-2">
        <div className="bg-ink px-5 py-20 text-pearl md:px-10 md:py-28">
          <Reveal>
            <Eyebrow tone="brass">Founding 100</Eyebrow>
            <DisplayHeading tone="light" className="max-w-md">
              Fifty and fifty.
            </DisplayHeading>
            <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-stone/75">
              The Founding 100 is one hundred places, split evenly: fifty in
              Saudi Arabia, fifty international. Complimentary founding terms
              pending contribution, as set by the desk. Places are not priced
              on this site.
            </p>
          </Reveal>
        </div>
        <div className="grid h-full sm:grid-cols-2">
          <div className="flex flex-col justify-end border-ink/10 px-5 py-14 sm:border-r md:px-10 md:py-16">
            <p className="font-display text-[clamp(4.5rem,8vw,7rem)] font-extrabold leading-none tracking-[-0.05em] text-ink">
              50
            </p>
            <h3 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
              Saudi Arabia
            </h3>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
              Chairpersons and NEDs held for Saudi Arabia and the Gulf
              Cooperation Council (GCC).
            </p>
          </div>
          <div className="flex flex-col justify-end px-5 py-14 md:px-10 md:py-16">
            <p className="font-display text-[clamp(4.5rem,8vw,7rem)] font-extrabold leading-none tracking-[-0.05em] text-ink">
              50
            </p>
            <h3 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
              International
            </h3>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
              International chairs and NEDs. The place is not reserved for a
              GCC-only practice.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ToolsSection() {
  return (
    <section id="tools" className="bg-pearl py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Member tools and benefits</Eyebrow>
          <DisplayHeading className="max-w-3xl">
            What the room actually uses.
          </DisplayHeading>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink/60">
            After admission, the outcome is concrete: a private directory, an
            admin-gated mandate inbox, availability you set, warm introductions
            that are released rather than cold, a founding badge, a quarterly
            majlis, peer vouchers, Vision 2030 tags, and deal rooms. Each tile
            opens on the member page. Capital reads the mandate path separately.
          </p>
          <p className="mt-4">
            <Link to="/for-capital" className="border-b border-brass text-ink">
              How FDI and family offices engage
            </Link>
          </p>
        </Reveal>

        <ul className="mt-14 grid border-t border-l border-ink/10 sm:grid-cols-2 lg:grid-cols-3">
          {MEMBER_TOOLS.map((tool) => (
            <li key={tool.id} className="border-r border-b border-ink/10">
              <Link
                to={tool.href}
                className="group flex h-full flex-col px-6 py-7 transition-colors hover:bg-white/70 md:px-7 md:py-8"
              >
                <span className="font-display text-[0.75rem] font-semibold tracking-[0.18em] text-brass">
                  {tool.n}
                </span>
                <h3 className="mt-4 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">
                  {tool.title}
                </h3>
                <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink/60">
                  {tool.home}
                </p>
                <span className="mt-6 text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase transition-colors group-hover:text-brass">
                  Read
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ProcessSection() {
  return (
    <section id="process" className="relative bg-ink py-24 text-pearl md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e6e2da 1px, transparent 1px), linear-gradient(to bottom, #e6e2da 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage:
            'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow tone="brass">How it works</Eyebrow>
          <DisplayHeading tone="light" className="max-w-3xl">
            Consideration before any conversation.
          </DisplayHeading>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-stone/75">
            Pre-vet, personal review by the desk, accept, a private booking
            email, then the member dashboard.
          </p>
        </Reveal>

        <ol className="mt-16 grid gap-10 md:mt-20 md:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {PROCESS_STEPS.map((step, i) => (
            <li key={step.n}>
              <Reveal delay={0.05 * i}>
                <span className="font-display text-[0.85rem] font-semibold tracking-[0.2em] text-brass">
                  {step.n}
                </span>
                <h3 className="mt-4 font-display text-[1.2rem] font-semibold tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[0.92rem] leading-relaxed text-stone/70">
                  {step.home}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal>
          <Link
            to="/how-it-works"
            className="mt-14 inline-flex border-b border-brass pb-0.5 text-[0.78rem] font-semibold tracking-[0.1em] text-pearl uppercase"
          >
            Full sequence
          </Link>
        </Reveal>
      </div>
    </section>
  )
}

function PartnersSection() {
  const sample = PARTNER_CATEGORIES.slice(0, 6)

  return (
    <section id="partners" className="bg-pearl py-24 md:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 md:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <Reveal>
          <Eyebrow>Founding Ecosystem Partners</Eyebrow>
          <DisplayHeading>Three seats a year.</DisplayHeading>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ink/60">
            Three annual Founding Ecosystem Partner seats. They are for firms
            on the finance rails of a deal — not a wall of logos. We do not
            scrape names, publish a partner directory, or show a price.
          </p>
          <Link
            to="/partners"
            className="mt-8 inline-flex items-center justify-center bg-ink px-7 py-3.5 text-[0.78rem] font-semibold tracking-[0.08em] text-pearl uppercase transition-colors hover:bg-ink-soft"
          >
            Partner with us
          </Link>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-ink/40 uppercase">
            Finance first
          </p>
          <ul className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
            {sample.map((category) => (
              <li
                key={category.name}
                className="py-3.5 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink/80"
              >
                {category.name}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.92rem] text-ink/50">
            Fifteen categories in full on the partners page.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function TrustSection() {
  const points = [
    {
      title: 'Credentials are reviewed',
      body: 'No one is offered a conversation on the strength of a form that has not been read.',
    },
    {
      title: 'No open calendar',
      body: 'This site does not publish a booking page. A link, when one is offered, is emailed after acceptance.',
    },
    {
      title: 'Admin oversight',
      body: 'Outreach, warm introductions, and mandates pass admin before they reach a member.',
    },
  ]

  return (
    <section id="trust" className="border-t border-ink/10 bg-pearl pb-24 md:pb-32">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Trust and discretion</Eyebrow>
          <DisplayHeading className="max-w-3xl">
            Reviewed. Gated. Off the open web.
          </DisplayHeading>
        </Reveal>
        <ul className="mt-14 grid gap-8 md:grid-cols-3">
          {points.map((point) => (
            <li key={point.title} className="border-l border-brass pl-5">
              <h3 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">
                {point.title}
              </h3>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
                {point.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
