import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { resolveRedirect } from '../src/shell/redirects.ts'
import {
  acceptBriefItems,
  briefRunsOn,
  briefSystemPrompt,
  briefUserPrompt,
  canReplaceBriefDay,
  handleDailyMarketBrief,
  HEADLINE_MAX,
  hitsFromOutletBody,
  MARKET_BRIEF_DAILY_HEADER,
  marketBriefDayDue,
  outletSearchRequest,
  runDailyMarketBrief,
  SUMMARY_MAX,
  type BriefHit,
} from '../supabase/functions/_shared/daily_market_brief.ts'
import { STARTER_OUTLETS, outletForUrl, type OutletRule } from '../supabase/functions/_shared/outlet_allowlist.ts'
import { appShells } from './shell-manifest.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const outlets: OutletRule[] = STARTER_OUTLETS.map((outlet) => ({ ...outlet }))

function at(url: string) {
  return outletForUrl(url, outlets)?.domain ?? null
}

test('outletForUrl accepts the approved hosts and path prefixes', () => {
  assert.equal(at('https://spa.gov.sa/w/story'), 'spa.gov.sa')
  assert.equal(at('https://www.spa.gov.sa/w/story'), 'spa.gov.sa')
  assert.equal(at('https://spa.gov.sa./w/story'), 'spa.gov.sa')
  assert.equal(at('https://news.arabnews.com/node/1'), 'arabnews.com')
  assert.equal(at('https://argaam.com/en/article'), 'argaam.com')
  assert.equal(at('https://argaam.com/en'), 'argaam.com')
  assert.equal(at('https://www.asharqbusiness.com/en/x'), 'asharqbusiness.com')
  assert.equal(at('https://arabnews.com:443/story'), 'arabnews.com')
})

test('outletForUrl rejects lookalikes, tricks, prefixes, and disabled outlets', () => {
  const rejected = [
    'https://spa.gov.sa.example.com/story',
    'https://fakespa.gov.sa/story',
    'https://spa-gov.sa/story',
    'https://arabnews.com.evil.example/story',
    'https://arabnews.co/story',
    'https://zawya.com.example.net/story',
    'https://meed.com@evil.example/story',
    'https://user:pass@meed.com/story',
    'http://arabnews.com/story',
    'https://arabnews.com:8443/story',
    'https://203.0.113.10/story',
    'https://[2001:db8::1]/story',
    'https://xn--sp-8qa.gov.sa/story',
    'https://argaam.com/ar/x',
    'https://argaam.com/english',
    'https://asharqbusiness.com/x',
    'https://asharqbusiness.com/en-extra',
    'notaurl',
    'https://example.com/story',
  ]
  for (const url of rejected) assert.equal(outletForUrl(url, outlets), null, url)
  const disabled = outlets.map((outlet) =>
    outlet.domain === 'spa.gov.sa' ? { ...outlet, enabled: false } : outlet,
  )
  assert.equal(outletForUrl('https://www.spa.gov.sa/w/story', disabled), null)
  assert.equal(outletForUrl('https://www.spa.gov.sa/w/story', [{ ...outlets[0], enabled: false }]), null)
})

test('a missing search key returns not_configured and makes zero network calls', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('network')
  }) as typeof fetch
  try {
    const result = await runDailyMarketBrief({
      now: new Date('2026-10-13T12:00:00.000Z'),
      searchKey: '   ',
      dryRun: false,
      loadOutlets: async () => {
        calls += 1
        return outlets
      },
      writeDay: async () => {
        calls += 1
        return true
      },
      purgeBefore: async () => {
        calls += 1
        return true
      },
      complete: async () => {
        calls += 1
        return { text: '{}', modelId: 'unit-model-id', skipReason: null }
      },
    })
    assert.equal(result.status, 'not_configured')
    assert.equal(result.http, 200)
    assert.equal(result.wrote, false)
    assert.equal(result.modelId, null)
    assert.equal(calls, 0)
    const response = await handleDailyMarketBrief(
      new Request('https://example.com/market-brief-daily?dry_run=1', {
        method: 'POST',
        headers: { [MARKET_BRIEF_DAILY_HEADER]: 'unit-secret' },
      }),
      {
        secret: 'unit-secret',
        searchKey: '',
        now: () => new Date('2026-10-13T12:00:00.000Z'),
        loadOutlets: async () => {
          calls += 1
          return outlets
        },
        writeDay: async () => {
          calls += 1
          return true
        },
        complete: async () => {
          calls += 1
          return { text: '{}', modelId: 'unit-model-id', skipReason: null }
        },
      },
    )
    assert.equal(response.status, 200)
    const body = (await response.json()) as { status: string; item_count: number }
    assert.equal(body.status, 'not_configured')
    assert.equal(body.item_count, 0)
    assert.equal(JSON.stringify(body).includes('unit-model-id'), false)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = original
  }
})

