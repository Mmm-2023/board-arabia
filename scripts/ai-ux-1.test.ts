import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, type FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { clampReportTitle, REPORT_TITLE_MAX } from '../src/lib/recentReports.ts'
import { DD_COPY } from '../src/lib/dueDiligenceCopy.ts'
import type { HistoryItem } from '../src/lib/dueDiligence.ts'
import { passDraftReport } from '../src/lib/dueDiligenceMemoFixture.ts'

function row(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'company_label'>): HistoryItem {
  return {
    created_at: '2026-10-20T09:00:00.000Z',
    file_name: 'example.pdf',
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
    job_id: partial.id,
    ...partial,
  }
}

test('report titles clamp on a word and leave short example titles whole', () => {
  assert.equal(clampReportTitle('Example Cold Chain'), 'Example Cold Chain')
  assert.equal(clampReportTitle('Made In KSA Gateway to Centralized Economy'), 'Made In KSA Gateway to Centralized Economy')
  assert.equal(clampReportTitle('Harborline Robotics'), 'Harborline Robotics')
  const long = 'Example Corridor Holding Company of the Gulf Regional Pilot Programme for Temperature Controlled Freight'
  const clamped = clampReportTitle(long)
  assert.ok(clamped.endsWith('...'))
  assert.ok(clamped.length <= REPORT_TITLE_MAX)
  assert.equal(clamped.includes('\u2014'), false)
  assert.equal(clamped.includes('\u2013'), false)
  assert.equal(long.startsWith(clamped.slice(0, -3).trimEnd()), true)
  const token = 'A'.repeat(120)
  assert.equal(clampReportTitle(token).length, REPORT_TITLE_MAX)
})

test('the desk leads with one start action, an empty reason, and honest states', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/DueDiligencePage.tsx')
    const desk = (phase: string, loadState: string, reports: HistoryItem[]) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(view.DueDiligenceDeskView, {
            phase,
            loadState,
            fileName: '',
            companyUrl: '',
            busy: false,
            activeJob: false,
            progress: 0,
            progressLabel: '',
            actionError: '',
            reports,
            onCompanyUrl: () => {},
            onFile: () => {},
            onSubmit: (event: FormEvent) => event.preventDefault(),
            onRetry: () => {},
            onReload: () => {},
            onDelete: () => {},
          }),
        ),
      )

    const empty = desk('idle-empty', 'ready', [])
    assert.match(empty, /AI Due Diligence/)
    assert.ok(empty.indexOf('>AI Due Diligence<') < empty.indexOf(DD_COPY.startReview))
    assert.match(empty, new RegExp(DD_COPY.emptyHistory.replace(/[.]/g, '\\.')))
    assert.match(empty, /data-dd-empty/)
    assert.equal(empty.includes('<details open'), false)
    assert.match(empty, /dd-file-input/)

    const listed = desk('idle', 'ready', [
      row({
        id: 'long',
        company_label:
          'Example Corridor Holding Company of the Gulf Regional Pilot Programme for Temperature Controlled Freight',
      }),
      row({ id: 'short', company_label: 'Example Cold Chain' }),
    ])
    assert.match(listed, /line-clamp-2/)
    assert.match(listed, /Example Cold Chain/)
    assert.match(listed, /Example Corridor Holding Company/)
    assert.match(listed, /\.\.\./)
    assert.equal(listed.includes(DD_COPY.emptyHistory), false)
    assert.match(listed, /rounded-xl/)

    const loading = desk('loading', 'loading', [])
    assert.equal((loading.match(/aria-busy="true"/g) || []).length, 1)
    assert.match(loading, /data-dd-skeleton="desk"/)
    assert.match(loading, /h-11/)
    assert.match(loading, /h-20/)

    const error = desk('load-error', 'error', [])
    assert.match(error, /role="alert"/)
    assert.match(error, new RegExp(DD_COPY.loadError))
    assert.match(error, />Retry</)
    assert.equal(error.includes('Showing last update'), false)
    assert.equal(error.includes('\u2014'), false)
    assert.equal(error.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

test('a clear report keeps the notice once and paints looks clear as the positive tag', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const reportMod = (await vite.ssrLoadModule('/src/shell/renderDueReport.tsx')) as {
      renderDueReport: (value: ReturnType<typeof passDraftReport>, fileName: string, preparedAt: string) => string
    }
    const html = reportMod.renderDueReport(passDraftReport(), 'example-co.pdf', '2026-09-29T09:00:00.000Z')
    const postureAt = html.indexOf('data-dd-posture="pass"')
    assert.ok(postureAt > 0)
    const posture = html.slice(Math.max(0, postureAt - 120), postureAt + 220)
    assert.match(posture, /dd-pill-consistent/)
    assert.equal(posture.includes('dd-pill-conflict'), false)
    assert.match(posture, /looks clear/)
    assert.equal((html.match(/data-dd-report-notice/g) || []).length, 1)
    assert.equal((html.match(/Questions for management/g) || []).length, 0)
  } finally {
    await vite.close()
  }
})
