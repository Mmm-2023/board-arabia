import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { DD_COPY, deskProgressLine, presentDeskError, REPORT_COPY } from '../src/lib/dueDiligenceCopy.ts'
import { deskPhase } from '../src/lib/dueDiligencePhase.ts'
import {
  HOMEPAGE_STEP,
  IP_STEP,
  LEGAL_NAME_STEP,
  MARKET_STEP,
  NEXT_STEP_VISIBLE_MAX,
  presentNextSteps,
  TRACTION_STEP,
  visibleNextSteps,
  WHO_PUBLIC_STEP,
} from '../src/lib/dueDiligenceNextSteps.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'
import {
  buildReport,
  containsVerdictLanguage,
  presentReport,
  type BuiltReport,
  DECK_MAX_BYTES,
  deckStoragePath,
  DUE_DILIGENCE_DISCLAIMER,
  extractCompanyUrl,
  extractDeckFacts,
  factsFromModelJson,
  htmlToText,
  isPublicIp,
  MEMBER_MESSAGES,
  memberFacingMessage,
  mergeModelFacts,
  NOT_STATED,
  parsePublicHttpsUrl,
  publicHitMatchesTerm,
  publicSearchTerms,
  readStoredReport,
  relatedCompanyUrls,
  safeFileName,
  sniffDeck,
  textFromOfficeXml,
  VERDICT_LABEL,
  wikiHitMatchesTerm,
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
  assert.equal(
    deskPhase({
      loadState: 'ready',
      activeJob: false,
      jobError: false,
      formError: true,
      fileChosen: true,
      reportCount: 0,
    }),
    'job-error',
  )
  const page = readFileSync(path.join(root, 'src/pages/dashboard/DueDiligencePage.tsx'), 'utf8')
  const copy = readFileSync(path.join(root, 'src/lib/dueDiligenceCopy.ts'), 'utf8')
  assert.match(page, /phase === 'idle-empty'/)
  assert.match(page, /phase === 'job-error'/)
  assert.equal(/reports\.length === 0 \?/.test(page), false)
  assert.match(page, /AI Due Diligence/)
  assert.match(copy, /Check this deck/)
  assert.match(page, /\{progress\}%/)
  assert.match(page, /hidden text-\[0\.72rem\][^"]*md:block/)
  assert.equal(page.includes('Ready to check this deck'), false)
  assert.equal(copy.includes('Ready to check this deck'), false)
})

test('desk progress and errors use the member strings', () => {
  assert.equal(deskProgressLine('Reading the deck'), DD_COPY.statusReading)
  assert.equal(deskProgressLine('Checking public sources'), DD_COPY.statusResearching)
  assert.equal(deskProgressLine('Writing the note'), DD_COPY.statusWriting)
  assert.equal(deskProgressLine('Queued'), DD_COPY.ctaRunning)
  assert.equal(deskProgressLine('Working'), DD_COPY.statusRunning)
  assert.equal(presentDeskError(MEMBER_MESSAGES.start), DD_COPY.errorStart)
  assert.equal(presentDeskError(MEMBER_MESSAGES.unreadable), DD_COPY.errorUnreadable)
  assert.equal(presentDeskError(MEMBER_MESSAGES.scanned), DD_COPY.errorUnreadable)
  assert.equal(presentDeskError(MEMBER_MESSAGES.rate), DD_COPY.errorRate)
  assert.equal(presentDeskError(MEMBER_MESSAGES.finish), DD_COPY.errorGeneric)
  assert.equal(presentDeskError(DD_COPY.errorNetwork), DD_COPY.errorNetwork)
  assert.equal(presentDeskError(MEMBER_MESSAGES.url), MEMBER_MESSAGES.url)
  assert.equal(MEMBER_VIEWS.dueDiligence.empty, DD_COPY.emptyHistory)
  assert.equal(MEMBER_VIEWS.dueDiligence.ready, DD_COPY.fileChosen)
})

test('desk screen keeps one status and puts the error under the check button', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = (await vite.ssrLoadModule('/src/shell/renderDueDesk.tsx')) as {
      renderDueDeskStates: () => { idle: string; chosen: string; error: string; running: string }
    }
    const { idle, chosen, error, running } = mod.renderDueDeskStates()
    assert.ok(idle.includes(DD_COPY.introPrimary))
    assert.ok(idle.includes(DD_COPY.introShort))
    assert.ok(idle.includes(DD_COPY.introSupporting))
    assert.ok(idle.includes(DUE_DILIGENCE_DISCLAIMER))
    assert.ok(idle.includes(DD_COPY.doesHeading))
    assert.ok(idle.includes(DD_COPY.willNotHeading))
    assert.ok(idle.includes('Rate a deal as good or bad'))
    assert.ok(idle.includes(DD_COPY.idle))
    assert.ok(idle.includes(DD_COPY.emptyHistory))
    assert.ok(idle.includes(DD_COPY.siteHelper))
    assert.ok(idle.includes(DD_COPY.siteHelperShort))
    assert.ok(idle.includes(DD_COPY.deckHint))
    assert.ok(idle.includes('Choose a deck first'))
    assert.ok(idle.indexOf(DD_COPY.deckLabel) < idle.indexOf(DD_COPY.ctaDisabled))
    assert.ok(idle.indexOf(DD_COPY.ctaDisabled) < idle.indexOf(DD_COPY.siteLabel))
    assert.equal(idle.includes(DD_COPY.errorStart), false)
    assert.match(idle, /min-h-11 w-full/)

    assert.ok(chosen.includes(DD_COPY.fileChosen))
    assert.ok(chosen.includes('Check this deck'))
    assert.ok(chosen.includes('GCC Partnership Proposal.pdf'))
    assert.equal(chosen.includes(DD_COPY.emptyHistory), false)
    assert.equal(chosen.includes(DD_COPY.errorStart), false)

    assert.ok(error.indexOf('Check this deck') < error.indexOf('id="dd-action-error"'))
    assert.ok(error.indexOf('id="dd-action-error"') < error.indexOf(DD_COPY.siteLabel))
    assert.ok(error.includes(DD_COPY.errorStart))
    assert.ok(error.includes(DD_COPY.errorRetry))
    assert.equal(error.includes(DD_COPY.emptyHistory), false)
    assert.equal(error.includes(DD_COPY.fileChosen), false)
    assert.equal(error.includes(DD_COPY.idle), false)
    assert.equal(error.includes('Ready to check this deck'), false)

    assert.ok(running.includes(DD_COPY.statusReading))
    assert.ok(running.includes('40%'))
    assert.ok(running.includes(DD_COPY.progressHint))
    assert.equal(running.includes(DD_COPY.emptyHistory), false)
    assert.equal(running.includes(DD_COPY.errorStart), false)
    assert.equal(running.includes(DD_COPY.fileChosen), false)
    assert.equal(running.includes(DD_COPY.idle), false)

    const blob = [idle, chosen, error, running].join('\n')
    assert.equal(blob.includes('\u2014'), false)
    assert.equal(blob.includes('\u2013'), false)
    assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|invest|pass|fail)\b/i.test(blob), false)
  } finally {
    await vite.close()
  }
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
    readFileSync(path.join(root, 'src/pages/dashboard/DueDiligenceReport.tsx'), 'utf8'),
    readFileSync(path.join(root, 'src/lib/dueDiligenceCopy.ts'), 'utf8'),
    readFileSync(path.join(root, 'src/lib/dueDiligenceNextSteps.ts'), 'utf8'),
    JSON.stringify(DD_COPY),
    JSON.stringify(REPORT_COPY),
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

