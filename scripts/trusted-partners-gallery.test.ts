import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { PARTNER_CATEGORIES } from '../src/data/partnerCategories.ts'
import { contentSecurityPolicy } from './csp-policy.mjs'
import { inspectPartnerLogo, partnerLogoPublicUrl, PARTNER_LOGO_MAX_BYTES } from '../src/lib/partnerLogo.ts'
import { PARTNER_INTEREST_BUSY, PARTNER_INTEREST_THANKS, partnerInterestError } from '../src/lib/partnerInterest.ts'
import { publicGalleryPartners, visibleMemberPartners } from '../src/lib/trustedPartners.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261208120000_trusted_partners_gallery.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const migration = read(`supabase/migrations/${migrationName}`)

test('trusted partners migration bans search_path public and locks the gallery', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), migrationName)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261207120000_sponsor_directory_opt_in.sql'))
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  const headers = migration.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('as $$')))
  assert.ok(headers.length >= 16)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
  for (const table of ['partner_categories', 'partner_interest', 'sponsor_intro_requests']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
  }
  assert.match(migration, /if not private\.is_staff\(\) then/)
  assert.match(migration, /t\.is_demo = false/)
  assert.match(migration, /t\.logo_path is not null/)
  assert.match(migration, /real_n = 0 and t\.is_demo = true/)
  assert.equal(migration.includes("'is_demo', t.is_demo"), true)
  assert.match(migration, /'partner-logos'/)
  assert.match(migration, /524288/)
  assert.match(migration, /array\['image\/png', 'image\/jpeg', 'image\/webp'\]/)
  assert.equal(/image\/svg/.test(migration), false)
  assert.match(migration, /name ~ '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\/logo\$'/)
  assert.match(migration, /private\.is_staff\(\)/)
  assert.equal(/ADMIN_NOTIFY_EMAIL/.test(migration), false)
  assert.equal(migration.includes('the desk'), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  for (const category of PARTNER_CATEGORIES) {
    assert.equal(migration.includes(`'${category.slug}'`), true, category.slug)
    assert.equal(migration.includes(`'${category.name.replace(/'/g, "''")}'`), true, category.name)
  }
  assert.equal(read('src/components/TrustedPartners.tsx').includes('EXAMPLE_PARTNERS'), false)
  assert.equal(read('src/components/ExampleMark.tsx').includes('Example'), true)
  assert.match(read('src/components/SampleMark.tsx'), />\s*Sample\s*</)
  assert.equal(read('src/pages/admin/RePartnersEditor.tsx').includes('trusted_partners'), false)
})

test('logo bytes reject svg and oversize, and the public url stays on the supabase origin', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const svg = Uint8Array.from(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
  assert.equal(inspectPartnerLogo(png).ok, true)
  assert.equal(inspectPartnerLogo(jpeg).ok, true)
  assert.equal(inspectPartnerLogo(webp).ok, true)
  const svgResult = inspectPartnerLogo(svg)
  assert.equal(svgResult.ok, false)
  if (!svgResult.ok) assert.equal(svgResult.reason, 'svg')
  const huge = new Uint8Array(PARTNER_LOGO_MAX_BYTES + 1)
  huge.set(png)
  const oversize = inspectPartnerLogo(huge)
  assert.equal(oversize.ok, false)
  if (!oversize.ok) assert.equal(oversize.reason, 'oversize')
  const logoPath = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/logo'
  const url = partnerLogoPublicUrl(logoPath, 'https://example.supabase.co')
  assert.equal(url, `https://example.supabase.co/storage/v1/object/public/partner-logos/${logoPath}`)
  assert.equal(partnerLogoPublicUrl('../secret', 'https://example.supabase.co'), null)
  assert.equal(partnerLogoPublicUrl(logoPath, 'http://example.supabase.co'), null)
  const policy = contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: 'false',
    posthogHost: '',
    scriptHashes: [],
  })
  assert.match(policy, /img-src 'self' data: blob: https:\/\/example\.supabase\.co/)
  assert.equal(publicGalleryPartners([{ is_demo: true, logo_path: logoPath }, { is_demo: false, logo_path: null }]).length, 0)
  assert.equal(publicGalleryPartners([{ is_demo: false, logo_path: logoPath }]).length, 1)
  assert.equal(visibleMemberPartners([{ is_demo: true }, { is_demo: false }]).every((row) => !row.is_demo), true)
  assert.equal(visibleMemberPartners([{ is_demo: true }]).length, 1)
})