test('the handler rejects other methods and a bad secret without calling fetch', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('network')
  }) as typeof fetch
  try {
    const get = await handleDailyMarketBrief(new Request('https://example.com/market-brief-daily'), {
      secret: 'unit-secret',
      searchKey: 'present',
      now: () => new Date(),
      loadOutlets: async () => outlets,
    })
    assert.equal(get.status, 405)
    const denied = await handleDailyMarketBrief(
      new Request('https://example.com/market-brief-daily', {
        method: 'POST',
        headers: { [MARKET_BRIEF_DAILY_HEADER]: 'wrong' },
      }),
      {
        secret: 'unit-secret',
        searchKey: 'present',
        now: () => new Date(),
        loadOutlets: async () => {
          calls += 1
          return outlets
        },
      },
    )
    assert.equal(denied.status, 401)
    const unset = await handleDailyMarketBrief(
      new Request('https://example.com/market-brief-daily', {
        method: 'POST',
        headers: { [MARKET_BRIEF_DAILY_HEADER]: 'unit-secret' },
      }),
      {
        secret: '',
        searchKey: 'present',
        now: () => new Date(),
        loadOutlets: async () => outlets,
      },
    )
    assert.equal(unset.status, 401)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = original
  }
})

test('search stays on the outlet site and drops dates outside 48 hours', () => {
  const now = new Date('2026-10-13T12:00:00.000Z')
  const request = outletSearchRequest('spa.gov.sa', now)
  assert.equal(request?.query, 'site:spa.gov.sa')
  assert.match(request?.url ?? '', /site%3Aspa\.gov\.sa/)
  assert.equal(outletSearchRequest('https://spa.gov.sa/en', now), null)
  const body = {
    web: {
      results: [
        {
          title: 'Example holding agrees a sample joint venture',
          url: 'https://www.spa.gov.sa/w/example-deal',
          description: 'A sample snippet for the unit test only.',
          page_age: '2026-10-12T08:00:00.000Z',
        },
        {
          title: 'Too old to keep',
          url: 'https://www.spa.gov.sa/w/old',
          description: 'This date is outside the window.',
          page_age: '2026-10-10T08:00:00.000Z',
        },
        {
          title: 'Wrong host',
          url: 'https://example.com/story',
          description: 'This host is not on the allowlist.',
          page_age: '2026-10-13T08:00:00.000Z',
        },
      ],
    },
  }
  const hits = hitsFromOutletBody(body, outlets, now)
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.url, 'https://www.spa.gov.sa/w/example-deal')
  assert.equal(hits[0]?.outlet, 'Saudi Press Agency')
})

