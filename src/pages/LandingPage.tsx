import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Reveal } from '../components/Reveal'
import { Seo } from '../components/Seo'
import { DisplayHeading, Eyebrow } from '../components/Type'
import { ConnectionGraphic, DiamondGrid, HeroEnter, IconCapital, IconDoors, IconRelationships } from '../components/landing/graphics'
import { ProductFrame } from '../components/landing/ProductFrame'
import { StepDiagram } from '../components/landing/StepDiagram'
import { StickyApply } from '../components/landing/StickyApply'
import { LANDING_TILES } from '../content/landingFeatures'
import { FAQ, publicHref } from '../content/seo'
import { LANDING_STRIP_LEAD, LANDING_STRIP_LINK } from '../content/trust'
import { CONSIDERATION_NOTE } from '../content/twoTierCopy'
import { DestinationIcon } from '../shell/icons'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { LANDING_PREVIEW_EXAMPLES, presentLandingDealList, type LandingDeal } from '../lib/landingPreview'
import { supabase } from '../lib/supabase'
import { PlatformTotalsLine, seatDiamondFill, useLandingTotals } from '../components/StatsStrip'
import { TrustedPartnersSection } from '../components/TrustedPartners'
import { trackApplyClick } from '../lib/tracking/browser'
import { mainLandmarkProps } from '../components/SkipLink'

const WHY = [
  {
    title: 'Access to capital',
    body: 'Capital briefs shared through admin. No cold outreach.',
    icon: IconCapital,
  },
  {
    title: 'Business relationships',
    body: 'Peers admitted by application and personal review.',
    icon: IconRelationships,
  },
  {
    title: 'Opening doors',
    body: 'Warm introductions, deal rooms and Majlis gatherings.',
    icon: IconDoors,
  },
] as const

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="ba-landing">
      <Seo path="/" />
      <Nav onMenuChange={setMenuOpen} />
      <main {...mainLandmarkProps}>
        <Hero />
        <WhySection />
        <FoundingSection />
        <MembershipSection />
        <TrustedPartnersSection />
        <ProcessSection />
        <FaqList items={FAQ} compact />
        <p
          className="mx-auto max-w-3xl px-5 pt-8 text-center text-[0.875rem] leading-relaxed text-[var(--ba-muted)] md:px-10"
          data-trust-strip="landing"
        >
          {LANDING_STRIP_LEAD}{' '}
          <Link to={publicHref('/security')} className="ba-textlink inline-flex min-h-11 items-center">
            {LANDING_STRIP_LINK}
          </Link>
        </p>
        <CtaBand
          eyebrow="Begin"
          note={CONSIDERATION_NOTE}
          memberLogin
          compact
          location="closing"
        />
      </main>
      <Footer />
      <StickyApply menuOpen={menuOpen} />
    </div>
  )
}

function HeroConsideration() {
  const cta = publicConsiderationCta()
  return (
    <div className="mt-4">
      <Link
        id="hero-apply"
        to={publicHref(cta.to)}
        className="ba-primary ba-apply inline-flex items-center justify-center"
        data-consideration-cta="public"
        onClick={() => trackApplyClick('hero', cta.label)}
      >
        {cta.label}
      </Link>
      <p className="mt-2 max-w-md text-[1rem] leading-relaxed text-[#E8E4F7]">{CONSIDERATION_NOTE}</p>
      <p className="mt-1">
        <a href="#process" className="ba-textlink inline-flex min-h-11 items-center text-[1rem]">
          How it works
        </a>
      </p>
    </div>
  )
}

function Hero() {
  return (
    <section id="top" className="ba-on-dark relative overflow-hidden bg-ink text-pearl">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 18% 12%, rgba(167,150,220,0.22), transparent 55%), linear-gradient(165deg, #1C1343 0%, #2a2158 48%, #120c2e 100%)',
        }}
      />
      <div className="ba-hero-inner relative z-10 mx-auto grid max-w-7xl items-center gap-4 pt-20 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,440px)] md:gap-8 md:pt-24 md:pb-8">
        <div>
          <HeroEnter index={0}>
            <p className="mb-2 font-serif text-[1.05rem] italic text-[#E8E4F7]">
              Founding membership
            </p>
          </HeroEnter>
          <h1 className="max-w-3xl font-display text-[clamp(2.05rem,4.6vw,3.5rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance text-[#F6F5FB]">
            Where Saudi boardrooms meet international capital
          </h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-[#F6F5FB] md:text-[1.05rem]">
            Membership for Chairpersons, Board members and C-suite executives, in Saudi Arabia and internationally.
          </p>
          <HeroEnter index={1}>
            <HeroConsideration />
          </HeroEnter>
        </div>
        <HeroEnter index={2} className="ba-g1-wrap">
          <ConnectionGraphic />
        </HeroEnter>
      </div>
    </section>
  )
}