test('public landing hides the gallery at zero, one real fixture has no Sample, and the CTA opens /partners', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const landing = await vite.ssrLoadModule('/src/pages/LandingPage.tsx')
    const partners = await vite.ssrLoadModule('/src/pages/PartnersPage.tsx')
    const gallery = await vite.ssrLoadModule('/src/components/TrustedPartners.tsx')
    const homeMod = await vite.ssrLoadModule('/src/lib/homeSnapshot.ts')
    const homeView = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const editor = await vite.ssrLoadModule('/src/pages/admin/TrustedPartnersPanel.tsx')
    const showcase = await vite.ssrLoadModule('/src/pages/dashboard/PartnerShowcase.tsx')
    const app = read('src/App.tsx')
    assert.match(app, /path="\/apply" element=\{<ApplyPage/)
    assert.match(app, /path="partners" element=\{<PartnerShowcase/)
    assert.equal(app.includes('path="sponsors"'), false)

    const zero = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(landing.LandingPage)))
    assert.equal(zero.includes('id="partners"'), false)
    assert.equal(zero.includes('Three seats a year'), false)
    assert.equal(zero.includes('Qaf Ledger'), false)
    assert.equal(zero.includes('Mirsad Advisory'), false)
    assert.equal(zero.includes('Dar Escrow House'), false)
    assert.equal(zero.includes('Sample'), false)
    assert.equal(zero.includes('data-trusted-partners'), false)

    const fixture = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      is_demo: false,
      name: 'Example Capital',
      blurb: 'One line for a fixture partner.',
      monogram: 'EC',
      logo_path: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/logo',
      category_slug: 'investment-banking',
      is_partner: true,
    }
    const one = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(gallery.TrustedPartnersGallery, { partners: [fixture], surface: 'public' })),
    )
    assert.match(one, /Example Capital/)
    assert.match(one, /One line for a fixture partner\./)
    assert.match(one, /alt="Example Capital"/)
    assert.match(one, /href="\/partners"/)
    assert.equal(one.includes('Sample'), false)
    assert.equal(one.includes('data-sample'), false)

    const adviser = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      is_demo: false,
      is_partner: false,
      name: 'Example Advisory',
      blurb: 'One line for a fixture adviser.',
      monogram: 'EA',
      logo_path: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/logo',
      category_slug: null,
    }
    const split = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(gallery.TrustedPartnersGallery, { partners: [fixture, adviser], surface: 'public' })),
    )
    const partnerMarkup = split.slice(0, split.indexOf('data-gallery="advisers"'))
    const adviserMarkup = split.slice(split.indexOf('data-gallery="advisers"'))
    assert.match(partnerMarkup, /data-gallery="partners"/)
    assert.match(partnerMarkup, /data-partner-name="Example Capital"/)
    assert.equal(partnerMarkup.includes('Example Advisory'), false)
    assert.match(adviserMarkup, /Trusted advisers/)
    assert.match(adviserMarkup, /data-adviser-name="Example Advisory"/)
    assert.equal(adviserMarkup.includes('Example Capital'), false)
    assert.equal(adviserMarkup.includes('data-partner-name'), false)

    const destination = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(partners.PartnersPage)))
    assert.match(destination, /Partner with us/)
    assert.match(destination, /Investment banking/)
    assert.equal(/mailto:/i.test(destination), false)
    assert.equal(destination.includes('the desk'), false)
    assert.equal(destination.includes('\u2014'), false)

    const samples = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(gallery.TrustedPartnersGallery, {
          surface: 'member',
          partners: [
            {
              id: 'a4000001-0000-4000-8000-000000000001',
              is_demo: true,
              name: 'Qaf Ledger',
              blurb: 'Custody and fund administration for Gulf closings.',
              monogram: 'QL',
              logo_path: null,
              category_slug: null,
            },
          ],
        }),
      ),
    )
    assert.match(samples, /data-sample/)
    assert.match(samples, />Sample</)
    const realOnly = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(gallery.TrustedPartnersGallery, { partners: [fixture], surface: 'member' })),
    )
    assert.equal(realOnly.includes('data-sample'), false)

    const model = homeMod.assembleHome({
      nowMs: Date.parse('2026-10-06T12:00:00.000Z'),
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
      partners: [
        {
          id: 'a4000001-0000-4000-8000-000000000001',
          is_demo: true,
          name: 'Qaf Ledger',
          monogram: 'QL',
          blurb: 'Custody and fund administration for Gulf closings.',
        },
      ],
      gatherings: [],
      admitted: 1,
      ksa: 1,
      intl: 0,
      money: [],
      activity: [],
      activityStatus: 'empty',
      loading: false,
      partialError: false,
      updatedLabel: null,
    })
    const member = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(homeView.HomeSnapshotView, { model })),
    )
    assert.match(member, /Qaf Ledger/)
    assert.match(member, />Sample</)
    assert.match(member, /href="\/dashboard\/people\/partners"/)
    assert.match(member, /Partner showcase/)
    assert.equal(member.toLowerCase().includes('sponsor'), false)

    const admin = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(editor.TrustedPartnersPanel, {
          previewRows: [
            {
              id: fixture.id,
              is_demo: false,
              published: false,
              name: fixture.name,
              blurb: fixture.blurb,
              monogram: 'EC',
              logo_path: fixture.logo_path,
              category_slug: null,
              offer: 'A fixture offer.',
              sponsor_user_id: null,
              sort_order: 1,
            },
          ],
        }),
      ),
    )
    assert.match(admin, /Trusted partners/)
    assert.match(admin, /Example Capital/)
    assert.match(admin, /Add a partner/)
    assert.match(admin, /Logo/)

    const sponsor = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(showcase.PartnerShowcase, {
          preview: {
            counts: { pending: 1, approved: 0 },
            cards: [
              {
                id: fixture.id,
                name: fixture.name,
                blurb: fixture.blurb,
                offer: 'A fixture offer.',
                monogram: 'EC',
                logo_path: fixture.logo_path,
                category_slug: 'investment-banking',
                my_request: null,
              },
            ],
          },
        }),
      ),
    )
    assert.match(sponsor, /Request an intro/)
    assert.match(sponsor, /A fixture offer\./)
    assert.match(sponsor, /Names stay off this count/)
    assert.equal(sponsor.includes('@'), false)
    assert.equal(/mailto:/i.test(read('src/pages/PartnersPage.tsx')), false)
    assert.equal(read('src/pages/admin/TrustedPartnersPanel.tsx').includes('ADMIN_NOTIFY_EMAIL'), false)
    assert.equal(read('src/shell/viewCopy.ts').includes('Trusted partners'), false)
  } finally {
    await vite.close()
  }
})