test('an AI item with a URL outside the input set is dropped', () => {
  const hits: BriefHit[] = [
    {
      title: 'Example holding agrees a sample joint venture',
      url: 'https://www.spa.gov.sa/w/example-deal',
      snippet: 'A sample snippet for the unit test only.',
      dated: '2026-10-12',
      outlet: 'Saudi Press Agency',
    },
    {
      title: 'Example regulator publishes a sample note',
      url: 'https://cma.org.sa/en/example-rule',
      snippet: 'A second sample snippet for the unit test only.',
      dated: '2026-10-12',
      outlet: 'Capital Market Authority',
    },
  ]
  const raw = JSON.stringify({
    items: [
      {
        group: 'deals',
        headline: 'Example holding plans a sample joint venture',
        summary: 'Example holding agrees a sample joint venture.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'regulation',
        headline: 'Example regulator publishes a sample note',
        summary: 'This headline copies the source and must drop.',
        url: 'https://cma.org.sa/en/example-rule',
      },
      {
        group: 'deals',
        headline: 'Invented source',
        summary: 'This source was not in the input set.',
        url: 'https://example.com/invented',
      },
      {
        group: 'regulation',
        headline: 'A headline with a dash',
        summary: 'A summary that uses an em dash here \u2014 and must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'leadership',
        headline: 'Arabic headline',
        summary: `Arabic mark ${String.fromCharCode(0x0645)} must drop.`,
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        headline: 'Named model',
        summary: 'This summary names openai and must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        summary: 'Missing headline must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        headline: 'H'.repeat(HEADLINE_MAX + 1),
        summary: 'Headline over the cap must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        headline: 'Summary over the cap',
        summary: 'S'.repeat(SUMMARY_MAX + 1),
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
    ],
  })
  const kept = acceptBriefItems(raw, hits, outlets)
  assert.equal(kept.length, 1)
  assert.equal(kept[0]?.url, 'https://www.spa.gov.sa/w/example-deal')
  assert.equal(kept[0]?.headline, 'Example holding plans a sample joint venture')
  assert.equal(kept[0]?.outlet, 'Saudi Press Agency')
  assert.equal(kept[0]?.summary.includes('\u2014'), false)
  const prompt = briefUserPrompt(hits)
  assert.match(prompt, /https:\/\/www\.spa\.gov\.sa\/w\/example-deal/)
  assert.equal(prompt.includes('@'), false)
  const system = briefSystemPrompt()
  assert.equal(system.includes('\u2014'), false)
  assert.match(system, /90 characters/)
  assert.match(system, /300 characters/)
  assert.equal(system.includes('400'), false)
})

test('dry run searches enabled outlets only and does not write', async () => {
  const calls: string[] = []
  const now = new Date('2026-10-13T12:00:00.000Z')
  const result = await runDailyMarketBrief({
    now,
    searchKey: 'unit-search-key',
    dryRun: true,
    loadOutlets: async () => [
      { name: 'Saudi Press Agency', domain: 'spa.gov.sa', pathPrefix: null, enabled: true },
      { name: 'Paused', domain: 'example.com', pathPrefix: null, enabled: false },
    ],
    fetchImpl: async (input) => {
      calls.push(String(input))
      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Example holding agrees a sample joint venture',
                url: 'https://www.spa.gov.sa/w/example-deal',
                description: 'A sample snippet for the unit test only.',
                page_age: '2026-10-13T09:00:00.000Z',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    },
    complete: async () => ({
      text: JSON.stringify({
        items: [
          {
            group: 'deals',
            headline: 'Example holding plans a sample joint venture',
            summary: 'Example holding agrees a sample joint venture.',
            url: 'https://www.spa.gov.sa/w/example-deal',
          },
        ],
      }),
      modelId: 'unit-model-id',
      skipReason: null,
    }),
    writeDay: async () => {
      calls.push('write')
      return true
    },
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0] ?? '', /site%3Aspa\.gov\.sa/)
  assert.equal(result.status, 'ok')
  assert.equal(result.wrote, false)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.headline, 'Example holding plans a sample joint venture')
  assert.equal(result.modelId, 'unit-model-id')
})

test('Friday and Saturday in Riyadh skip before any network call', async () => {
  assert.equal(briefRunsOn(new Date('2026-10-16T02:00:00.000Z')), false)
  assert.equal(briefRunsOn(new Date('2026-10-17T02:00:00.000Z')), false)
  assert.equal(briefRunsOn(new Date('2026-10-18T02:00:00.000Z')), true)
  assert.equal(canReplaceBriefDay(null), true)
  assert.equal(canReplaceBriefDay('draft'), true)
  assert.equal(canReplaceBriefDay('approved'), false)
  assert.equal(canReplaceBriefDay('published'), false)
  let calls = 0
  const result = await runDailyMarketBrief({
    now: new Date('2026-10-16T02:00:00.000Z'),
    searchKey: 'unit-search-key',
    dryRun: false,
    loadOutlets: async () => {
      calls += 1
      return outlets
    },
    writeDay: async () => {
      calls += 1
      return true
    },
    complete: async () => {
      calls += 1
      return { text: '{}', modelId: 'unit-model-id', skipReason: null }
    },
  })
  assert.equal(result.status, 'skipped')
  assert.equal(result.wrote, false)
  assert.equal(calls, 0)
})

