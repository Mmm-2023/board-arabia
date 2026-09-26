import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { deskPhase } from '../src/lib/dueDiligencePhase.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'
import {
  buildReport,
  containsVerdictLanguage,
  presentReport,
  DECK_MAX_BYTES,
  deckStoragePath,
  DUE_DILIGENCE_DISCLAIMER,
  extractDeckFacts,
  htmlToText,
  isPublicIp,
  MEMBER_MESSAGES,
  memberFacingMessage,
  parsePublicHttpsUrl,
  publicSearchTerms,
  readStoredReport,
  safeFileName,
  sniffDeck,
  textFromOfficeXml,
  VERDICT_LABEL,
} from '../supabase/functions/_shared/due_diligence.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const DECK = `Northwind Logistics
Sector: logistics
We are raising $4 million in a seed round.
Northwind serves 120 enterprise customers across the Gulf.
The global logistics market is $900 billion.
Our founder Sara Nasser previously led public listings.
Patent pending on route packing software.
This deal is valid and already approved for investors.`

test('deck facts keep checkable claims and drop verdict language', () => {
  const facts = extractDeckFacts(DECK)
  assert.equal(facts.company, 'Northwind Logistics')
  assert.equal(facts.sector, 'Logistics')
  assert.match(facts.ask, /raising \$4 million/)
  assert.equal(facts.claims.some((claim) => containsVerdictLanguage(claim.text)), false)
  assert.equal(facts.claims.some((claim) => claim.kind === 'traction'), true)
  assert.equal(facts.claims.some((claim) => claim.kind === 'ip'), true)
  assert.equal(facts.claims.some((claim) => claim.kind === 'team'), true)
  assert.ok(publicSearchTerms(facts).includes('Northwind Logistics'))
  assert.ok(publicSearchTerms(facts).some((term) => term.includes('Sara Nasser')))
})

test('public comparison cites only a page that actually supports the claim', () => {
  const facts = extractDeckFacts(DECK)
  const pages = [
    {
      title: 'Northwind Logistics',
      url: 'https://en.wikipedia.org/wiki/Northwind_Logistics',
      text: 'Northwind Logistics serves 120 enterprise customers across the Gulf.',
    },
  ]
  const report = buildReport(facts, pages)
  assert.equal(report.disclaimer, DUE_DILIGENCE_DISCLAIMER)
  assert.equal(
    (report.publicly_consistent_pct ?? 0) + (report.not_publicly_verifiable_pct ?? 0),
    100,
  )
  const traction = report.claims.find((claim) => claim.text.includes('120 enterprise'))
  assert.equal(traction?.verdict, 'publicly_consistent')
  assert.equal(traction?.sources[0]?.url, 'https://en.wikipedia.org/wiki/Northwind_Logistics')
  const market = report.claims.find((claim) => claim.text.includes('900 billion'))
  assert.equal(market?.verdict, 'not_publicly_verifiable')
  assert.deepEqual(market?.sources, [])
  const ip = report.claims.find((claim) => claim.kind === 'ip')
  assert.equal(ip?.verdict, 'not_publicly_verifiable')
  assert.equal(report.sources.length, 1)
  assert.ok(report.next_steps.length >= 2)
  const blob = JSON.stringify(report)
  assert.equal(blob.includes('\u2014'), false)
  assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|invest|pass)\b/i.test(blob), false)
})

test('thin public sources stay needs follow-up and do not invent a percentage of zero as a citation', () => {
  const facts = extractDeckFacts(DECK)
  const report = buildReport(facts, [])
  assert.ok(report.claims.length > 0)
  assert.equal(report.claims.every((claim) => claim.verdict === 'insufficient_public_data'), true)
  assert.equal(report.sources.length, 0)
  assert.equal(report.claims.every((claim) => claim.sources.length === 0), true)
  assert.notEqual(report.publicly_consistent_pct, null)
  assert.equal(report.publicly_consistent_pct, 0)
  assert.equal(report.not_publicly_verifiable_pct, 100)
})

test('no checkable claims leaves both percentages empty', () => {
  const report = buildReport(
    { company: 'Northwind', sector: 'Logistics', ask: 'Not stated in the deck', claims: [] },
    [],
  )
  assert.equal(report.publicly_consistent_pct, null)
  assert.equal(report.not_publicly_verifiable_pct, null)
  assert.match(report.next_steps[0] || '', /did not state a checkable claim/)
})

test('a different public figure is a conflict, not a deal verdict', () => {
  const facts = extractDeckFacts(DECK)
  const report = buildReport(facts, [
    {
      title: 'Northwind Logistics',
      url: 'https://en.wikipedia.org/wiki/Northwind_Logistics',
      text: 'The global logistics market is $90 billion according to the public page.',
    },
  ])
  const market = report.claims.find((claim) => claim.text.includes('900 billion'))
  assert.equal(market?.verdict, 'conflict_with_public_sources')
  assert.match(market?.note || '', /different figure/)
  const presented = presentReport(report, 'Northwind.pdf')
  assert.equal(presented.areas.length, 5)
  assert.equal(presented.findings.length, 5)
  assert.deepEqual(
    presented.areas.map((area) => area.area),
    [
      'Entity and company',
      'Team and founders',
      'Traction and partnerships',
      'Market',
      'Offer and intellectual property',
    ],
  )
  assert.equal(presented.areas.find((area) => area.area === 'Market')?.label, 'conflict_with_public_sources')
  assert.equal(presented.findings[0]?.number, 1)
  assert.ok(presented.findings.every((section) => section.rows.length > 0))
  assert.match(presented.overview, /publicly consistent/)
  assert.match(presented.overview, /not publicly verifiable/)
  assert.equal(presented.documents_reviewed, 'Northwind.pdf')
  const blob = JSON.stringify(presented)
  assert.equal(blob.includes('\u2014'), false)
  assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|invest|pass|fail)\b/i.test(blob), false)
  assert.equal(/red flag|do not engage/i.test(blob), false)
})

test('older saved notes still open when verdict labels change', () => {
  const good = buildReport(extractDeckFacts(DECK), [])
  const stored = readStoredReport({
    ...good,
    claims: good.claims.map((claim) => ({ ...claim, verdict: 'not_found' })),
  })
  assert.ok(stored)
  assert.equal(stored?.claims.every((claim) => claim.verdict === 'not_publicly_verifiable'), true)
  const followUp = readStoredReport({
    ...good,
    claims: good.claims.map((claim) => ({ ...claim, verdict: 'needs_follow_up' })),
  })
  assert.equal(followUp?.claims[0]?.verdict, 'insufficient_public_data')
  const presented = presentReport(stored || good, 'Northwind.pdf')
  assert.equal(presented.areas.length, 5)
})

test('desk status never stacks the empty state with an error', () => {
  assert.equal(
    deskPhase({ loadState: 'ready', activeJob: false, jobError: true, fileChosen: true, reportCount: 0 }),
    'job-error',
  )
  assert.equal(
    deskPhase({ loadState: 'ready', activeJob: false, jobError: false, fileChosen: true, reportCount: 0 }),
    'file-chosen',
  )
  assert.equal(
    deskPhase({ loadState: 'ready', activeJob: true, jobError: true, fileChosen: true, reportCount: 0 }),
    'running',
  )
  assert.equal(
    deskPhase({ loadState: 'ready', activeJob: false, jobError: false, fileChosen: false, reportCount: 0 }),
    'idle-empty',
  )
  assert.equal(
    deskPhase({ loadState: 'ready', activeJob: false, jobError: false, fileChosen: false, reportCount: 2 }),
    'idle',
  )
  const page = readFileSync(path.join(root, 'src/pages/dashboard/DueDiligencePage.tsx'), 'utf8')
  assert.match(page, /phase === 'idle-empty'/)
  assert.match(page, /phase === 'job-error'/)
  assert.equal(/reports\.length === 0 \?/.test(page), false)
  assert.match(page, /AI Due Diligence/)
  assert.match(page, /Check this deck/)
})

test('stored notes reject a percentage pair that does not add up', () => {
  const good = buildReport(extractDeckFacts(DECK), [])
  assert.ok(readStoredReport(good))
  assert.equal(
    readStoredReport({ ...good, publicly_consistent_pct: 40, not_publicly_verifiable_pct: 40 }),
    null,
  )
})

test('an older unreadable deck message stays specific', () => {
  assert.equal(
    memberFacingMessage('Could not read this deck. Upload a text-based PDF or PPTX.', MEMBER_MESSAGES.finish),
    MEMBER_MESSAGES.unreadable,
  )
  assert.equal(memberFacingMessage('internal stack', MEMBER_MESSAGES.finish), MEMBER_MESSAGES.finish)
  assert.match(MEMBER_MESSAGES.scanned, /cannot read text inside images/)
})

test('public https guard blocks private hosts and odd ports', () => {
  assert.equal(parsePublicHttpsUrl('https://example.com/about').ok, true)
  assert.equal(parsePublicHttpsUrl('http://example.com').ok, false)
  assert.equal(parsePublicHttpsUrl('https://127.0.0.1/latest').ok, false)
  assert.equal(parsePublicHttpsUrl('https://localhost/admin').ok, false)
  assert.equal(parsePublicHttpsUrl('https://user:secret@example.com/a').ok, false)
  assert.equal(parsePublicHttpsUrl('https://example.com:8443/a').ok, false)
  assert.equal(parsePublicHttpsUrl('https://metadata.google.internal/').ok, false)
  assert.equal(isPublicIp('8.8.8.8'), true)
  assert.equal(isPublicIp('10.1.1.1'), false)
  assert.equal(isPublicIp('192.168.0.8'), false)
  assert.equal(isPublicIp('169.254.169.254'), false)
  assert.equal(isPublicIp('::1'), false)
})

test('deck path and file sniff stay on the member prefix', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const deckId = '22222222-2222-4222-8222-222222222222'
  assert.equal(deckStoragePath(userId, deckId, 'pdf'), `${userId}/${deckId}/source.pdf`)
  assert.equal(deckStoragePath('not-a-user', deckId, 'pdf'), null)
  assert.equal(sniffDeck(new Uint8Array([0x25, 0x50, 0x44, 0x46])), 'pdf')
  assert.equal(sniffDeck(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), 'pptx')
  assert.equal(sniffDeck(new Uint8Array([1, 2, 3, 4])), null)
  assert.equal(DECK_MAX_BYTES, 15 * 1024 * 1024)
  assert.equal(safeFileName('../secret.pdf', 'pdf'), 'secret.pdf')
  assert.equal(textFromOfficeXml('<a:t>Raising in public</a:t><a:t>markets</a:t>'), 'Raising in public markets')
  assert.equal(htmlToText('<style>h1{}</style><p>Hello&amp;Co</p>'), 'Hello&Co')
})

test('member copy uses the locked score language', () => {
  const ui = [
    readFileSync(path.join(root, 'src/pages/dashboard/DueDiligencePage.tsx'), 'utf8'),
    JSON.stringify(MEMBER_VIEWS.dueDiligence),
    JSON.stringify(MEMBER_MESSAGES),
    JSON.stringify(VERDICT_LABEL),
    DUE_DILIGENCE_DISCLAIMER,
  ].join('\n')
  assert.match(ui, /AI Due Diligence/)
  assert.match(ui, /Publicly consistent/)
  assert.match(ui, /Not publicly verifiable/)
  assert.match(ui, /Conflict with public sources/)
  assert.match(ui, /Insufficient public data/)
  assert.match(ui, /cannot read text inside images/)
  assert.equal(ui.includes('\u2014'), false)
  assert.equal(ui.includes('\u2013'), false)
  assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|invest|pass|fail)\b/i.test(ui), false)
  assert.equal(/red flag|do not engage/i.test(ui), false)
  assert.equal(/nammco/i.test(ui), false)
  assert.equal(/#[0-9a-f]{6}/i.test(ui), false)
  assert.equal(/calendar\.app\.google/i.test(ui), false)
})

test('migration locks RLS, storage, and the run limit without secrets', () => {
  const sql = readFileSync(
    path.join(root, 'supabase/migrations/20260926220000_due_diligence.sql'),
    'utf8',
  )
  assert.match(sql, /enable row level security/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /due-diligence-decks/)
  assert.match(sql, /rate_limited/)
  assert.match(sql, /due_diligence_consume_run/)
  assert.match(sql, /grant execute on function public\.due_diligence_consume_run\(uuid\) to service_role/)
  assert.match(sql, /revoke all on function public\.due_diligence_consume_run\(uuid\) from public, anon, authenticated/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(sql), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(sql), false)
  assert.equal(/\b(valid|invalid|investable|fraud)\b/i.test(sql), false)
  const added = [
    'src/pages/dashboard/DueDiligencePage.tsx',
    'src/lib/dueDiligence.ts',
    'supabase/functions/due-diligence-start/index.ts',
    'supabase/functions/due-diligence-status/index.ts',
    'supabase/functions/due-diligence-start/run.ts',
    'supabase/functions/due-diligence-start/sources.ts',
  ]
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n')
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(added), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(added), false)
  assert.equal(/SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(added), false)
  assert.equal(/nammco/i.test(added), false)
})

test('due diligence routes stay in the authenticated shell', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = (await vite.ssrLoadModule('/src/shell/renderDueRoute.tsx')) as {
      renderRoute: (entry: string) => string
    }
    for (const entry of [
      '/dashboard/due-diligence',
      '/dashboard/due-diligence/11111111-1111-4111-8111-111111111111',
    ]) {
      const html = mod.renderRoute(entry)
      assert.match(html, /Loading/)
      assert.equal(html.includes('Apply for consideration'), false, entry)
    }
  } finally {
    await vite.close()
  }
})
