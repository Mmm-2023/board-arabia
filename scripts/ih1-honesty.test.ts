import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer, type ViteDevServer } from 'vite'
import { AI_TOOL_FLAG_DEFAULTS, type AiToolKey } from '../supabase/functions/_shared/ai_tools.ts'
import { nextWeeklyInviteRemaining, WEEKLY_INVITE_CAP } from '../supabase/functions/_shared/invite_refill.ts'
import { AI_OUTPUT_ACK } from '../src/lib/aiToolUi.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const ACK = 'I understand this is AI output, not legal, financial or investment advice.'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const slots = {
  entity: 'Example',
  cr: 'Example',
  provider: 'Example',
  privacy: '/privacy',
  terms: '/terms',
  retentionDays: 30,
  date: '06 Oct 2026',
}

type CopyMod = {
  renderToolCopy: (tool: AiToolKey, lang: 'en', slots: typeof slots) => { title: string; consent: string }
}

type FormProps = Record<string, unknown>

let vite: ViteDevServer
let copyMod: CopyMod
let desk: { AiToolForm: (props: FormProps) => ReactNode }
let deal: { DealReadinessForm: (props: FormProps) => ReactNode }
let market: { MarketBriefForm: (props: FormProps) => ReactNode }
let dd: { DueDiligenceDeskView: (props: FormProps) => ReactNode }

test.before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  copyMod = (await vite.ssrLoadModule('/src/lib/aiToolCopy.ts')) as CopyMod
  desk = (await vite.ssrLoadModule('/src/components/ai/AiToolDesk.tsx')) as typeof desk
  deal = (await vite.ssrLoadModule('/src/components/ai/DealReadinessView.tsx')) as typeof deal
  market = (await vite.ssrLoadModule('/src/components/ai/MarketBriefForm.tsx')) as typeof market
  dd = (await vite.ssrLoadModule('/src/pages/dashboard/DueDiligencePage.tsx')) as typeof dd
})

test.after(async () => {
  await vite.close()
})

function page(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

function assertTickGates(off: string, on: string, runAttr: 'data-ai-run' | 'data-dd-run') {
  for (const html of [off, on]) {
    assert.match(html, /I understand this is AI output, not legal, financial or investment advice\./)
    assert.equal(html.includes('\u2014'), false)
    assert.equal(html.includes('\u2013'), false)
    assert.equal(/nammco/i.test(html), false)
  }
  assert.match(off, /data-ai-ack="off"/)
  assert.match(off, new RegExp(`${runAttr}="off"`))
  assert.match(off, new RegExp(`disabled=""[^>]*${runAttr}="off"`))
  assert.match(on, /data-ai-ack="on"/)
  assert.match(on, new RegExp(`${runAttr}="on"`))
  assert.equal(new RegExp(`disabled=""[^>]*${runAttr}="on"`).test(on), false)
}

function uploadForm(tool: AiToolKey, acknowledged: boolean, consented: boolean) {
  const copy = copyMod.renderToolCopy(tool, 'en', slots)
  return page(
    createElement(desk.AiToolForm, {
      copy,
      consented,
      acknowledged,
      fileName: 'example.pdf',
      busy: false,
      inputsReady: true,
      onConsent: () => {},
      onAcknowledge: () => {},
      onFile: () => {},
      onRun: () => {},
    }),
  )
}

test('AI output acknowledgement matches the lock sentence', () => {
  assert.equal(AI_OUTPUT_ACK, ACK)
  assert.equal(ACK.includes('\u2014'), false)
})

test('CFO check stays disabled until the AI acknowledgement is ticked', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.cfo_check, false)
  const copy = copyMod.renderToolCopy('cfo_check', 'en', slots)
  const off = uploadForm('cfo_check', false, true)
  const on = uploadForm('cfo_check', true, true)
  const consentOff = uploadForm('cfo_check', true, false)
  assert.match(off, /An AI first read of your accounts or model/)
  assert.equal(copy.title, 'CFO check')
  assertTickGates(off, on, 'data-ai-run')
  assert.match(consentOff, /data-ai-run="off"/)
  assert.match(consentOff, /data-consent="off"/)
})

test('Market brief stays disabled until the AI acknowledgement is ticked', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.market_brief, false)
  const copy = copyMod.renderToolCopy('market_brief', 'en', slots)
  const props = (acknowledged: boolean, consented: boolean) =>
    page(
      createElement(market.MarketBriefForm, {
        copy,
        sector: 'Health',
        consented,
        acknowledged,
        busy: false,
        onSector: () => {},
        onConsent: () => {},
        onAcknowledge: () => {},
        onRun: () => {},
      }),
    )
  const off = props(false, true)
  const on = props(true, true)
  assert.match(off, /An AI brief on entering the Saudi market/)
  assert.equal(copy.title, 'Market brief')
  assertTickGates(off, on, 'data-ai-run')
  assert.match(props(true, false), /data-ai-run="off"/)
})