test('member presentation stays empty unless the brief is ok and public', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = (await vite.ssrLoadModule('/src/lib/dailyMarketBrief.ts')) as {
      presentMemberBrief: (data: unknown) => { items: unknown[] } | null
      dailyBriefStatusLine: (input: {
        searchConfigured: boolean | null
        latest: {
          briefDate: string
          status: string
          generatedAt: string
          itemCount: number
          items: unknown[]
        } | null
      }) => string
      DAILY_BRIEF_NOT_CONFIGURED: string
    }
    assert.equal(mod.presentMemberBrief(null), null)
    assert.equal(mod.presentMemberBrief({ brief_date: '2026-10-12', items: [] }), null)
    const brief = mod.presentMemberBrief({
      brief_date: '2026-10-12',
      generated_at: '2026-10-12T09:00:00.000Z',
      items: [
        {
          group: 'deals',
          headline: 'Example holding plans a sample joint venture',
          summary: 'Example holding agrees a sample joint venture.',
          outlet: 'Saudi Press Agency',
          url: 'https://www.spa.gov.sa/w/example-deal',
          dated: '2026-10-12',
        },
        {
          group: 'deals',
          headline: 'Dropped because the link is not https',
          summary: 'Dropped because the link is not https.',
          outlet: 'Saudi Press Agency',
          url: 'http://spa.gov.sa/w/example',
          dated: '2026-10-12',
        },
      ],
    })
    assert.equal(brief?.items.length, 1)
    assert.equal(mod.dailyBriefStatusLine({ searchConfigured: false, latest: null }), mod.DAILY_BRIEF_NOT_CONFIGURED)
    assert.match(
      mod.dailyBriefStatusLine({
        searchConfigured: true,
        latest: {
          briefDate: '2026-10-12',
          status: 'ok',
          generatedAt: '2026-10-12T09:00:00.000Z',
          itemCount: 1,
          items: brief?.items ?? [],
        },
      }),
      /Last run/,
    )
  } finally {
    await vite.close()
  }
})

test('the member route is its own page and the card links to it', async () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="market-brief" element=\{<DailyMarketBriefPage/)
  assert.equal(app.includes('path="ai/market-brief"'), false)
  const dashboard = app.slice(app.indexOf('path="/dashboard"'))
  const briefAt = dashboard.indexOf('path="market-brief"')
  const slugAt = dashboard.indexOf('path=":toolSlug"')
  const catchAll = dashboard.lastIndexOf('path="*" element={<RedirectKeep')
  assert.ok(briefAt > slugAt && catchAll > briefAt)
  assert.equal(resolveRedirect('/dashboard/market-brief'), null)
  assert.equal(appShells().some((item) => item.path === '/dashboard/market-brief'), true)
  const brief = {
    briefDate: '2026-10-12',
    generatedAt: '2026-10-12T04:00:00.000Z',
    items: [
      {
        group: 'deals' as const,
        headline: 'Example holding plans a sample joint venture',
        summary: 'Example holding agrees a sample joint venture.',
        outlet: 'Saudi Press Agency',
        url: 'https://www.spa.gov.sa/w/example-deal',
        dated: '2026-10-12',
      },
    ],
  }
  const sameDay = new Date('2026-10-12T09:00:00.000Z')
  const thursday = new Date('2026-10-15T12:00:00.000Z')
  const friday = new Date('2026-10-16T12:00:00.000Z')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const copy = (await vite.ssrLoadModule('/src/lib/dailyMarketBrief.ts')) as {
      DAILY_BRIEF_AI_LABEL: string
      DAILY_BRIEF_EMPTY: string
      DAILY_BRIEF_FOOTER: string
      DAILY_BRIEF_NOT_CONFIGURED: string
      DAILY_BRIEF_PATH: string
    }
    const cardMod = (await vite.ssrLoadModule('/src/pages/dashboard/DailyMarketBriefCard.tsx')) as {
      DailyMarketBriefCard: (props: { brief: typeof brief }) => unknown
    }
    const pageMod = (await vite.ssrLoadModule('/src/pages/dashboard/DailyMarketBriefPage.tsx')) as {
      DailyMarketBriefView: (props: { brief: typeof brief | null }) => unknown
    }
    const card = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(cardMod.DailyMarketBriefCard, { brief, now: sameDay })),
    )
    assert.match(card, new RegExp(`href="${copy.DAILY_BRIEF_PATH}"`))
    assert.match(card, /AI summary/)
    assert.match(card, /Example holding plans a sample joint venture/)
    assert.match(card, /Open the brief/)
    assert.equal(card.includes('target="_blank"'), false)
    const page = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(pageMod.DailyMarketBriefView, { brief, now: sameDay })),
    )
    assert.match(page, /Example holding agrees a sample joint venture\./)
    assert.match(page, /Read at Saudi Press Agency/)
    assert.match(page, /rel="noopener noreferrer"/)
    assert.match(page, /target="_blank"/)
    assert.match(page, new RegExp(copy.DAILY_BRIEF_FOOTER.replace(/[.]/g, '\\.')))
    assert.match(page, new RegExp(copy.DAILY_BRIEF_AI_LABEL))
    assert.match(page, /Updated 07:00 Riyadh time/)
    const empty = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(pageMod.DailyMarketBriefView, { brief: null, now: thursday })),
    )
    assert.match(empty, new RegExp(copy.DAILY_BRIEF_EMPTY.replaceAll("'", '&#x27;')))
    const weekend = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(pageMod.DailyMarketBriefView, { brief: null, now: friday })),
    )
    assert.match(weekend, /No brief on Fridays and Saturdays/)
    const error = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(pageMod.DailyMarketBriefView, { brief: null, phase: 'error', onRetry: () => undefined }),
      ),
    )
    assert.match(error, /We could not load the brief/)
    assert.match(error, /Try again/)
    assert.equal(empty.includes(copy.DAILY_BRIEF_NOT_CONFIGURED), false)
    assert.equal(empty.includes('Retry'), false)
    assert.equal(empty.includes('\u2014'), false)
    assert.equal(page.includes('\u2014'), false)
  } finally {
    await vite.close()
  }
})

