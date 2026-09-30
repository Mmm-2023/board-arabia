import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, type FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { priorNotes } from '../src/lib/priorNotes.ts'
import type { HistoryItem } from '../src/lib/dueDiligence.ts'

function row(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'company_label'>): HistoryItem {
  return {
    created_at: '2026-09-20T09:00:00.000Z',
    file_name: 'deck.pdf',
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
    job_id: partial.id,
    ...partial,
  }
}

test('prior notes clean the two example titles and collapse duplicates by job', () => {
  const rows = priorNotes([
    row({
      id: 'a',
      job_id: 'job-1',
      company_label: 'W H O W H A T G O E S W R O N G W H A T I T C O S T S',
      created_at: '2026-09-20T09:00:00.000Z',
    }),
    row({
      id: 'b',
      job_id: 'job-1',
      company_label: 'W H O W H A T G O E S W R O N G W H A T I T C O S T S',
      file_name: 'older.pdf',
      created_at: '2026-09-19T09:00:00.000Z',
    }),
    row({
      id: 'c',
      job_id: 'job-2',
      company_label: 'ÒMade In KSAÓ',
      created_at: '2026-09-17T09:00:00.000Z',
    }),
    row({
      id: 'd',
      job_id: 'job-2',
      company_label: 'ÒMade In KSAÓ',
      created_at: '2026-09-16T09:00:00.000Z',
    }),
  ])
  assert.deepEqual(
    rows.map((item) => item.title),
    ['Who What Goes Wrong What it Costs', 'Made In KSA'],
  )
  assert.deepEqual(
    rows.map((item) => item.id),
    ['a', 'c'],
  )
  assert.equal(rows.some((item) => item.title.includes('Ò') || item.title.includes('Ó')), false)
})

test('prior notes list shows a delete control and the cleaned titles', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/DueDiligencePage.tsx')
    const html = renderToStaticMarkup(
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
            row({ id: 'a', job_id: 'job-1', company_label: 'W H O W H A T G O E S W R O N G W H A T I T C O S T S' }),
            row({ id: 'b', job_id: 'job-1', company_label: 'W H O W H A T G O E S W R O N G W H A T I T C O S T S' }),
            row({ id: 'c', job_id: 'job-2', company_label: 'ÒMade In KSAÓ' }),
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
    assert.match(html, /Who What Goes Wrong What it Costs/)
    assert.match(html, /Made In KSA/)
    assert.equal(html.includes('W H O W H A T'), false)
    assert.equal(html.includes('Ò'), false)
    assert.equal(html.includes('Ó'), false)
    assert.equal((html.match(/>Delete</g) || []).length, 2)
    assert.equal(html.includes('\u2014'), false)
    assert.equal(html.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})