test('the 21st partner note in a day shows the busy message', () => {
  assert.equal(partnerInterestError('busy_today'), 'We have had a lot of requests today. Please try again tomorrow.')
  assert.equal(PARTNER_INTEREST_BUSY, 'We have had a lot of requests today. Please try again tomorrow.')
  assert.equal(/sponsor/i.test(PARTNER_INTEREST_BUSY), false)
  assert.equal(/\bthe desk\b/i.test(PARTNER_INTEREST_BUSY), false)
  assert.equal(PARTNER_INTEREST_BUSY.includes('\u2014'), false)
  assert.match(read('src/pages/PartnersPage.tsx'), /partnerInterestError\(rpcError\.message\)/)
  const fn = migration.slice(
    migration.indexOf('create or replace function public.submit_partner_interest'),
    migration.indexOf('revoke all on function public.submit_partner_interest'),
  )
  assert.match(fn, /count\(\*\)/)
  assert.match(fn, /pg_catalog\.now\(\) - interval '1 day'/)
  assert.match(fn, /\) >= 20 then/)
  assert.match(fn, /raise exception 'busy_today' using errcode = 'P0001'/)
  assert.equal(/search_path\s*=\s*public/i.test(fn), false)
})

test('a second note for the same firm is still rejected under the daily cap', () => {
  assert.equal(partnerInterestError('already_sent'), null)
  assert.equal(PARTNER_INTEREST_THANKS, 'Thanks, our admin team will be in touch if it is a fit.')
  assert.equal(/sponsor/i.test(PARTNER_INTEREST_THANKS), false)
  assert.equal(/\bthe desk\b/i.test(PARTNER_INTEREST_THANKS), false)
  assert.match(read('src/pages/PartnersPage.tsx'), /PARTNER_INTEREST_THANKS/)
  const fn = migration.slice(
    migration.indexOf('create or replace function public.submit_partner_interest'),
    migration.indexOf('revoke all on function public.submit_partner_interest'),
  )
  const firmAt = fn.indexOf("raise exception 'already_sent'")
  const capAt = fn.indexOf("raise exception 'busy_today'")
  assert.ok(firmAt > 0 && capAt > firmAt)
})