test('migration seeds 11 outlets, keeps both switches off, and limits writes to aal2 staff', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  const migration = '20261215120000_daily_market_brief.sql'
  assert.ok(names.includes(migration))
  assert.ok(names.indexOf(migration) > names.indexOf('20261214120000_digest_review_tiers.sql'))
  const sql = read(`supabase/migrations/${migration}`)
  assert.match(sql, /enabled boolean not null default false/)
  assert.match(sql, /members_visible boolean not null default false/)
  assert.match(sql, /values \(1, false, false\)/)
  for (const outlet of STARTER_OUTLETS) {
    assert.match(sql, new RegExp(outlet.name.replace(/[()]/g, '\\$&')))
    assert.match(sql, new RegExp(outlet.domain.replace(/\./g, '\\.')))
  }
  assert.equal(sql.split('force row level security').length - 1, 3)
  assert.equal((sql.match(/security definer/g) ?? []).length, 5)
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 5)
  const member = sql.slice(sql.indexOf('function public.market_brief_for_member'), sql.indexOf('function public.market_brief_admin_state'))
  assert.match(member, /coalesce\(v_on, false\) is not true or coalesce\(v_visible, false\) is not true/)
  assert.match(member, /return 'null'::jsonb/)
  assert.equal(member.includes('model_id'), false)
  for (const name of [
    'market_brief_admin_state',
    'market_brief_save_settings',
    'market_brief_save_outlet',
    'market_brief_reorder_outlets',
  ]) {
    const start = sql.indexOf(`function public.${name}`)
    const next = sql.indexOf('create or replace function', start + 10)
    const body = sql.slice(start, next === -1 ? sql.length : next)
    assert.match(body, /private\.is_staff\(\)/, name)
    assert.equal(body.includes('model_id'), false, name)
  }
  assert.equal(sql.includes('cron'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
})

