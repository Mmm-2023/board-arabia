import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { joinCardMeta } from '../src/lib/cardMeta.ts'
import { ownDeckPath } from '../src/lib/ownDeckPath.ts'
import { isTwoTierRegisterEnabled, publicConsiderationCta, setTwoTierRegisterForTests } from '../src/lib/twoTierRegister.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function latestFunction(name: string) {
  const header = `create or replace function public.${name}`
  let body = ''
  for (const file of readdirSync(migrationsDir).filter((item) => item.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
    const at = sql.lastIndexOf(header)
    if (at < 0) continue
    const asAt = sql.indexOf('as $$\n', at)
    const end = sql.indexOf('\n$$;', asAt)
    assert.ok(asAt > at && end > asAt, file)
    body = sql.slice(asAt, end)
  }
  assert.ok(body, name)
  return body
}

test('blank readiness fields drop separators', () => {
  assert.deepEqual(joinCardMeta(['Riyadh', '', '  ', null, undefined]), ['Riyadh'])
  assert.deepEqual(joinCardMeta(['Riyadh', 'residential']), ['Riyadh', 'residential'])
  assert.deepEqual(joinCardMeta(['', null, '   ']), [])
  const joined = joinCardMeta(['Riyadh', '', '']).join(' · ')
  assert.equal(joined, 'Riyadh')
  assert.equal(joined.includes(','), false)
  assert.equal(joined.includes('|'), false)
})

test('opportunity readiness cards omit empty separators', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const cardView = await vite.ssrLoadModule('/src/pages/dashboard/OpportunityCard.tsx')
    const editorView = await vite.ssrLoadModule('/src/pages/admin/ReReadinessEditor.tsx')
    const blank = {
      id: 'b1000001-0000-4000-8000-000000000003',
      is_demo: true,
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: '',
      capital_role: '',
      ticket_band: '',
      one_liner: 'A residential brief.',
      foreign_ownership_path: null,
      escrow_off_plan: null,
      title_clarity: null,
      white_land_exposure: null,
      unlocked: false,
      access: 'locked',
      intro_status: null,
    }
    const cardHtml = renderToStaticMarkup(createElement(cardView.OpportunityCard, { card: blank }))
    const editorHtml = renderToStaticMarkup(
      createElement(editorView.ReReadinessEditor, {
        status: 'ready',
        cards: [{ ...blank, unlocked: true, access: 'inventory', published: true, sponsor_member_id: null }],
        busyId: null,
        notice: null,
        alert: null,
        onRetry: () => undefined,
        onSave: () => undefined,
      }),
    )
    for (const html of [cardHtml, editorHtml]) {
      assert.match(html, /Riyadh/)
      const at = html.indexOf('Riyadh')
      const around = html.slice(at, at + 80)
      assert.equal(around.includes('·'), false, around)
      assert.equal(around.includes(','), false, around)
      assert.equal(around.includes('|'), false, around)
    }
    const filled = renderToStaticMarkup(
      createElement(cardView.OpportunityCard, {
        card: { ...blank, asset_class: 'residential', ticket_band: '$10-25m', capital_role: 'equity', is_demo: false },
      }),
    )
    assert.match(filled, /Riyadh/)
    assert.match(filled, />Residential</)
    assert.match(filled, />Equity</)
    assert.match(filled, /·/)
  } finally {
    await vite.close()
  }
})