test('new partner copy says partner and not sponsor', () => {
  const files = [
    'src/components/TrustedPartners.tsx',
    'src/components/SampleMark.tsx',
    'src/pages/admin/TrustedPartnersPanel.tsx',
    'src/pages/admin/PartnerInterestPanel.tsx',
    'src/pages/dashboard/PartnerShowcase.tsx',
  ]
  const banned = /sponsor|Founding Ecosystem Partner/i
  for (const file of files) {
    const source = read(file)
    const bits = [
      ...source.matchAll(/>([^<>{}\n]+)</g),
      ...source.matchAll(/\b(?:aria-label|placeholder|alt)="([^"]+)"/g),
      ...source.matchAll(/useNoIndex\('([^']+)'\)/g),
    ]
    for (const bit of bits) {
      const text = (bit[1] || '').trim()
      if (!text) continue
      assert.equal(banned.test(text), false, `${file}: ${text}`)
    }
  }
  const home = read('src/pages/dashboard/HomeSnapshotView.tsx')
  assert.match(home, /Partner showcase/)
  assert.match(home, /Trusted advisers/)
  assert.equal(home.includes('/dashboard/sponsors'), false)
  assert.equal(home.includes('SPONSOR_LABEL'), false)
  assert.match(read('src/App.tsx'), /path="partners" element=\{<PartnerShowcase/)
  assert.match(read('src/shell/destinations.ts'), /label: 'Partners', to: '\/dashboard\/people\/partners'/)
  assert.equal(read('scripts/public-nammco.mjs').includes('powered by nammco'), true)
})