test('Clearlake-style wiki hit is rejected for Goldman Capital Consortium', () => {
  const gcc = `${readFileSync(path.join(root, 'scripts/fixtures/gcc-goldman.txt'), 'utf8')}\nThe consortium\u0005serves 120 enterprise customers across three cities.\nDesk phone +92 51 123 4567 should not become a claim.\n`
  const facts = extractDeckFacts(gcc)
  assert.equal(facts.company, 'Goldman Capital Consortium')
  assert.equal(facts.sector, NOT_STATED)
  assert.equal(facts.ask, NOT_STATED)
  assert.equal(
    facts.claims.some((claim) => /islamabad|khayban|partnership proposal|seeking to establish|clearlake|vision 2030/i.test(claim.text)),
    false,
  )
  assert.equal(
    facts.claims.some((claim) => [...claim.text].some((char) => char.charCodeAt(0) < 32)),
    false,
  )
  assert.equal(facts.claims.some((claim) => claim.text.includes('120 enterprise customers')), true)
  assert.equal(facts.claims.some((claim) => claim.kind === 'traction' && /partnership proposal/i.test(claim.text)), false)
  assert.equal(wikiHitMatchesTerm('Clearlake Capital', 'Goldman Capital Consortium'), false)
  assert.equal(wikiHitMatchesTerm('Goldman Capital Consortium', 'Goldman Capital Consortium'), true)
  assert.equal(
    publicHitMatchesTerm(
      'Clearlake Capital',
      'https://en.wikipedia.org/wiki/Clearlake_Capital',
      'Goldman Capital Consortium',
    ),
    false,
  )
  assert.equal(
    publicHitMatchesTerm(
      'Clearlake Capital',
      'https://www.wikidata.org/wiki/Q123',
      'Goldman Capital Consortium',
    ),
    false,
  )
  assert.equal(
    publicHitMatchesTerm('Home', 'https://www.goldmancapital.example/', 'Goldman Capital Consortium'),
    true,
  )
  assert.equal(
    publicHitMatchesTerm('Clearlake Capital', 'https://clearlake.example/about', 'Goldman Capital Consortium'),
    false,
  )
  assert.equal(extractCompanyUrl(gcc), 'https://www.goldmancapital.example/about')
  assert.equal(publicSearchTerms(facts).some((term) => /clearlake/i.test(term)), false)
  assert.ok(publicSearchTerms(facts).includes('Goldman Capital Consortium'))
  const report = buildReport(facts, [], { companyUrl: null })
  const steps = report.next_steps.join('\n')
  assert.match(steps, /Confirm the legal name/)
  assert.match(steps, /Point to a public homepage/)
  assert.match(steps, /Name who is public/)
  assert.match(steps, /Cite the market figure/)
  assert.match(steps, /Show a public traction proof/)
  assert.match(report.next_steps.at(-1) || '', /public-source assist/)
  assert.match(report.next_steps.at(-1) || '', /not legal advice/)
  assert.equal(steps.includes('\u2014'), false)
  assert.equal(steps.includes('\u2013'), false)
  assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|pass|fail)\b/i.test(steps), false)
  assert.equal(report.sources.some((source) => /clearlake/i.test(source.title)), false)
})

