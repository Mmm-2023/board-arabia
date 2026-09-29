import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { assembleHome, type AssembleInput } from '../src/lib/homeSnapshot.ts'
import { presentMandate } from '../src/lib/mandateRedaction.ts'
import { presentReOpportunity, presentRePartner } from '../src/lib/reRedaction.ts'
import { SAMPLE_NOTE, sampleRow } from '../src/lib/sampleAction.ts'
import type { RoomCard } from '../src/lib/demoRows.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function page(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

function button(html: string, label: string) {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`))
  assert.ok(match, `${label} button missing`)
  return match[0]
}

function isDisabled(tag: string) {
  return /\sdisabled=""/.test(tag)
}

test('sampleRow only matches a demo id', () => {
  const rows = [
    { id: 'live', is_demo: false },
    { id: 'sample', is_demo: true },
  ]
  assert.equal(sampleRow(rows, 'sample'), true)
  assert.equal(sampleRow(rows, 'live'), false)
  assert.equal(sampleRow(rows, 'missing'), false)
  assert.equal(SAMPLE_NOTE, 'Sample')
  assert.equal(SAMPLE_NOTE.includes('\u2014'), false)
  assert.equal(SAMPLE_NOTE.includes('\u2013'), false)
})

test('request handlers refuse a sample id before they call the network', () => {
  const mandates = source('src/pages/dashboard/MandatesPage.tsx')
  const estate = source('src/pages/dashboard/RealEstatePage.tsx')
  assert.match(mandates, /sampleRow\(list\.mandates, id\)/)
  assert.match(estate, /sampleRow\(list\.cards, id\)/)
  assert.match(estate, /sampleRow\(partners\.cards, id\)/)
  for (const file of [mandates, estate, source('src/components/SampleAction.tsx'), source('src/pages/dashboard/RoomsBoard.tsx')]) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
  }
})

test('sample cards keep the action visible and inert', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mandates = await vite.ssrLoadModule('/src/pages/dashboard/MandateCard.tsx')
    const opportunities = await vite.ssrLoadModule('/src/pages/dashboard/OpportunityCard.tsx')
    const partners = await vite.ssrLoadModule('/src/pages/dashboard/RealEstatePartners.tsx')
    const rooms = await vite.ssrLoadModule('/src/pages/dashboard/RoomsBoard.tsx')
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')

    const sampleMandate = presentMandate(mandate({ is_demo: true }))
    const liveMandate = presentMandate(mandate({ id: 'a2000001-0000-4000-8000-000000000002', is_demo: false }))
    const pendingSample = presentMandate(mandate({ id: 'a2000001-0000-4000-8000-000000000003', is_demo: true, intro_status: 'pending' }))
    assert.ok(sampleMandate && liveMandate && pendingSample)

    const sampleHtml = page(createElement(mandates.MandateCard, { mandate: sampleMandate, onRequest: () => {} }))
    assert.match(sampleHtml, />Example</)
    assert.match(sampleHtml, /data-sample-action="inert"/)
    assert.match(sampleHtml, new RegExp(`>${SAMPLE_NOTE}<`))
    assert.equal(isDisabled(button(sampleHtml, 'Request intro')), true)
    const sampleNoteAt = sampleHtml.indexOf(`>${SAMPLE_NOTE}<`)
    const sampleButtonAt = sampleHtml.indexOf('>Request intro<')
    assert.ok(sampleNoteAt > 0 && sampleNoteAt < sampleButtonAt)

    const liveHtml = page(createElement(mandates.MandateCard, { mandate: liveMandate, onRequest: () => {} }))
    assert.equal(liveHtml.includes('data-sample-action'), false)
    assert.equal(isDisabled(button(liveHtml, 'Request intro')), false)
    assert.match(liveHtml, /Request intro to unlock/)

    const pendingHtml = page(createElement(mandates.MandateCard, { mandate: pendingSample, onRequest: () => {} }))
    assert.match(pendingHtml, /Intro requested/)
    assert.match(pendingHtml, new RegExp(`>${SAMPLE_NOTE}<`))
    assert.equal(pendingHtml.includes('>Request intro<'), false)

    const sampleOpportunity = presentReOpportunity(opportunity({ is_demo: true }))
    const liveOpportunity = presentReOpportunity(opportunity({ id: 'b1000001-0000-4000-8000-000000000002', is_demo: false }))
    assert.ok(sampleOpportunity && liveOpportunity && sampleOpportunity.unlocked === false)
    const opportunityHtml = page(createElement(opportunities.OpportunityCard, { card: sampleOpportunity, onRequest: () => {} }))
    assert.match(opportunityHtml, />Example</)
    assert.equal(isDisabled(button(opportunityHtml, 'Request intro')), true)
    assert.match(opportunityHtml, new RegExp(`>${SAMPLE_NOTE}<`))
    const liveOpportunityHtml = page(createElement(opportunities.OpportunityCard, { card: liveOpportunity, onRequest: () => {} }))
    assert.equal(isDisabled(button(liveOpportunityHtml, 'Request intro')), false)

    const samplePartner = presentRePartner(partner())
    const livePartner = presentRePartner(partner({ id: 'b2000001-0000-4000-8000-000000000002', is_demo: false, name: 'Live Counsel' }))
    assert.ok(samplePartner && livePartner)
    const partnerHtml = renderToStaticMarkup(
      createElement(partners.RealEstatePartners, {
        status: 'ready',
        cards: [samplePartner, livePartner],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
      }),
    )
    assert.equal((partnerHtml.match(/>Request intro</g) || []).length, 2)
    assert.equal((partnerHtml.match(/data-sample-action="inert"/g) || []).length, 1)
    const partnerButtons = [...partnerHtml.matchAll(/<button[^>]*>Request intro<\/button>/g)].map((match) => match[0])
    assert.equal(partnerButtons.filter((tag) => isDisabled(tag)).length, 1)
    assert.equal(partnerButtons.filter((tag) => !isDisabled(tag)).length, 1)

    const room = exampleRoom()
    const roomHtml = page(createElement(rooms.RoomsBoard, { rooms: [room], embedded: true }))
    assert.match(roomHtml, />Example</)
    assert.match(roomHtml, /Cards marked Example are samples/)
    assert.match(roomHtml, new RegExp(`>${SAMPLE_NOTE}<`))
    assert.equal(isDisabled(button(roomHtml, 'Open room')), true)
    assert.equal(roomHtml.includes('href='), false)

    const input: AssembleInput = {
      nowMs: Date.parse('2026-09-29T12:00:00.000Z'),
      seat: 'ksa',
      name: 'Huda Al Sample',
      photoUrl: null,
      profileReady: true,
      mustSetPassword: false,
      invitesRemaining: 2,
      personalCapacityIncluded: false,
      attention: [],
      mandates: [],
      rooms: [],
      directory: [],
      partners: [],
      gatherings: [],
      admitted: 4,
      ksa: 3,
      intl: 1,
      money: [],
      activity: [
        {
          id: 'sample-intro',
          kind: 'intro',
          label: 'Intro requested',
          detail: 'Energy transition · Growth equity',
          happenedAt: '2026-09-25T11:40:00.000Z',
          href: '/dashboard/deals/mandates',
          example: true,
        },
      ],
      activityStatus: 'ready',
      loading: false,
      partialError: false,
      updatedLabel: 'Updated 09:00',
    }
    const model = assembleHome(input)
    model.pulse = [
      {
        id: 'intros',
        label: 'Intros pending',
        value: '3',
        body: 'Sample requests.',
        to: '/dashboard/deals/mandates',
        example: true,
      },
      ...model.pulse,
    ]
    const homeHtml = page(createElement(home.HomeSnapshotView, { model }))
    assert.match(homeHtml, /Invites left/)
    assert.match(homeHtml, />2</)
    assert.equal(homeHtml.includes('Intros pending'), false)
    assert.equal(homeHtml.includes('Sample requests.'), false)
    assert.match(homeHtml, /Platform totals are forming/)
    assert.match(homeHtml, /Intro requested/)
    assert.match(homeHtml, />Example</)
    assert.equal(homeHtml.includes('\u2014'), false)
    assert.equal(homeHtml.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

function mandate(extra: Record<string, unknown>) {
  return {
    id: 'a2000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Energy transition',
    deal_type: 'Growth equity',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: 'Growth capital for a Saudi industrial services platform.',
    unlocked: false,
    intro_status: null,
    ...extra,
  }
}

function opportunity(extra: Record<string, unknown>) {
  return {
    id: 'b1000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    ...extra,
  }
}

function partner(extra: Record<string, unknown> = {}) {
  return {
    id: 'b2000001-0000-4000-8000-000000000001',
    is_demo: true,
    category_slug: 'real_estate',
    name: 'Wahat Title Counsel',
    kind: 'law',
    city: 'Riyadh',
    blurb: 'Counsel on title questions for a private property brief.',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    sponsor_tied: false,
    ...extra,
  }
}

function exampleRoom(): RoomCard {
  return {
    id: 'a3000001-0000-4000-8000-000000000001',
    is_demo: true,
    name: 'Industrial services room',
    summary: 'A working room for a growth brief in industrial services. Opened by admin.',
    sector: 'Energy transition',
    stage: 'Diligence',
    member_count: 4,
    host_name: 'Layla Al-Nadira',
  }
}
