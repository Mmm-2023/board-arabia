import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { sponsorSignInSteps } from '../src/lib/sponsorHandover.ts'
import { SPONSOR_LABEL } from '../src/lib/sponsorLabel.ts'
import { tierSaveError } from '../src/lib/membershipTiers.ts'
import {
  includedLine,
  introMonthLine,
  introMonthNote,
  presentSponsorDesk,
  type SponsorDesk,
} from '../src/lib/sponsorDesk.ts'

const viewSource = readFileSync(new URL('../src/pages/dashboard/SponsorshipView.tsx', import.meta.url), 'utf8')

async function renderView(desk: SponsorDesk) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = await vite.ssrLoadModule('/src/pages/dashboard/SponsorshipView.tsx')
    return renderToStaticMarkup(createElement(mod.SponsorshipView, { desk }))
  } finally {
    await vite.close()
  }
}

test('sign-in steps are plain and the public name is Partner', () => {
  assert.equal(SPONSOR_LABEL, 'Partner')
  const steps = sponsorSignInSteps()
  assert.match(steps, /Partner sign-in steps/)
  assert.match(steps, /Set a password when the page asks for one/)
  assert.match(steps, /not emailed/)
  assert.equal(/https?:|token|one-time|otp/i.test(steps), false)
  assert.equal(steps.includes('\u2014') || steps.includes('\u2013'), false)
  assert.equal(steps.toLowerCase().includes('the desk'), false)
})

test('intro credits are monthly and room and majlis slots are included', async () => {
  const desk = presentSponsorDesk({
    package: {
      slug: 'placeholder_a',
      name: 'Placeholder package A',
      price_label: 'Placeholder',
      is_placeholder: true,
      majlis_slots: 1,
      intro_credits: 2,
      room_credits: 0,
    },
    category: null,
    majlis: { used: 4, events: [] },
    intros: { approved: 9, pending: 1, declined: 0 },
    credits: { intro_used: 1, intro_base: 5, room_used: 3 },
  })
  assert.ok(desk?.credits)
  assert.equal(desk.credits?.intro_base, 5)
  assert.equal(desk.credits?.intro_allowance, 7)
  assert.equal(desk.credits?.intro_entitled, 2)
  assert.equal(introMonthLine(desk.credits), '1 of 7 used this month')
  assert.match(introMonthNote(desk.credits) ?? '', /add 2 to the monthly allowance of 5/)
  assert.equal(includedLine(1), '1 included')
  assert.equal(includedLine(0), '0 included')
  assert.ok(desk)
  const html = await renderView(desk)
  assert.match(html, /1 included/)
  assert.match(html, /0 included/)
  assert.match(html, /1 of 7 used this month/)
  assert.equal(html.includes('4 of 1'), false)
  assert.equal(html.includes('3 of 0'), false)
  assert.match(viewSource, /\{NO_PACKAGE\} Admin attaches one from Settings\./)
})

test('welcome uses the package allowances or an empty admin line', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  let filled = ''
  let empty = ''
  try {
    const mod = await vite.ssrLoadModule('/src/pages/dashboard/SponsorWelcome.tsx')
    filled = renderToStaticMarkup(
      createElement(mod.SponsorWelcome, {
        allowances: { majlis_slots: 1, intro_credits: 2, room_credits: 0, monthly_base: 5 },
        onDismiss: () => {},
      }),
    )
    empty = renderToStaticMarkup(createElement(mod.SponsorWelcome, { allowances: null, onDismiss: () => {} }))
  } finally {
    await vite.close()
  }
  assert.match(filled, /What your seat includes/)
  assert.match(filled, /Partner/)
  assert.match(filled, /Majlis slots: 1 included/)
  assert.match(filled, /Intro credits: 2 per month, added to the monthly member allowance of 5/)
  assert.match(filled, /Room credits: 0 included/)
  assert.match(empty, /Admin will confirm your package\./)
  assert.equal(empty.includes('1 included'), false)
  assert.equal(tierSaveError('sponsor_founding'), 'A partner seat cannot also hold the Founding tier.')
  assert.equal(
    tierSaveError('This sponsor has no saved region. Set the region before removing the Sponsor tier.'),
    'This partner has no saved region. Set the region before removing the Partner tier.',
  )
})