test('model facts stay inside the deck text and fall back when invented', () => {
  const invented = factsFromModelJson(
    {
      company: 'Clearlake Capital',
      sector: 'Health',
      ask: 'Facilitating market entry for companies seeking to establish a local office.',
      claims: [{ text: 'Clearlake Capital acquired the consortium last year.', kind: 'traction' }],
    },
    'Goldman Capital Consortium\nThe consortium serves 120 enterprise customers across three cities.',
  )
  assert.equal(invented, null)
  const supported = factsFromModelJson(
    {
      company: 'Northwind Logistics',
      sector: 'Health',
      ask: 'We are raising $4 million in a seed round.',
      claims: [
        { text: 'Northwind serves 120 enterprise customers across the Gulf.', kind: 'other' },
        { text: 'Strategic Partnership Proposal', kind: 'traction' },
      ],
    },
    `${DECK}\nStrategic Partnership Proposal\n`,
  )
  assert.ok(supported)
  assert.equal(supported?.company, 'Northwind Logistics')
  assert.equal(supported?.sector, NOT_STATED)
  assert.match(supported?.ask || '', /raising \$4 million/)
  assert.equal(supported?.claims.some((claim) => claim.text.includes('120 enterprise')), true)
  assert.equal(supported?.claims.some((claim) => /partnership proposal/i.test(claim.text)), false)
  assert.equal(supported?.claims.find((claim) => claim.text.includes('120 enterprise'))?.kind, 'traction')
  const merged = mergeModelFacts(
    factsFromModelJson(
      {
        company: '',
        sector: '',
        ask: '',
        claims: [{ text: 'Northwind serves 120 enterprise customers across the Gulf.', kind: 'traction' }],
      },
      DECK,
    ),
    extractDeckFacts(DECK),
  )
  assert.equal(merged.company, 'Northwind Logistics')
  assert.equal(merged.sector, 'Logistics')
  assert.equal(extractCompanyUrl('See https://en.wikipedia.org/wiki/Clearlake_Capital only.'), null)
  assert.deepEqual(relatedCompanyUrls('https://goldmancapital.example/'), [
    'https://goldmancapital.example/about',
    'https://goldmancapital.example/team',
  ])
  assert.deepEqual(relatedCompanyUrls('https://goldmancapital.example/about'), [])
  const alias = extractDeckFacts('Northwind Logistics LLC\nSector: logistics\nWe are raising $4 million in a seed round.\n')
  assert.ok(publicSearchTerms(alias).includes('Northwind Logistics LLC'))
  assert.ok(publicSearchTerms(alias).includes('Northwind Logistics'))
})