test('a non-owner cannot delete a due diligence report or its deck', () => {
  const sql = read('supabase/migrations/20261114120000_fixes6_delete_avatars_samples.sql')
  const fn = latestFunction('delete_own_due_diligence_report')
  const header = sql.slice(sql.indexOf('function public.delete_own_due_diligence_report'), sql.indexOf('as $$'))
  assert.match(header, /security definer/)
  assert.match(header, /set search_path = ''/)
  const guard = fn.indexOf('not_allowed')
  const deckDelete = fn.indexOf('delete from public.due_diligence_decks')
  assert.ok(guard > 0 && deckDelete > guard)
  assert.equal(fn.includes('storage.objects'), false)
  assert.match(fn, /r\.member_id = v_owner/)
  assert.match(fn, /member_id = v_owner/)
  assert.match(fn, /'storage_path', v_path/)
  assert.match(sql, /revoke all on function public\.delete_own_due_diligence_report\(uuid\) from public, anon/)
  assert.match(sql, /grant execute on function public\.delete_own_due_diligence_report\(uuid\) to authenticated/)
  assert.equal(/grant execute on function public\.delete_own_due_diligence_report\([^;]*\) to anon/.test(sql), false)
  assert.match(sql, /due_diligence_decks_storage_delete_own/)
  assert.match(sql, /name ~ \(\s*'\^' \|\| \(select auth\.uid\(\)\)::text/)
  assert.equal(/for delete to anon/.test(sql), false)
  assert.equal(/for delete to public/.test(sql), false)
  const home = read('src/pages/dashboard/AiToolsHome.tsx')
  const client = read('src/lib/dueDiligence.ts')
  const rpcAt = client.indexOf("rpc('delete_own_due_diligence_report'")
  const removeAt = client.indexOf('.remove([path])')
  assert.ok(rpcAt > 0 && removeAt > rpcAt)
  assert.match(client, /due-diligence-decks|DECK_BUCKET/)
  assert.match(home, /deleteOwnDueDiligenceReport/)
  assert.match(home, /Delete this report\?/)
  assert.match(home, /Report deleted\./)
  assert.match(home, /Could not delete that report\. Retry\./)
  assert.match(home, /uploaded deck could not be deleted/)
  assert.equal(home.includes('service_role'), false)
  assert.equal(client.includes('storage.objects'), false)
  const owner = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const deck = '33333333-3333-4333-8333-333333333333'
  assert.equal(ownDeckPath({ storage_path: `${owner}/${deck}/source.pdf` }, owner), `${owner}/${deck}/source.pdf`)
  assert.equal(ownDeckPath({ storage_path: `${other}/${deck}/source.pdf` }, owner), null)
  assert.equal(ownDeckPath({ storage_path: `${owner}/${deck}/source.pdf` }, other), null)
})

test('staff can read member avatars and members are not granted a wider raw read', () => {
  const sql = read('supabase/migrations/20261114120000_fixes6_delete_avatars_samples.sql')
  assert.match(sql, /member_avatars_select_staff/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /bucket_id = 'member-avatars'/)
  assert.equal(/drop policy if exists member_avatars_select_own/.test(sql), false)
  assert.equal(/drop policy if exists member_avatars_select_peers/.test(sql), false)
  assert.equal(/for select to anon/.test(sql), false)
  const signed = read('src/components/SignedAvatar.tsx')
  const hook = read('src/lib/useSignedAvatar.ts')
  assert.match(signed, /signed\.failed \? null : signed\.url/)
  assert.match(hook, /failed: true/)
  assert.equal(hook.includes('alert('), false)
})

test('sample mandate intros stay blocked for members and inert on staff home', async () => {
  const request = latestFunction('request_mandate_intro')
  const decide = latestFunction('staff_decide_mandate_intro')
  const list = latestFunction('staff_list_mandate_intros')
  for (const body of [request, decide]) {
    const guard = body.indexOf('sample_blocked')
    const write = body.toLowerCase().search(/\b(insert|update)\b/)
    assert.ok(guard > 0 && write > guard)
  }
  assert.match(list, /if not private\.is_staff\(\)/)
  assert.match(list, /'is_demo', m\.is_demo or private\.sample_subject\(m\.id\)/)

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const queue = await vite.ssrLoadModule('/src/pages/admin/MandateIntroQueue.tsx')
    const mandates = await vite.ssrLoadModule('/src/pages/dashboard/MandateCard.tsx')
    const sampleHtml = renderToStaticMarkup(
      createElement(queue.MandateIntroQueueView, {
        rows: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sector: 'Housing',
          deal_type: 'Equity',
          company_name: 'Nahla',
          member_name: 'Member',
          is_demo: true,
        }],
        loadError: false,
        decideError: 'Sample requests stay as they are.',
        declineId: null,
        busy: false,
        onApprove: () => undefined,
        onDecline: () => undefined,
        onCancelDecline: () => undefined,
        onConfirmDecline: () => undefined,
      }),
    )
    assert.match(sampleHtml, /Nahla/)
    assert.match(sampleHtml, />Sample</)
    assert.match(sampleHtml, /Sample requests stay as they are\./)
    const buttons = [...sampleHtml.matchAll(/<button[^>]*>/g)].map((match) => match[0])
    assert.ok(buttons.length >= 2)
    assert.ok(buttons.every((button) => button.includes('disabled')))

    const sampleMandate = {
      id: 'b',
      is_demo: true,
      sector: 'Housing',
      deal_type: 'Equity',
      ticket_band: '$10-25m',
      geography: 'KSA',
      stage: 'Diligence',
      one_liner: 'Example brief.',
      unlocked: false,
      intro_status: null,
    }
    const mandateHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(mandates.MandateCard, { mandate: sampleMandate, onRequest: () => undefined })),
    )
    const requestButton = mandateHtml.match(/<button[^>]*>Request intro<\/button>/)?.[0] ?? ''
    assert.match(requestButton, /disabled/)
  } finally {
    await vite.close()
  }
})

