import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { firstSentence, HELD_FOR_LINE, NAV_LINKS, PROCESS_STEPS } from '../src/content/marketing.ts'
import { FAQ, MEMBERS_FAQ } from '../src/content/seo.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('public nav order, held-for line, and home FAQ copy fixes', () => {
  assert.deepEqual(
    NAV_LINKS.map((item) => item.label),
    ['How it works', 'Members', 'Capital', 'Partners', 'About'],
  )
  assert.equal(NAV_LINKS.find((item) => item.label === 'How it works')?.to, '/how-it-works')
  assert.equal(HELD_FOR_LINE.includes('\u2014'), false)
  assert.equal(HELD_FOR_LINE.includes('\u2013'), false)
  assert.match(HELD_FOR_LINE, /Held for: Chairperson · Board members · C-suite executives/)
  assert.equal(FAQ.length, 5)
  assert.equal(
    FAQ.some((item) => item.question === 'What do the platform totals mean?'),
    false,
  )
  const apply = FAQ.find((item) => item.question === 'How do I apply?')
  assert.ok(apply)
  assert.equal(apply.answer.includes('/apply'), false)
  assert.equal(apply.answer.includes('/for-members'), false)
  assert.match(apply.answer, /Submit the pre-vet form with your credentials/)
  const fdi = FAQ.find((item) => item.question === 'How do family offices or FDI engage?')
  assert.ok(fdi)
  assert.equal(fdi.answer.includes('/for-capital'), false)
  assert.match(fdi.answer, /There is no open outbound to members\./)
  const members = MEMBERS_FAQ.find((item) => item.question === 'What do members get?')
  assert.ok(members)
  assert.equal(members.answer.includes('/for-members'), false)
  assert.equal(firstSentence(PROCESS_STEPS[0].home), 'Submit credentials for consideration.')
  assert.equal(firstSentence(PROCESS_STEPS[4].home), 'After the conversation, admitted members enter the dashboard.')
})

test('landing source keeps locked cards, new strings, and no analytics or dashes', () => {
  const landing = source('src/pages/LandingPage.tsx')
  const css = source('src/index.css')
  const nav = source('src/components/Nav.tsx')
  const files = [
    landing,
    css,
    nav,
    source('src/components/landing/graphics.tsx'),
    source('src/components/landing/ProductFrame.tsx'),
    source('src/components/landing/StepDiagram.tsx'),
    source('src/components/landing/StickyApply.tsx'),
    source('src/components/Reveal.tsx'),
  ]
  for (const file of files) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
  }
  assert.match(landing, /See all member tools/)
  assert.match(landing, /ProductFrame/)
  assert.match(landing, /StepDiagram/)
  assert.match(landing, /ConnectionGraphic/)
  assert.match(landing, /StickyApply/)
  assert.equal(landing.includes('Sign in'), false)
  assert.equal(landing.includes('gtag'), false)
  assert.equal(landing.includes('plausible'), false)
  assert.equal(landing.includes('googletagmanager'), false)
  assert.match(nav, /NAV_LINKS/)
  assert.equal(nav.includes('Process'), false)
  assert.match(css, /prefers-reduced-motion: no-preference/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.equal(css.includes('framer-motion'), false)
  assert.equal(source('src/components/Reveal.tsx').includes('motion/react'), false)
  assert.equal(landing.includes('motion/react'), false)
  const members = source('src/pages/ForMembersPage.tsx')
  assert.match(members, /AI Due Diligence/)
  assert.match(members, /MEMBERS_FAQ/)
  assert.match(source('src/shell/destinations.ts'), /Home/)
  assert.match(source('src/shell/destinations.ts'), /AI tools/)
})