test('Term sheet review stays disabled until the AI acknowledgement is ticked', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.term_sheet_review, false)
  const off = uploadForm('term_sheet_review', false, true)
  const on = uploadForm('term_sheet_review', true, true)
  assert.match(off, /An AI read of a term sheet/)
  assert.equal(copyMod.renderToolCopy('term_sheet_review', 'en', slots).title, 'Term sheet reviewer')
  assertTickGates(off, on, 'data-ai-run')
  assert.match(uploadForm('term_sheet_review', true, false), /data-ai-run="off"/)
})

test('Pricing sense check stays disabled until the AI acknowledgement is ticked', () => {
  assert.equal(AI_TOOL_FLAG_DEFAULTS.pricing_sense_check, false)
  const off = uploadForm('pricing_sense_check', false, true)
  const on = uploadForm('pricing_sense_check', true, true)
  assert.match(off, /An AI comparison of an asking price/)
  assert.equal(copyMod.renderToolCopy('pricing_sense_check', 'en', slots).title, 'Pricing sense-check')
  assertTickGates(off, on, 'data-ai-run')
  assert.match(uploadForm('pricing_sense_check', true, false), /data-ai-run="off"/)
})

test('Deal readiness memo stays disabled until the AI acknowledgement is ticked', () => {
  const copy = copyMod.renderToolCopy('deal_readiness', 'en', slots)
  const props = (acknowledged: boolean, consented: boolean) =>
    page(
      createElement(deal.DealReadinessForm, {
        copy,
        retentionDays: 30,
        consented,
        acknowledged,
        fileName: 'example-teaser.txt',
        busy: false,
        onConsent: () => {},
        onAcknowledge: () => {},
        onFile: () => {},
        onRun: () => {},
      }),
    )
  const off = props(false, true)
  const on = props(true, true)
  assert.match(off, /Read the teaser or information memorandum you upload/)
  assert.equal(copy.title, 'Deal readiness memo')
  assertTickGates(off, on, 'data-ai-run')
  assert.match(props(true, false), /data-ai-run="off"/)
})

test('AI Due Diligence stays disabled until the AI acknowledgement is ticked', () => {
  const props = (acknowledged: boolean) =>
    page(
      createElement(dd.DueDiligenceDeskView, {
        phase: 'file-chosen',
        loadState: 'ready',
        fileName: 'example-deck.pdf',
        companyUrl: '',
        busy: false,
        activeJob: false,
        progress: 0,
        progressLabel: '',
        actionError: '',
        reports: [],
        acknowledged,
        onAcknowledge: () => {},
        onCompanyUrl: () => {},
        onFile: () => {},
        onSubmit: (event: { preventDefault: () => void }) => event.preventDefault(),
        onRetry: () => {},
        onReload: () => {},
      }),
    )
  const off = props(false)
  const on = props(true)
  assert.match(off, /AI Due Diligence/)
  assert.match(off, /Check this deck/)
  assertTickGates(off, on, 'data-dd-run')
  const pageSource = read('src/pages/dashboard/DueDiligencePage.tsx')
  assert.equal(pageSource.includes('recordAiToolConsent'), false)
  assert.equal(pageSource.includes('record_ai_tool_consent'), false)
  assert.match(read('src/pages/dashboard/AiToolPage.tsx'), /setAcknowledged\(false\)/)
})

test('help says invites refill to 2 each Monday and unused invites do not stack', () => {
  const help = read('src/pages/dashboard/HelpPage.tsx')
  const start = help.indexOf('How do peer invites work?')
  const end = help.indexOf("to: '/dashboard/people/invites'")
  assert.ok(start > 0 && end > start)
  const answer = help.slice(start, end)
  assert.match(answer, /Your invites refill to 2 each Monday\. Unused invites do not stack\./)
  assert.match(answer, /our admin team/)
  assert.equal(answer.includes('Unused invites do not refill.'), false)
  assert.equal(answer.includes('the desk'), false)
  assert.equal(answer.includes('\u2014'), false)
  assert.equal(/nammco/i.test(answer), false)
  assert.equal(WEEKLY_INVITE_CAP, 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'ksa', remaining: 0, granted: 2 }, true), 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'ksa', remaining: 2, granted: 2 }, true), 2)
  assert.equal(nextWeeklyInviteRemaining({ seat: 'intl', remaining: 1, granted: 2 }, true), 2)
  const sql = read('supabase/migrations/20261121120000_weekly_peer_invite_refill.sql')
  assert.match(sql, /set invites_remaining = least\(2, m\.invites_granted\)/)
  assert.match(sql, /m\.invites_remaining < least\(2, m\.invites_granted\)/)
  const edge = read('supabase/functions/refill-weekly-invites/index.ts')
  assert.match(edge, /refill_weekly_peer_invites/)
  assert.equal(read('supabase/config.toml').includes('Monday'), false)
})

test('rooms empty state describes a private room and does not promise documents, terms, or messages', () => {
  const line = MEMBER_VIEWS.rooms.empty
  assert.equal(
    line,
    'Open a private room for a deal, link a mandate or an opportunity, and invite chosen members.',
  )
  assert.equal(/document|terms|messag/i.test(line), false)
  assert.equal(line.includes('\u2014'), false)
  assert.equal(line.includes('\u2013'), false)
  assert.equal(/nammco/i.test(line), false)
  assert.equal(line.includes('the desk'), false)
})
