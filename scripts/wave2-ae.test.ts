import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { AUDIENCE_LINE } from '../src/content/marketing.ts'
import type { HistoryItem } from '../src/lib/dueDiligence.ts'
import { assembleHome, type AssembleInput } from '../src/lib/homeSnapshot.ts'
import { profileCompleteness, weeklyIntrosOn } from '../src/lib/profileCompleteness.ts'
import { LEAVE_BOARD_PATH } from '../src/lib/leaveBoard.ts'
import { earlierRunsLabel, groupPriorNotes } from '../src/lib/priorNotes.ts'
import { FORMING_TOTALS } from '../src/lib/platformFloors.ts'
import { readinessLines } from '../src/lib/reOpportunityView.ts'
import { MEMBER_DESTINATIONS } from '../src/shell/destinations.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'
import { publicConsiderationCta } from '../src/lib/twoTierRegister.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function row(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'company_label'>): HistoryItem {
  return {
    created_at: '2026-10-01T09:00:00.000Z',
    file_name: 'deck.pdf',
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
    job_id: partial.id,
    ...partial,
  }
}

function homeInput(profileMatch: AssembleInput['profileMatch']): AssembleInput {
  return {
    nowMs: Date.parse('2026-10-05T09:00:00.000Z'),
    seat: 'ksa',
    name: 'Example Member',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: false,
    invitesRemaining: 0,
    personalCapacityIncluded: false,
    attention: [],
    mandates: [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 2,
    ksa: 1,
    intl: 1,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: null,
    profileMatch,
  }
}

test('weekly intros count a sector and availability, and a theme is not a gate', () => {
  const base = {
    photo: true,
    name: 'Example Member',
    title: 'Chair',
    organisation: 'Example House',
    city: 'Riyadh',
  }
  const both = profileCompleteness({ ...base, sectorCount: 0, availabilitySet: false }).find((row) => row.id === 'weekly')
  assert.equal(both?.missing, 2)
  assert.equal(both?.addLabel, 'Add 2 things')
  assert.equal(both?.href, '/dashboard/profile#focus')
  const one = profileCompleteness({ ...base, sectorCount: 0, availabilitySet: true }).find((row) => row.id === 'weekly')
  assert.equal(one?.addLabel, 'Add 1 thing')
  assert.equal(weeklyIntrosOn({ sectorCount: 1, availabilitySet: true }), true)
  assert.equal(weeklyIntrosOn({ sectorCount: 1, availabilitySet: false }), false)
  assert.equal(read('src/lib/homeSnapshot.ts').includes('Finish your profile: add sector and availability'), false)
  assert.equal(read('src/lib/suggestionProfile.ts').includes('PROFILE_PROMPT_LINE'), false)

  const missing = assembleHome(homeInput({ status: 'ready', availabilitySet: false, sectorSet: true }))
  assert.equal(missing.profileNudge, null)
  assert.equal(missing.profileMatchPending, false)
  const pending = assembleHome(homeInput({ status: 'loading', availabilitySet: false, sectorSet: false }))
  assert.equal(pending.profileNudge, null)
  assert.equal(pending.profileMatchPending, true)
  const done = assembleHome(homeInput({ status: 'ready', availabilitySet: true, sectorSet: true }))
  assert.equal(done.profileNudge, null)
  assert.equal(done.cta, null)
})

test('same-company prior runs collapse to one row with N earlier runs', () => {
  const groups = groupPriorNotes([
    row({ id: 'new', company_label: 'Jahez', created_at: '2026-10-03T09:00:00.000Z' }),
    row({ id: 'mid', company_label: 'jahez', created_at: '2026-10-02T09:00:00.000Z' }),
    row({ id: 'old', company_label: 'JAHEZ', created_at: '2026-10-01T09:00:00.000Z' }),
    row({ id: 'other', company_label: 'Made In KSA', created_at: '2026-09-01T09:00:00.000Z' }),
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].latest.id, 'new')
  assert.deepEqual(groups[0].earlier.map((item) => item.id), ['mid', 'old'])
  assert.equal(earlierRunsLabel(groups[0].earlier.length), '2 earlier runs')
  assert.equal(earlierRunsLabel(1), '1 earlier run')
  assert.equal(groups[1].latest.company_label, 'Made In KSA')
  assert.equal(groups[1].earlier.length, 0)
})

test('section 5 copy, one audience line, and the desk name', () => {
  assert.equal(FORMING_TOTALS, 'Totals appear once enough members opt in.')
  assert.equal(AUDIENCE_LINE, 'Chairpersons, Board members, and C-suite executives')
  assert.match(read('src/lib/homeSnapshot.ts'), /Add your capacity in Profile to count in the totals\./)
  assert.match(read('src/pages/LandingPage.tsx'), /What admitted members use, after sign-in/)
  assert.match(read('src/pages/LandingPage.tsx'), /One hundred complimentary founding places: fifty in Saudi Arabia and the GCC, fifty international\./)
  assert.match(read('src/pages/AboutPage.tsx'), /we email you a\s+private link/)
  assert.match(read('src/pages/HowItWorksPage.tsx'), /CONSIDERATION_NOTE/)
  assert.match(read('src/content/twoTierCopy.ts'), /Three short steps\. No account needed yet\./)
  assert.equal(read('src/pages/HowItWorksPage.tsx').includes('private booking'), false)
  assert.equal(STAFF_VIEWS.capacity.early, 'Totals go public once enough verified members opt in.')
  assert.match(MEMBER_VIEWS.realEstate.intro, /our admin team approves it/)
  assert.match(read('src/pages/dashboard/MandatesPage.tsx'), /our admin team approves it/)
  assert.ok(readinessLines({
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
  }).includes('White Land exposure: None'))
  const about = read('src/pages/AboutPage.tsx')
  const landing = read('src/pages/LandingPage.tsx')
  assert.match(about, /AUDIENCE_LINE/)
  assert.match(landing, /Membership for Chairpersons, Board members and C-suite executives/)
  assert.equal(about.includes('NEDs'), false)
  assert.equal(landing.includes('\u2014'), false)
  assert.equal(about.includes('\u2014'), false)
})

test('landing H1 is the promise and Who runs the desk names Michael without a new URL', () => {
  const landing = read('src/pages/LandingPage.tsx')
  assert.match(landing, /Where Saudi boardrooms meet international capital/)
  assert.match(read('src/components/Nav.tsx'), /BrandLockup/)
  const who = read('src/components/WhoRunsTheDesk.tsx')
  assert.match(who, /Who runs the desk/)
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  assert.equal(/nammco/i.test(who), false)
  assert.match(read('scripts/prerender.mjs'), /strayPublicNammco\(html, artifactPath\(route\)\)/)
  assert.match(read('scripts/public-nammco.mjs'), /\/nammco\/i\.test\(html\)/)
  assert.equal(/linkedin\.com/i.test(who), false)
  assert.equal(/https?:/i.test(who), false)
  assert.equal(/@/.test(who), false)
  assert.match(read('src/pages/AboutPage.tsx'), /WhoRunsTheDesk/)
  assert.match(read('src/pages/ApplyPage.tsx'), /WhoRunsTheDesk/)
})

test('leave uses the delete flow and does not add a member tab', () => {
  assert.equal(LEAVE_BOARD_PATH, '/dashboard/profile/leave')
  assert.equal(read('src/pages/dashboard/ProfilePage.tsx').includes('Leave Board Arabia'), false)
  assert.match(read('src/components/privacy/PrivacyPanelView.tsx'), /Leave Board Arabia/)
  assert.match(read('src/pages/dashboard/LeaveBoardArabia.tsx'), /DeleteAccountScreen/)
  assert.equal(read('src/pages/dashboard/LeaveBoardArabia.tsx').includes('sendDeskNote'), false)
  assert.equal(read('src/pages/dashboard/LeaveBoardArabia.tsx').includes('deleteCandidateAccount'), false)
  assert.match(read('src/pages/dashboard/account/DeleteAccountScreen.tsx'), /deleteCandidateAccount/)
  assert.deepEqual(
    MEMBER_DESTINATIONS.map((item) => item.label),
    ['Home', 'Deals', 'People', 'Majlis', 'AI tools'],
  )
  assert.equal(MEMBER_DESTINATIONS.some((item) => item.to.includes('leave')), false)
})

test('flag off still points public consideration at /apply', () => {
  assert.deepEqual(publicConsiderationCta(false), { to: '/apply', label: 'Apply for consideration' })
  assert.match(read('.github/workflows/pages.yml'), /VITE_TWO_TIER_REGISTER_ENABLED: 'false'/)
})

test('home and prior notes render the wave 2 lines', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const nudged = assembleHome(homeInput({ status: 'ready', availabilitySet: false, sectorSet: false }))
    const nudgeHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(home.HomeSnapshotView, { model: nudged })),
    )
    assert.equal(nudgeHtml.includes('Finish your profile: add sector and availability'), false)
    assert.equal((nudgeHtml.match(/data-home-cta=/g) || []).length, 1)
    assert.match(nudgeHtml, /href="\/dashboard\/deals"/)
    assert.match(nudgeHtml, />Explore deals</)
    assert.equal(nudgeHtml.includes('Nothing needs you right now'), false)

    const clear = assembleHome(homeInput({ status: 'ready', availabilitySet: true, sectorSet: true }))
    const clearHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(home.HomeSnapshotView, { model: clear })),
    )
    assert.equal(clearHtml.includes('Finish your profile'), false)
    assert.equal((clearHtml.match(/data-home-cta=/g) || []).length, 1)
    assert.match(clearHtml, />Explore deals</)

    const desk = await vite.ssrLoadModule('/src/pages/dashboard/DueDiligencePage.tsx')
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(desk.DueDiligenceDeskView, {
          phase: 'idle',
          loadState: 'ready',
          fileName: '',
          companyUrl: '',
          busy: false,
          activeJob: false,
          progress: 0,
          progressLabel: '',
          actionError: '',
          reports: [
            row({ id: 'a', company_label: 'Jahez' }),
            row({ id: 'b', company_label: 'Jahez' }),
            row({ id: 'c', company_label: 'Jahez' }),
          ],
          onCompanyUrl: () => {},
          onFile: () => {},
          onSubmit: (event: FormEvent) => event.preventDefault(),
          onRetry: () => {},
          onReload: () => {},
          onDelete: () => {},
        }),
      ),
    )
    assert.match(html, /2 earlier runs/)
    assert.equal((html.match(/>Delete</g) || []).length, 1)
    assert.equal(html.includes('\u2014'), false)
  } finally {
    await vite.close()
  }
})