function stubSql() {
  const text = readFileSync(new URL('./sponsor-directory-opt-in.test.ts', import.meta.url), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

const assertSql = `
do $checks$
#variable_conflict use_variable
declare
  member_id uuid := '11111111-1111-4111-8111-111111111111';
  sponsor_id uuid := '22222222-2222-4222-8222-222222222222';
  staff_id uuid := '33333333-3333-4333-8333-333333333333';
  partner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  adviser_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  payload jsonb;
  saved jsonb;
  intro jsonb;
  intro_row uuid;
begin
  insert into auth.users (id, email) values
    (member_id, 'member@example.com'),
    (sponsor_id, 'sponsor@example.com'),
    (staff_id, 'staff@example.com');
  insert into public.members (user_id, email, seat, status, is_demo) values
    (member_id, 'member@example.com', 'ksa', 'active', false),
    (sponsor_id, 'sponsor@example.com', 'sponsor', 'active', false);
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff@example.com', 'staff');
  insert into public.profiles (user_id, full_name) values
    (member_id, 'Example Member'),
    (sponsor_id, 'Example Sponsor');

  if (select count(*) from public.partner_categories) <> 15 then
    raise exception 'category count';
  end if;
  if has_table_privilege('anon', 'public.partner_interest', 'select')
     or has_table_privilege('authenticated', 'public.trusted_partners', 'insert') then
    raise exception 'table grant leaked';
  end if;
  if has_function_privilege('anon', 'public.staff_save_trusted_partner(uuid, text, text, text, boolean, text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.staff_reorder_trusted_partners(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.staff_set_trusted_partner_logo(uuid, text)', 'execute') then
    raise exception 'anon can call a staff rpc';
  end if;

  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  payload := public.list_trusted_partners();
  if payload <> '[]'::jsonb or payload::text ilike '%is_demo%' or payload::text ilike '%qaf%' then
    raise exception 'anon list before a real logo: %', payload;
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  set local role authenticated;
  payload := public.list_trusted_partners();
  if payload::text not ilike '%Qaf Ledger%' or payload::text not ilike '%"is_demo": true%' then
    raise exception 'member should see labelled samples: %', payload;
  end if;
  begin
    perform public.staff_save_trusted_partner(null, 'Example Capital', 'One line.', 'EC', false, null, null, null);
    raise exception 'member saved a partner';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  insert into public.trusted_partners (id, is_demo, published, name, blurb, monogram, logo_path, offer, sponsor_user_id)
  values (partner_id, false, true, 'Example Capital', 'One line for a fixture partner.', 'EC', partner_id::text || '/logo', 'A fixture offer.', sponsor_id);
  insert into public.trusted_partners (id, is_demo, published, name, blurb, monogram, logo_path, offer, sponsor_user_id)
  values (adviser_id, false, true, 'Example Advisory', 'One line for a fixture adviser.', 'EA', adviser_id::text || '/logo', null, null);

  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  payload := public.list_trusted_partners();
  if payload::text not ilike '%Example Capital%' or payload::text ilike '%is_demo%' or payload::text ilike '%Qaf Ledger%' or payload::text ilike '%sponsor_user_id%' then
    raise exception 'anon list with one real logo: %', payload;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(payload) elem
    where elem ->> 'name' = 'Example Capital' and (elem ->> 'is_partner')::boolean is true
  ) or not exists (
    select 1 from jsonb_array_elements(payload) elem
    where elem ->> 'name' = 'Example Advisory' and (elem ->> 'is_partner')::boolean is false
  ) then
    raise exception 'anon partner flag: %', payload;
  end if;
  perform public.submit_partner_interest('Example Person', 'Example Firm', 'investment-banking', 'A lane note');
  begin
    perform public.submit_partner_interest('Example Person', 'Example Firm', 'investment-banking', 'Again');
    raise exception 'same firm was accepted';
  exception
    when unique_violation then
      null;
  end;
  reset role;
  if (select count(*) from public.partner_interest where lower(firm) = lower('Example Firm')) <> 1 then
    raise exception 'same firm stored another row';
  end if;
  set local role anon;
  begin
    perform 1 from public.partner_interest;
    raise exception 'anon read the interest table';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  for i in 1..19 loop
    insert into public.partner_interest (contact_name, firm, category_slug)
    values ('Example Person', 'Example Firm ' || i::text, 'investment-banking');
  end loop;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform public.submit_partner_interest('Example Person', 'Example Firm Last', 'investment-banking', 'A note');
    raise exception 'cap did not hold';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'busy_today' then
        raise exception 'unexpected interest error %', sqlerrm;
      end if;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  payload := public.list_trusted_partners();
  if payload::text ilike '%Qaf Ledger%' or payload::text not ilike '%"is_demo": false%' then
    raise exception 'member still sees a sample beside a real row: %', payload;
  end if;
  payload := public.list_sponsor_showcase();
  if payload::text not ilike '%Example Capital%' or payload::text ilike '%example.com%' or payload::text ilike '%Example Member%' then
    raise exception 'showcase leaked a contact: %', payload;
  end if;
  intro := public.request_sponsor_intro(partner_id);
  if intro ->> 'status' is distinct from 'pending' then
    raise exception 'intro status %', intro;
  end if;
  if public.sponsor_intro_counts() is distinct from 'null'::jsonb then
    raise exception 'a member received sponsor counts';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  payload := public.sponsor_intro_counts();
  if (payload ->> 'pending')::int <> 1 or (payload ->> 'approved')::int <> 0 or payload::text ilike '%Example Member%' then
    raise exception 'sponsor counts leaked a name: %', payload;
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.staff_set_trusted_partner_published(partner_id, false);
    raise exception 'aal1 published';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('partner-logos', partner_id::text || '/logo');
    raise exception 'aal1 uploaded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  select r.id into intro_row from public.sponsor_intro_requests r where r.partner_id = partner_id;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  saved := public.staff_save_trusted_partner(null, 'Example Second', 'Another line.', 'ES', false, 'asset-management', null, null);
  if saved ->> 'ok' is distinct from 'true' then
    raise exception 'staff save failed';
  end if;
  perform public.staff_reorder_trusted_partners(array[partner_id, (saved ->> 'id')::uuid]);
  perform public.staff_set_trusted_partner_logo(partner_id, partner_id::text || '/logo');
  begin
    perform public.staff_set_trusted_partner_logo(partner_id, 'evil.svg');
    raise exception 'bad logo path saved';
  exception when invalid_parameter_value then
    null;
  end;
  insert into storage.objects (bucket_id, name) values ('partner-logos', partner_id::text || '/logo');
  begin
    insert into storage.objects (bucket_id, name) values ('partner-logos', 'evil.svg');
    raise exception 'svg path inserted';
  exception when insufficient_privilege then
    null;
  end;
  intro := public.staff_decide_sponsor_intro(intro_row, 'approved');
  if intro ->> 'status' is distinct from 'approved' then
    raise exception 'decide failed %', intro;
  end if;
  payload := public.staff_list_partner_interest();
  if payload::text not ilike '%Example Firm%' then
    raise exception 'staff missed the note';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  payload := public.sponsor_intro_counts();
  if (payload ->> 'approved')::int <> 1 or payload::text ilike '%Example Member%' then
    raise exception 'approved count leaked a name: %', payload;
  end if;
  reset role;

  insert into storage.objects (bucket_id, name) values ('partner-logos', 'secret.txt');
  set local role anon;
  if exists (select 1 from storage.objects where bucket_id = 'partner-logos') then
    raise exception 'anon listed a partner logo';
  end if;
  reset role;
end
$checks$;
`

test('anon never receives a sample, and staff aal1 cannot write', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-trusted-partners-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_trusted_partners_${process.pid}`
  writeFileSync(script, [stubSql(), ...names.map(include), assertSql].join('\n'))
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})
