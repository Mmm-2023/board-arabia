import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { POSTURE_LABEL, POSTURES } from '../supabase/functions/_shared/deck_analysis.ts'
import { passDraftReport } from '../src/lib/dueDiligenceMemoFixture.ts'
import {
  AI_DD_PASS_DISPLAY,
  AI_DD_SCORE_NOTICE,
  memberPostureLabel,
  memberTextStatesScore,
} from '../src/lib/aiDueDiligenceNotice.ts'
import type { HistoryItem } from '../src/lib/dueDiligence.ts'

const root = path.resolve(import.meta.dirname, '..')

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function noticeCount(html: string): number {
  return html.split('data-dd-score-notice').length - 1
}

function filesContaining(dir: string, needle: string): string[] {
  const hits: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      hits.push(...filesContaining(full, needle))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (readFileSync(full, 'utf8').includes(needle)) hits.push(path.relative(root, full))
  }
  return hits
}

function historyRow(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'company_label'>): HistoryItem {
  return {
    created_at: '2026-09-20T09:00:00.000Z',
    file_name: 'deck.pdf',
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
    job_id: partial.id,
    ...partial,
  }
}

test('the score notice has one source and the stored pass value stays pass', () => {
  assert.equal(POSTURES.includes('pass'), true)
  assert.equal(POSTURE_LABEL.pass, 'Pass')
  assert.equal(memberPostureLabel('pass'), AI_DD_PASS_DISPLAY)
  assert.equal(memberPostureLabel('evidence_required'), 'Evidence required')
  assert.equal(memberPostureLabel('discuss_with_milestones'), 'Discuss with milestones')
  assert.equal(memberTextStatesScore('40% publicly consistent'), true)
  assert.equal(memberTextStatesScore('0% publicly consistent'), true)
  assert.equal(memberTextStatesScore('No percentage'), false)
  assert.equal(memberTextStatesScore('Public checks not run'), false)
  assert.deepEqual(filesContaining(path.join(root, 'src'), AI_DD_SCORE_NOTICE), ['src/lib/aiDueDiligenceNotice.ts'])
  const notice = readFileSync(path.join(root, 'src/lib/aiDueDiligenceNotice.ts'), 'utf8')
  const component = readFileSync(path.join(root, 'src/components/ai/AiDueDiligenceScoreNotice.tsx'), 'utf8')
  assert.match(component, /AI_DD_SCORE_NOTICE/)
  assert.equal(notice.includes('\u2014'), false)
  assert.equal(notice.includes('\u2013'), false)
  assert.equal(component.includes('\u2014'), false)
  assert.equal(component.includes('\u2013'), false)
})

test('the notice renders with each score and pass never reaches members', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const reportMod = (await vite.ssrLoadModule('/src/shell/renderDueReport.tsx')) as {
      renderDueReport: (value: ReturnType<typeof passDraftReport>, fileName: string, preparedAt: string) => string
    }
    const scored = passDraftReport()
    assert.equal(scored.analysis?.hero.posture, 'pass')
    assert.equal(scored.analysis?.hero.overall, 4)
    const analysisHtml = reportMod.renderDueReport(scored, 'example-seed.pdf', '2026-09-29T09:00:00.000Z')
    const analysisText = visibleText(analysisHtml)
    const overallAt = analysisHtml.indexOf('data-dd-overall="4"')
    assert.ok(overallAt >= 0)
    const overallBlock = analysisHtml.slice(overallAt, overallAt + 1200)
    assert.ok(overallBlock.includes(AI_DD_SCORE_NOTICE))
    assert.ok(overallBlock.includes('>4<'))
    assert.ok(analysisText.includes(AI_DD_PASS_DISPLAY))
    assert.equal(/\bpass\b/i.test(analysisText), false)
    assert.ok(analysisHtml.includes('data-dd-posture="pass"'))
    assert.equal(noticeCount(analysisHtml), 10)
    const story = analysisHtml.slice(
      analysisHtml.indexOf('data-dd-score="story_clarity"'),
      analysisHtml.indexOf('data-dd-score="story_clarity"') + 900,
    )
    assert.ok(story.includes('4 of 5'))
    assert.ok(story.includes(AI_DD_SCORE_NOTICE))

    const claimsHtml = reportMod.renderDueReport({ ...scored, analysis: null }, 'example-seed.pdf', '2026-09-29T09:00:00.000Z')
    const claimsText = visibleText(claimsHtml)
    assert.equal(claimsHtml.includes('data-dd-view="claims"'), true)
    assert.equal(/\bpass\b/i.test(claimsText), false)
    assert.ok(claimsText.includes('%'))
    assert.ok(claimsHtml.includes(AI_DD_SCORE_NOTICE))
    const percentAt = claimsHtml.indexOf('dd-summary-value')
    assert.ok(percentAt >= 0)
    assert.ok(claimsHtml.slice(percentAt, percentAt + 700).includes(AI_DD_SCORE_NOTICE))

    const view = await vite.ssrLoadModule('/src/pages/dashboard/DueDiligencePage.tsx')
    const listHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.DueDiligenceDeskView, {
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
            historyRow({ id: 'scored', company_label: 'Example Freight', publicly_consistent_pct: 40 }),
            historyRow({
              id: 'empty',
              company_label: 'Example Carrier',
              publicly_consistent_pct: null,
              not_publicly_verifiable_pct: null,
            }),
            historyRow({
              id: 'skipped',
              company_label: 'Example Lane',
              publicly_consistent_pct: 0,
              not_publicly_verifiable_pct: 100,
              sources: [],
            }),
          ],
          onCompanyUrl: () => {},
          onFile: () => {},
          onSubmit: (event: FormEvent) => event.preventDefault(),
          onRetry: () => {},
          onReload: () => {},
        }),
      ),
    )
    const scoredRow = listHtml.slice(listHtml.indexOf('Example Freight'), listHtml.indexOf('Example Carrier'))
    const emptyRow = listHtml.slice(listHtml.indexOf('Example Carrier'), listHtml.indexOf('Example Lane'))
    const skippedRow = listHtml.slice(listHtml.indexOf('Example Lane'))
    assert.ok(scoredRow.includes('40% publicly consistent'))
    assert.ok(scoredRow.includes(AI_DD_SCORE_NOTICE))
    assert.equal(emptyRow.includes(AI_DD_SCORE_NOTICE), false)
    assert.ok(emptyRow.includes('No percentage'))
    assert.equal(skippedRow.includes(AI_DD_SCORE_NOTICE), false)
    assert.ok(skippedRow.includes('Public checks not run'))
    assert.equal(/\bpass\b/i.test(visibleText(listHtml)), false)
    assert.equal(listHtml.includes('\u2014'), false)
    assert.equal(listHtml.includes('\u2013'), false)
    assert.equal(analysisHtml.includes('\u2014'), false)
    assert.equal(analysisHtml.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})
