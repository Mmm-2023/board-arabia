import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CtaBand } from '../components/CtaBand'
import { FaqList } from '../components/FaqList'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { Reveal } from '../components/Reveal'
import { Seo } from '../components/Seo'
import { DisplayHeading, Eyebrow } from '../components/Type'
import { TrustedPartnersSection } from '../components/TrustedPartners'
import { ConnectionGraphic, DiamondGrid, HeroEnter, HELD_FOR_LINE, IconCapital, IconDoors, IconRelationships } from '../components/landing/graphics'
import { ProductFrame } from '../components/landing/ProductFrame'
import { StepDiagram } from '../components/landing/StepDiagram'
import { StickyApply } from '../components/landing/StickyApply'
import { MEMBER_TOOLS } from '../content/marketing'
import { FAQ } from '../content/seo'
import { closingCtaBody } from '../content/twoTierCopy'
import { publicConsiderationCta } from '../lib/twoTierRegister'
import { LANDING_PREVIEW_EXAMPLES, presentLandingDealList, type LandingDeal } from '../lib/landingPreview'
import { supabase } from '../lib/supabase'
import { PlatformTotalsLine, seatDiamondFill, useLandingTotals } from '../components/StatsStrip'
import { trackApplyClick } from '../lib/tracking/browser'

const WHY = [
  {
    title: 'Access to capital',
    body: 'Mandates from family offices, FDI, funds, and strategic investors arrive through an admin-gated inbox. Members are not left open to cold outreach on the open web.',
    icon: IconCapital,
  },
  {
    title: 'Business relationships',
    body: 'Saudi and international Chairpersons, Board members, and C-suite executives admitted on one standard: credentials first, then a decision. Fifty founding seats for Saudi Arabia and the GCC. Fifty for international counterparts.',
    icon: IconRelationships,
  },
  {
    title: 'Opening doors',
    body: 'Warm introductions, deal rooms, Majlis, and a private directory open the right doors without an open messaging wall. Nothing opens from this public site.',
    icon: IconDoors,
  },
] as const

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="ba-landing">
      <Seo path="/" />
      <Nav onMenuChange={setMenuOpen} />
      <main>
        <Hero />
        <WhySection />
        <FoundingSection />
        <MembershipSection />
        <ProcessSection />
        <TrustedPartnersSection />
        <FaqList items={FAQ} compact />
        <CtaBand
          eyebrow="Begin"
          body={closingCtaBody()}
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
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Link
        id="hero-apply"
        to={cta.to}
        className="ba-primary inline-flex min-h-12 items-center justify-center px-5 text-[0.9375rem] font-semibold"
        data-consideration-cta="public"
        onClick={() => trackApplyClick('hero', cta.label)}
      >
        {cta.label}
      </Link>
      <a href="#process" className="ba-secondary inline-flex min-h-12 items-center justify-center px-5 text-[0.9375rem] font-semibold">
        How it works
      </a>
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
              Founding membership · Saudi Arabia & international
            </p>
          </HeroEnter>
          <h1 className="font-display text-[clamp(2.35rem,6vw,4.25rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-[#F6F5FB]">
            Board
            <br />
            Arabia
          </h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-[#F6F5FB] md:text-[1.05rem]">
            Connect Saudi boardrooms with international Chairpersons, Board
            members, and C-suite executives. Access to capital. Business
            relationships. Opening doors. Credentials before any conversation.
            No public booking calendar.
          </p>
          <HeroEnter index={1}>
            <HeroConsideration />
          </HeroEnter>
          <HeroEnter index={2}>
            <p className="mt-4 text-[0.875rem] leading-relaxed text-[#E8E4F7]">{HELD_FOR_LINE}</p>
          </HeroEnter>
        </div>
        <HeroEnter index={3} className="ba-g1-wrap">
          <ConnectionGraphic />
        </HeroEnter>
      </div>
    </section>
  )
}