test('search and model calls stay behind env secrets', () => {
  const added = [
    'supabase/functions/due-diligence-start/index.ts',
    'supabase/functions/due-diligence-start/run.ts',
    'supabase/functions/due-diligence-start/sources.ts',
    'supabase/functions/due-diligence-start/llm.ts',
  ]
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n')
  assert.match(added, /Deno\.env\.get\('BA_DD_SEARCH_API_KEY'\)/)
  assert.match(added, /Deno\.env\.get\('BA_DD_LLM_API_KEY'\)/)
  assert.match(added, /Deno\.env\.get\('BA_DD_LLM_MODEL'\)/)
  assert.match(added, /Deno\.env\.get\('BA_DD_LLM_BASE_URL'\)/)
  assert.match(added, /extractCompanyUrl/)
  assert.match(added, /wikiHitMatchesTerm/)
  assert.match(added, /company_url: extracted/)
  assert.equal(/BA_DD_(LLM|SEARCH)_[A-Z_]*\s*=\s*['"][^'"]+['"]/.test(added), false)
  assert.equal(/sk-[A-Za-z0-9]{10,}/.test(added), false)
  assert.equal(/X-Subscription-Token['"]?\s*:\s*['"][A-Za-z0-9]{8,}['"]/.test(added), false)
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
    'src/pages/dashboard/DueDiligenceReport.tsx',
    'src/lib/dueDiligence.ts',
    'src/lib/dueDiligenceCopy.ts',
    'src/lib/dueDiligenceNextSteps.ts',
    'supabase/functions/due-diligence-start/index.ts',
    'supabase/functions/due-diligence-status/index.ts',
    'supabase/functions/due-diligence-start/run.ts',
    'supabase/functions/due-diligence-start/sources.ts',
    'supabase/functions/due-diligence-start/llm.ts',
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

const GENERIC_STEPS = [
  'Ask which customers or figures already appear on a public page or filing.',
  'Ask which public source states the market figure.',
  'Ask which public page supports this point.',
  'This note is a public-source assist. You decide the next conversation.',
]

test('generic next steps become the default checklist and a separate note', () => {
  const presented = presentNextSteps(GENERIC_STEPS)
  assert.deepEqual(
    presented.items.map((item) => item.title),
    [
      LEGAL_NAME_STEP.title,
      HOMEPAGE_STEP.title,
      WHO_PUBLIC_STEP.title,
      MARKET_STEP.title,
      TRACTION_STEP.title,
    ],
  )
  assert.deepEqual(
    presented.items.map((item) => item.ask),
    [LEGAL_NAME_STEP.ask, HOMEPAGE_STEP.ask, WHO_PUBLIC_STEP.ask, MARKET_STEP.ask, TRACTION_STEP.ask],
  )
  assert.equal(presented.closingNote, REPORT_COPY.closingNote)
  assert.equal(
    presented.items.some((item) => item.ask.includes('supports this point')),
    false,
  )
  assert.equal(visibleNextSteps(presented.items, false).length, NEXT_STEP_VISIBLE_MAX)
  for (const item of presented.items) {
    assert.ok(item.title.split(/\s+/).length <= 6, item.title)
  }
})

test('a weak offer area adds the IP ask after the default five', () => {
  const presented = presentNextSteps(GENERIC_STEPS, [
    { area: 'Offer and intellectual property', label: 'insufficient_public_data' },
  ])
  assert.equal(presented.items.length, 6)
  assert.equal(presented.items[5]?.id, IP_STEP.id)
  assert.equal(presented.items[5]?.ask, IP_STEP.ask)
  assert.equal(visibleNextSteps(presented.items, false).length, 5)
  assert.equal(visibleNextSteps(presented.items, true).length, 6)
})

test('a specific ask drops the vague supports line and keeps its own row', () => {
  const presented = presentNextSteps([
    'Ask for a public registry filing or a public profile for the named people.',
    'Ask which public page supports this point.',
    'This note is a public-source assist. You decide the next conversation.',
  ])
  assert.deepEqual(
    presented.items.map((item) => item.id),
    [WHO_PUBLIC_STEP.id],
  )
  assert.equal(presented.items[0]?.ask, WHO_PUBLIC_STEP.ask)
  assert.equal(presented.closingNote, REPORT_COPY.closingNote)
})

test('an orientation note is never a checklist row', () => {
  const presented = presentNextSteps([
    'Public pages can be incomplete. Ask management what is not on the public record.',
    'This note is a public-source assist. You decide the next conversation.',
  ])
  assert.equal(presented.items.length, 1)
  assert.equal(presented.items[0]?.title, 'Ask what is not public')
  assert.equal(
    presented.items.some((item) => item.ask.startsWith('This note is a public-source assist')),
    false,
  )
  const empty = presentNextSteps(['This note is a public-source assist. You decide the next conversation.'])
  assert.deepEqual(empty.items, [])
  assert.equal(empty.closingNote, REPORT_COPY.closingNote)
})

test('the ready report uses status pills, summary helpers, and a grouped checklist', async () => {
  const report: BuiltReport = {
    company_label: 'Northwind Logistics',
    sector_label: 'Logistics',
    ask_label: 'Raising a seed round',
    disclaimer: DUE_DILIGENCE_DISCLAIMER,
    publicly_consistent_pct: 25,
    not_publicly_verifiable_pct: 75,
    claims: [
      {
        text: 'Northwind serves 120 enterprise customers across the Gulf today.',
        kind: 'traction',
        verdict: 'publicly_consistent',
        note: 'This wording appears on a public page retrieved for this check.',
        sources: [{ title: 'Northwind public page', url: 'https://example.com/northwind' }],
      },
      {
        text: 'The global logistics market is 900 billion dollars this year.',
        kind: 'market',
        verdict: 'conflict_with_public_sources',
        note: 'A public page retrieved for this check states a different figure for this point.',
        sources: [],
      },
      {
        text: 'Our founder Sara Nasser previously led public listings abroad.',
        kind: 'team',
        verdict: 'insufficient_public_data',
        note: 'Public pages were too thin to compare this point with the deck.',
        sources: [],
      },
      {
        text: 'Patent pending on route packing software for Gulf lanes.',
        kind: 'ip',
        verdict: 'not_publicly_verifiable',
        note: 'Not found on the public pages retrieved for this check at all.',
        sources: [],
      },
    ],
    sources: [{ title: 'Northwind public page', url: 'https://example.com/northwind' }],
    next_steps: GENERIC_STEPS,
  }
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = (await vite.ssrLoadModule('/src/shell/renderDueReport.tsx')) as {
      renderDueReport: (value: BuiltReport, fileName: string, preparedAt: string) => string
    }
    const html = mod.renderDueReport(report, 'Northwind.pdf', '2026-09-26T12:00:00.000Z')
    assert.ok(html.includes(DUE_DILIGENCE_DISCLAIMER))
    assert.ok(html.includes(REPORT_COPY.summaryConsistentHelper))
    assert.ok(html.includes(REPORT_COPY.summaryNotVerifiableHelper))
    assert.ok(html.includes('dd-summary-consistent'))
    assert.ok(html.includes('dd-summary-neutral'))
    assert.equal(html.includes('dd-pill-conflict'), true)
    assert.equal(html.includes('dd-pill-insufficient'), true)
    assert.equal(html.includes('dd-pill-neutral'), true)
    assert.equal(html.includes('dd-pill-consistent'), true)
    assert.ok(html.includes('data-dd-pill="publicly_consistent"'))
    assert.ok(html.includes('data-dd-pill="not_publicly_verifiable"'))
    assert.ok(html.includes('data-dd-pill="insufficient_public_data"'))
    assert.ok(html.includes('data-dd-pill="conflict_with_public_sources"'))
    assert.ok(html.includes(REPORT_COPY.metaAim))
    assert.equal(html.includes('>Ask<'), false)
    assert.ok(html.includes('data-scorecard="cards"'))
    assert.ok(html.includes('md:hidden'))
    assert.ok(html.includes('data-scorecard="table"'))
    assert.ok(html.includes('hidden overflow-x-auto'))
    const cards = html.slice(html.indexOf('data-scorecard="cards"'), html.indexOf('data-scorecard="table"'))
    assert.equal(cards.includes('grid-cols-3'), false)
    assert.ok(html.includes(REPORT_COPY.more))
    assert.ok(html.includes('Priority 1'))
    assert.ok(html.includes('Confirm what is public'))
    assert.ok(html.includes('Priority 2'))
    assert.ok(html.includes('Fill evidence gaps'))
    assert.ok(html.includes(REPORT_COPY.groupNote))
    assert.ok(html.includes(REPORT_COPY.closingNote))
    assert.ok(html.includes(REPORT_COPY.copyAsk))
    assert.ok(html.includes('type="checkbox"'))
    assert.ok(html.includes('data-next-note="true"'))
    assert.equal(html.includes('list-decimal'), false)
    assert.ok(html.includes('https://example.com/northwind'))
    assert.ok(html.includes('rel="noopener noreferrer"'))
    const noteAt = html.indexOf('data-next-note="true"')
    assert.equal(html.slice(noteAt).includes('type="checkbox"'), false)
    assert.equal(html.includes('\u2014'), false)
    assert.equal(html.includes('\u2013'), false)
    assert.equal(/\b(valid|invalid|investable|approved|rejected|fraud|PASS|FAIL)\b/.test(html), false)
    const summaryAt = html.indexOf(REPORT_COPY.sectionSummary)
    const scorecardAt = html.indexOf(REPORT_COPY.sectionScorecard)
    assert.ok(summaryAt > 0 && summaryAt < scorecardAt)
  } finally {
    await vite.close()
  }
})
