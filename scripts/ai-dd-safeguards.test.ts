import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { POSTURE_LABEL, POSTURES } from '../supabase/functions/_shared/deck_analysis.ts'
import { partialDraftReport, passDraftReport } from '../src/lib/dueDiligenceMemoFixture.ts'
import {
  AI_DD_PASS_DISPLAY,
  AI_DD_SCORE_NOTICE,
  AI_DD_SCORE_TAG,
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

function attrCount(html: string, name: string): number {
  return html.split(name).length - 1
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

test('the score notice and tag have one source and the stored pass value stays pass', () => {
  assert.equal(POSTURES.includes('pass'), true)
  assert.equal(POSTURE_LABEL.pass, 'Pass')
  assert.equal(memberPostureLabel('pass'), AI_DD_PASS_DISPLAY)
  assert.equal(memberPostureLabel('evidence_required'), 'Evidence required')
  assert.equal(memberPostureLabel('discuss_with_milestones'), 'Discuss with milestones')
  assert.equal(memberTextStatesScore('40% publicly consistent'), true)
  assert.equal(memberTextStatesScore('0% publicly consistent'), true)
  assert.equal(memberTextStatesScore('No percentage'), false)
  assert.equal(memberTextStatesScore('Public checks not run'), false)
  assert.equal(AI_DD_SCORE_NOTICE.includes('not due diligence'), true)
  assert.equal(AI_DD_SCORE_TAG.includes('not an endorsement'), true)
  assert.deepEqual(filesContaining(path.join(root, 'src'), AI_DD_SCORE_NOTICE), ['src/lib/aiDueDiligenceNotice.ts'])
  assert.deepEqual(filesContaining(path.join(root, 'src'), AI_DD_SCORE_TAG), ['src/lib/aiDueDiligenceNotice.ts'])
  const notice = readFileSync(path.join(root, 'src/lib/aiDueDiligenceNotice.ts'), 'utf8')
  const component = readFileSync(path.join(root, 'src/components/ai/AiDueDiligenceScoreNotice.tsx'), 'utf8')
  assert.match(component, /AI_DD_SCORE_NOTICE/)
  assert.match(component, /AI_DD_SCORE_TAG/)
  assert.match(component, /data-dd-report-notice/)
  assert.match(component, /data-dd-score-tag/)
  assert.equal(notice.includes('\u2014'), false)
  assert.equal(notice.includes('\u2013'), false)
  assert.equal(component.includes('\u2014'), false)
  assert.equal(component.includes('\u2013'), false)
})

test('a clear result shows the full notice once, a tag beside each score, and looks clear', async () => {
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
    assert.equal(attrCount(analysisHtml, 'data-dd-report-notice'), 1)
    assert.ok(analysisHtml.indexOf('data-dd-report-notice') < overallAt)
    const overallBlock = analysisHtml.slice(overallAt, overallAt + 1600)
    assert.equal(overallBlock.includes(AI_DD_SCORE_NOTICE), false)
    assert.ok(overallBlock.includes(AI_DD_SCORE_TAG))
    assert.ok(overallBlock.includes('>4<'))
    assert.ok(overallBlock.includes(AI_DD_PASS_DISPLAY))
    assert.ok(analysisText.includes(AI_DD_SCORE_NOTICE))
    assert.ok(analysisText.includes('not due diligence'))
    assert.ok(analysisText.includes('not an endorsement'))
    assert.ok(analysisText.includes(AI_DD_PASS_DISPLAY))
    assert.equal(/\bpass\b/i.test(analysisText), false)
    assert.ok(analysisHtml.includes('data-dd-posture="pass"'))
    assert.equal(attrCount(analysisHtml, 'data-dd-score-tag'), 10)
    const storyAt = analysisHtml.indexOf('data-dd-score="story_clarity"')
    const story = analysisHtml.slice(storyAt, storyAt + 1200)
    assert.ok(story.includes('4 of 5'))
    assert.ok(story.includes(AI_DD_SCORE_TAG))
    assert.equal(story.includes(AI_DD_SCORE_NOTICE), false)

    const partialHtml = reportMod.renderDueReport(partialDraftReport(), 'example-seed.pdf', '2026-09-29T09:00:00.000Z')
    const tractionAt = partialHtml.indexOf('data-dd-score="traction_evidence"')
    const nextScore = partialHtml.indexOf('data-dd-score=', tractionAt + 'data-dd-score='.length)
    const traction = partialHtml.slice(tractionAt, nextScore > tractionAt ? nextScore : tractionAt + 900)
    assert.ok(traction.includes('>Missing<'))
    assert.equal(traction.includes('data-dd-score-tag'), false)
    assert.equal(attrCount(partialHtml, 'data-dd-report-notice'), 1)

    const claimsHtml = reportMod.renderDueReport({ ...scored, analysis: null }, 'example-seed.pdf', '2026-09-29T09:00:00.000Z')
    const claimsText = visibleText(claimsHtml)
    assert.equal(claimsHtml.includes('data-dd-view="claims"'), true)
    assert.equal(/\bpass\b/i.test(claimsText), false)
    assert.ok(claimsText.includes('%'))
    assert.equal(attrCount(claimsHtml, 'data-dd-report-notice'), 1)
    assert.ok(claimsText.includes('not due diligence'))
    assert.ok(claimsText.includes('not an endorsement'))
    const percentAt = claimsHtml.indexOf('dd-summary-value')
    assert.ok(percentAt >= 0)
    assert.ok(claimsHtml.indexOf('data-dd-report-notice') < percentAt)
    const percentBlock = claimsHtml.slice(percentAt, percentAt + 700)
    assert.ok(percentBlock.includes(AI_DD_SCORE_TAG))
    assert.equal(percentBlock.includes(AI_DD_SCORE_NOTICE), false)

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
    assert.ok(scoredRow.includes(AI_DD_SCORE_TAG))
    assert.equal(scoredRow.includes(AI_DD_SCORE_NOTICE), false)
    assert.equal(emptyRow.includes(AI_DD_SCORE_TAG), false)
    assert.equal(emptyRow.includes(AI_DD_SCORE_NOTICE), false)
    assert.ok(emptyRow.includes('No percentage'))
    assert.equal(skippedRow.includes(AI_DD_SCORE_TAG), false)
    assert.equal(skippedRow.includes(AI_DD_SCORE_NOTICE), false)
    assert.ok(skippedRow.includes('Public checks not run'))
    assert.equal(/\bpass\b/i.test(visibleText(listHtml)), false)
    assert.equal(listHtml.includes('\u2014'), false)
    assert.equal(listHtml.includes('\u2013'), false)
    assert.equal(analysisHtml.includes('\u2014'), false)
    assert.equal(analysisHtml.includes('\u2013'), false)

    const account = await vite.ssrLoadModule('/src/pages/dashboard/account/views.tsx')
    const accountHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(account.AccountAi)),
    )
    assert.equal(attrCount(accountHtml, 'data-dd-report-notice'), 1)
    assert.equal(attrCount(accountHtml, 'data-dd-score-tag'), 10)
    assert.ok(visibleText(accountHtml).includes('not due diligence'))
    assert.ok(visibleText(accountHtml).includes('not an endorsement'))
    assert.equal(visibleText(accountHtml).includes(AI_DD_PASS_DISPLAY), false)
  } finally {
    await vite.close()
  }
})