function WhySection() {
  return (
    <section id="why" className="bg-pearl py-5 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Why Board Arabia</Eyebrow>
          <DisplayHeading compact className="max-w-3xl">
            Access to capital. Business relationships. Opening doors.
          </DisplayHeading>
          <p className="ba-quiet mt-3 max-w-3xl text-[0.9375rem] leading-relaxed">
            Board Arabia is a reviewed founding membership. It links Saudi
            Arabia’s boardrooms with international counterparts for
            Chairpersons, Board members, and C-suite executives. Growth and
            governance sit inside that frame. It is not a directory you can
            search, and it is not a calendar you can book.
          </p>
        </Reveal>
        <ol className="mt-3 grid gap-2 md:mt-5 md:grid-cols-3 md:gap-3">
          {WHY.map((point, index) => {
            const Icon = point.icon
            return (
              <li key={point.title}>
                <Reveal delay={0.06 * index}>
                  <article className="ba-card h-full px-3 py-3">
                    <Icon />
                    <h3 className="mt-2 font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
                      {point.title}
                    </h3>
                    <p className="ba-quiet mt-1 text-[0.8125rem] leading-snug">{point.body}</p>
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
            <p className="ba-quiet mt-3 max-w-xl text-[0.9375rem] leading-relaxed">
              One hundred founding places, split evenly: fifty in Saudi Arabia,
              fifty international. Complimentary founding terms pending
              contribution, as set by the desk. Places are not priced on this
              site.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 gap-4">
            <Split
              count="50"
              title="Saudi Arabia"
              body="Chairpersons, Board members, and C-suite executives held for Saudi Arabia and the GCC."
              filled={fill.ksa}
            />
            <Split
              count="50"
              title="International"
              body="International Chairpersons, Board members, and C-suite executives. The room is not a GCC-only practice."
              filled={fill.intl}
            />
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
  body,
  filled,
}: {
  count: string
  title: string
  body: string
  filled: number
}) {
  return (
    <div>
      <p className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.04em] text-[var(--ba-indigo)] md:text-[2.75rem]">
        {count}
      </p>
      <h3 className="mt-2 font-display text-[1rem] font-semibold text-ink">{title}</h3>
      <DiamondGrid filled={filled} />
      <p className="ba-quiet mt-2 text-[0.8125rem] leading-relaxed">{body}</p>
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
    <section id="membership" className="bg-pearl py-5 md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow>Inside the membership</Eyebrow>
          <DisplayHeading compact className="max-w-3xl">
            Tools that support capital, relationships, and open doors.
          </DisplayHeading>
          <p className="ba-quiet mt-3 max-w-3xl text-[0.9375rem] leading-relaxed">
            After admission you work in a private directory, an admin-gated
            mandate path, warm introductions, deal rooms, a quarterly Majlis,
            and tools that support diligence and sector fit. Each tile opens on
            the member page. Capital reads the mandate path separately.
          </p>
        </Reveal>
        <div className="mt-3">
          <ProductFrame deals={deals} />
        </div>
        <ul className="ba-tool-list mt-3">
          {MEMBER_TOOLS.map((tool) => (
            <li key={tool.id}>{tool.title}</li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap gap-x-6">
          <Link to="/for-members" className="ba-textlink inline-flex min-h-11 items-center text-[0.9375rem]">
            See all member tools
          </Link>
          <Link to="/for-capital" className="ba-textlink inline-flex min-h-11 items-center text-[0.9375rem]">
            How FDI and family offices engage
          </Link>
        </p>
      </div>
    </section>
  )
}

function ProcessSection() {
  return (
    <section id="process" className="ba-on-dark bg-ink py-8 text-pearl md:py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <Eyebrow tone="light">How it works</Eyebrow>
          <DisplayHeading tone="light" compact className="max-w-3xl">
            Consideration before any conversation.
          </DisplayHeading>
        </Reveal>
        <div className="mt-4">
          <StepDiagram />
        </div>
        <p className="mt-4 max-w-3xl text-[0.9375rem] leading-relaxed text-[#E8E4F7]">
          Reviewed. Gated. Off the open web. Outreach, warm introductions, and mandates pass admin before they reach a member.
        </p>
        <Link to="/how-it-works" className="ba-textlink mt-2 inline-flex min-h-11 items-center text-[0.9375rem] text-[#F6F5FB]">
          Full sequence
        </Link>
      </div>
    </section>
  )
}
