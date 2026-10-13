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
  briefSystemPrompt,
  briefUserPrompt,
  handleDailyMarketBrief,
  hitsFromOutletBody,
  MARKET_BRIEF_DAILY_HEADER,
  marketBriefDayDue,
  outletSearchRequest,
  runDailyMarketBrief,
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
  ]
  const raw = JSON.stringify({
    items: [
      {
        group: 'deals',
        summary: 'Example holding agrees a sample joint venture.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        summary: 'This source was not in the input set.',
        url: 'https://example.com/invented',
      },
      {
        group: 'regulation',
        summary: 'A summary that uses an em dash here \u2014 and must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'leadership',
        summary: `Arabic mark ${String.fromCharCode(0x0645)} must drop.`,
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
      {
        group: 'deals',
        summary: 'This summary names openai and must drop.',
        url: 'https://www.spa.gov.sa/w/example-deal',
      },
    ],
  })
  const kept = acceptBriefItems(raw, hits, outlets)
  assert.equal(kept.length, 1)
  assert.equal(kept[0]?.url, 'https://www.spa.gov.sa/w/example-deal')
  assert.equal(kept[0]?.outlet, 'Saudi Press Agency')
  assert.equal(kept[0]?.summary.includes('\u2014'), false)
  const prompt = briefUserPrompt(hits)
  assert.match(prompt, /https:\/\/www\.spa\.gov\.sa\/w\/example-deal/)
  assert.equal(prompt.includes('@'), false)
  assert.equal(briefSystemPrompt().includes('\u2014'), false)
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
  assert.equal(result.modelId, 'unit-model-id')
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
          summary: 'Example holding agrees a sample joint venture.',
          outlet: 'Saudi Press Agency',
          url: 'https://www.spa.gov.sa/w/example-deal',
          dated: '2026-10-12',
        },
        {
          group: 'deals',
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
    generatedAt: '2026-10-12T09:00:00.000Z',
    items: [
      {
        group: 'deals' as const,
        summary: 'Example holding agrees a sample joint venture.',
        outlet: 'Saudi Press Agency',
        url: 'https://www.spa.gov.sa/w/example-deal',
        dated: '2026-10-12',
      },
    ],
  }
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
      createElement(MemoryRouter, null, createElement(cardMod.DailyMarketBriefCard, { brief })),
    )
    assert.match(card, new RegExp(`href="${copy.DAILY_BRIEF_PATH}"`))
    assert.match(card, /AI summary/)
    assert.match(card, /rel="noopener noreferrer"/)
    assert.match(card, /target="_blank"/)
    const page = renderToStaticMarkup(createElement(pageMod.DailyMarketBriefView, { brief }))
    assert.match(page, /Example holding agrees a sample joint venture\./)
    assert.match(page, new RegExp(copy.DAILY_BRIEF_FOOTER.replace(/[.]/g, '\\.')))
    assert.match(page, new RegExp(copy.DAILY_BRIEF_AI_LABEL))
    const empty = renderToStaticMarkup(createElement(pageMod.DailyMarketBriefView, { brief: null }))
    assert.match(empty, new RegExp(copy.DAILY_BRIEF_EMPTY))
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
  assert.ok(names.includes('20261211120000_daily_market_brief.sql'))
  assert.ok(names.indexOf('20261211120000_daily_market_brief.sql') > names.indexOf('20261210120000_sectors_city_about.sql'))
  const sql = read('supabase/migrations/20261211120000_daily_market_brief.sql')
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
  assert.match(config, /Do not set the secret, do not add a schedule, and do not invoke/)
  assert.equal(existsSync(path.join(root, '.github/workflows/market-brief-daily.yml')), false)
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
  assert.match(read('src/lib/dailyMarketBrief.ts'), /Daily market brief/)
  assert.match(read('src/pages/dashboard/DailyMarketBriefPage.tsx'), /DAILY_BRIEF_TITLE/)
  const assets = path.join(root, 'dist/assets')
  if (!existsSync(assets)) return
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue
    const text = readFileSync(path.join(assets, name)).toString('latin1')
    assert.equal(banned.test(text), false, name)
  }
})