test('the daily function is deploy only and does not touch the other market brief or intro planner', () => {
  const index = read('supabase/functions/market-brief-daily/index.ts')
  const config = read('supabase/config.toml')
  assert.match(config, /\[functions\.market-brief-daily\]\s+verify_jwt = false/)
  assert.match(config, /Do not set the secret and do not invoke from this change/)
  assert.match(config, /daily-brief\.yml stays skipped until vars\.DAILY_BRIEF_ENABLED is true/)
  assert.equal(existsSync(path.join(root, '.github/workflows/market-brief-daily.yml')), false)
  assert.equal(existsSync(path.join(root, '.github/workflows/daily-brief.yml')), true)
  assert.equal(index.includes('suggest_intros'), false)
  assert.equal(index.includes('tools/market_brief'), false)
  assert.match(index, /MARKET_BRIEF_SEARCH_SECRET/)
  assert.match(read('supabase/functions/_shared/daily_market_brief.ts'), /BA_DD_SEARCH_API_KEY/)
  assert.equal(index.includes('cron'), false)
  const runner = read('supabase/functions/_shared/daily_market_brief.ts')
  const fn = runner.slice(runner.indexOf('export async function runDailyMarketBrief'))
  assert.ok(fn.indexOf('if (!input.searchKey.trim())') < fn.indexOf('input.loadOutlets'))
  assert.equal(read('supabase/functions/ai-tool-job/tools/market_brief.ts').includes('daily_market_brief'), false)
  assert.equal(read('supabase/functions/_shared/suggest_intros.ts').includes('market_brief'), false)
  assert.equal(marketBriefDayDue('2026-07-14', new Date('2026-10-13T00:00:00.000Z')), true)
  assert.equal(marketBriefDayDue('2026-07-15', new Date('2026-10-13T00:00:00.000Z')), false)
  assert.match(index, /canReplaceBriefDay/)
  const workflow = read('.github/workflows/daily-brief.yml')
  assert.match(workflow, /cron: '0 2 \* \* 0,1,2,3,4'/)
  assert.match(workflow, /vars\.DAILY_BRIEF_ENABLED == 'true'/)
  const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((match) => match[1])
  assert.deepEqual(secretNames, ['MARKET_BRIEF_DAILY_SECRET', 'SUPABASE_URL'])
  assert.equal(workflow.includes('vars.DAILY_BRIEF_ENABLED == \'true\'') && workflow.includes('secrets.DAILY_BRIEF'), false)
  const withoutRefs = workflow
    .replace(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/g, '')
    .replace(/\$\{\{\s*vars\.DAILY_BRIEF_ENABLED == 'true'\s*\}\}/g, '')
  assert.equal(withoutRefs.includes('secrets.'), false)
  assert.equal(/https?:\/\/\S+/i.test(withoutRefs), false)
  assert.equal(/supabase\.co/i.test(workflow), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(workflow), false)
  assert.equal(/retention-sweep|email-send|suggest-intros/i.test(workflow), false)
  assert.equal(workflow.includes('\u2014'), false)
  assert.match(workflow, /does not publish and it does not send mail/)
})

test('publish migration is the newest slot and members see published rows only', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  const migration = '20270112120000_daily_brief_publish.sql'
  assert.equal(names.at(-1), migration)
  assert.ok(names.indexOf(migration) > names.indexOf('20270111120000_application_withdrawn_closed_retention.sql'))
  const sql = read(`supabase/migrations/${migration}`)
  assert.match(sql, /publish_status text not null default 'draft'/)
  assert.match(sql, /publish_status in \('draft', 'approved', 'published'\)/)
  assert.match(sql, /d\.publish_status = 'published'/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /set search_path = ''/)
  assert.equal(sql.includes('model_id,'), false)
  assert.equal(/to anon/i.test(sql), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/retention-sweep|email-send/i.test(sql), false)
  assert.match(sql, /char_length\(v_headline\) > 90/)
  assert.match(sql, /char_length\(v_summary\) > 300/)
  const member = sql.slice(sql.indexOf('function public.market_brief_for_member'), sql.indexOf('function public.market_brief_admin_state'))
  assert.equal(member.includes('model_id'), false)
  for (const name of ['market_brief_admin_state', 'market_brief_set_publish']) {
    const start = sql.indexOf(`function public.${name}`)
    assert.ok(start > 0, name)
    const body = sql.slice(start, start + 1800)
    assert.match(body, /private\.is_staff\(\)/, name)
  }
})

test('client copy names no model provider and has no em dash', () => {
  const files = [
    'src/lib/dailyMarketBrief.ts',
    'src/pages/dashboard/DailyMarketBriefCard.tsx',
    'src/pages/dashboard/DailyMarketBriefPage.tsx',
    'src/pages/admin/DailyMarketBriefPanel.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/App.tsx',
    'supabase/functions/_shared/outlet_allowlist.ts',
  ]
  const banned = /\b(openai|grok|anthropic|chatgpt|claude|gemini)\b|\bx\.ai\b|\bxai\b/i
  for (const file of files) {
    const text = read(file)
    assert.equal(banned.test(text), false, file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/\bthe desk\b/i.test(text), false, file)
    assert.equal(text.includes('daily_market_brief.ts'), false, file)
  }
  assert.match(read('src/lib/dailyMarketBrief.ts'), /Daily brief/)
  assert.match(read('src/pages/dashboard/DailyMarketBriefPage.tsx'), /DAILY_BRIEF_TITLE/)
  const assets = path.join(root, 'dist/assets')
  if (!existsSync(assets)) return
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue
    const text = readFileSync(path.join(assets, name)).toString('latin1')
    assert.equal(banned.test(text), false, name)
  }
})