test('admin mandates and rooms are static Pages shells', () => {
  const prerender = read('scripts/prerender.mjs')
  assert.match(prerender, /'admin\/mandates'/)
  assert.match(prerender, /'admin\/rooms'/)
})

test('the shell sidebar sticks and fills the viewport', () => {
  const css = read('src/index.css')
  const rule = css.slice(css.indexOf('.shell-frame > aside {'), css.indexOf('.shell-column {'))
  assert.match(rule, /position:\s*sticky/)
  assert.match(rule, /height:\s*100dvh/)
  assert.match(rule, /min-height:\s*100dvh/)
  assert.match(css, /#root \{\s*min-height:\s*100dvh/)
})

test('/apply posts to submit-application while the two tier flag is off', () => {
  setTwoTierRegisterForTests(false)
  try {
    assert.equal(isTwoTierRegisterEnabled(), false)
    assert.deepEqual(publicConsiderationCta(), { to: '/apply', label: 'Apply for consideration' })
    const apply = read('src/pages/ApplyPage.tsx')
    const submit = read('src/lib/supabase.ts')
    assert.match(apply, /submitApplication\(/)
    assert.match(submit, /\/submit-application/)
    assert.equal(/register-candidate|registerCandidate/.test(apply), false)
    const surfaces = [
      'src/pages/LandingPage.tsx',
      'src/components/Nav.tsx',
      'src/components/Footer.tsx',
      'src/components/landing/StickyApply.tsx',
      'src/components/CtaBand.tsx',
    ]
    for (const file of surfaces) {
      assert.equal(read(file).includes('"/register"'), false, file)
    }
  } finally {
    setTwoTierRegisterForTests(null)
  }
})

test('AI tools card and the due diligence upload sit at the top', async () => {
  const home = read('src/pages/dashboard/AiToolsHome.tsx')
  const cardAt = home.indexOf('to="/dashboard/ai/due-diligence"')
  const startAt = home.indexOf('Start a check')
  assert.ok(cardAt > 0 && startAt > cardAt)
  assert.match(home, /min-h-11/)
  assert.match(home, /hover:border-\[var\(--ba-indigo\)\]/)
  assert.match(home, /focus-visible:ring-2/)
  assert.match(home, /<svg/)
  assert.match(home, />\s*Delete\s*</)
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const desk = await vite.ssrLoadModule('/src/shell/renderDueDesk.tsx')
    const { idle } = desk.renderDueDeskStates()
    const titleAt = idle.indexOf('>AI Due Diligence<')
    const uploadAt = idle.indexOf('Choose PDF or PPTX')
    const scopeAt = idle.indexOf('What this check does and will not do')
    assert.ok(titleAt >= 0 && uploadAt > titleAt && scopeAt > uploadAt)
    assert.equal(idle.includes('<details open'), false)
    assert.equal(idle.split('Public sources only.').length - 1, 1)
  } finally {
    await vite.close()
  }
})