function WhySection() {
  return (
    <section id="why" className="bg-pearl py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Why Board Arabia</Eyebrow>
          <DisplayHeading compact className="max-w-3xl">
            Access to capital. Business relationships. Opening doors.
          </DisplayHeading>
          <p className="ba-quiet mt-3 max-w-3xl text-[0.9375rem] leading-[1.45]">
            A membership linking Saudi boardrooms with international counterparts.
          </p>
        </Reveal>
        <ol className="mt-3 grid gap-2 md:mt-5 md:grid-cols-3 md:gap-3">
          {WHY.map((point, index) => {
            const Icon = point.icon
            return (
              <li key={point.title}>
                <Reveal delay={0.06 * index}>
                  <article className="ba-card h-full px-3 py-3">
                    <Icon label={point.title} />
                    <h3 className="mt-2 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
                      {point.title}
                    </h3>
                    <p className="ba-quiet mt-1 text-[0.9375rem] leading-[1.45]">{point.body}</p>
                  </article>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function FoundingSection() {
  const shown = useLandingTotals()
  const fill = seatDiamondFill(shown)
  return (
    <section id="founding" className="bg-stone py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <Eyebrow>Founding 100</Eyebrow>
            <DisplayHeading compact>Fifty and fifty.</DisplayHeading>
            <p className="ba-quiet mt-3 max-w-xl text-[0.9375rem] leading-[1.45]">
              One hundred complimentary founding places: fifty in Saudi Arabia and the GCC, fifty international.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 gap-4">
            <Split count="50" title="Saudi Arabia and the GCC" filled={fill.ksa} />
            <Split count="50" title="International" filled={fill.intl} />
          </div>
        </div>
        <PlatformTotalsLine shown={shown} />
      </div>
    </section>
  )
}

function Split({
  count,
  title,
  filled,
}: {
  count: string
  title: string
  filled: number
}) {
  return (
    <div>
      <p className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.04em] text-[var(--ba-indigo)] md:text-[2.75rem]">
        {count}
      </p>
      <h3 className="mt-2 font-display text-[1rem] font-semibold text-ink">{title}</h3>
      <DiamondGrid filled={filled} />
    </div>
  )
}

function useLandingDeals(): LandingDeal[] {
  const [deals, setDeals] = useState<LandingDeal[]>(LANDING_PREVIEW_EXAMPLES)
  useEffect(() => {
    let cancelled = false
    void supabase.rpc('list_landing_preview_deals').then(({ data, error }) => {
      if (cancelled || error) return
      const next = presentLandingDealList(data)
      if (next.length > 0) setDeals(next)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return deals
}

function MembershipSection() {
  const deals = useLandingDeals()
  return (
    <section id="membership" className="bg-pearl py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Inside the membership</Eyebrow>
          <DisplayHeading compact className="max-w-3xl">
            Features and tools
          </DisplayHeading>
          <p className="ba-quiet mt-3 max-w-3xl text-[0.9375rem] leading-[1.45]">
            What admitted members use, after sign-in.
          </p>
        </Reveal>
        <div className="mt-3">
          <ProductFrame deals={deals} />
        </div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
          {LANDING_TILES.map((tile) => (
            <li key={tile.id}>
              <article className="ba-card h-full px-3 py-3" data-tile={tile.id}>
                <FeatureIcon id={tile.icon} />
                <h3 className="mt-2 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
                  {tile.title}
                </h3>
                <p className="ba-quiet mt-1 text-[0.9375rem] leading-[1.45]">{tile.body}</p>
              </article>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <Link to={publicHref('/for-members')} className="ba-textlink inline-flex min-h-11 items-center text-[0.9375rem]">
            See all member tools
          </Link>
        </p>
      </div>
    </section>
  )
}

function FeatureIcon({ id }: { id: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E8E4F7] bg-white text-[#1C1343]"
    >
      <DestinationIcon id={id} className="h-[22px] w-[22px] shrink-0" />
    </span>
  )
}

function ProcessSection() {
  return (
    <section id="process" className="ba-on-dark bg-ink py-8 text-pearl md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <DisplayHeading tone="light" compact className="max-w-3xl">
            How it works
          </DisplayHeading>
        </Reveal>
        <div className="mt-4">
          <StepDiagram />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-6">
          <Link to={publicHref('/how-it-works')} className="ba-textlink inline-flex min-h-11 items-center text-[0.9375rem] text-[#F6F5FB]">
            Full sequence
          </Link>
          <Link to={publicHref('/security')} className="ba-textlink inline-flex min-h-11 items-center text-[0.9375rem] text-[#F6F5FB]">
            {LANDING_STRIP_LINK}
          </Link>
        </p>
      </div>
    </section>
  )
}
