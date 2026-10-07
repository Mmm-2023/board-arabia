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
import {
  PARTNER_LOGO_SAVE_ERROR,
  partnerLogoObjectPath,
  removePartnerLogo,
  savePartnerLogo,
  type PartnerLogoClient,
} from '../src/lib/partnerLogoActions.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261208130000_partner_logos_select_staff.sql'
const galleryName = '20261208120000_trusted_partners_gallery.sql'
const partnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const pathClause =
  "name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'"

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function usingBody(sql: string, policy: string) {
  const start = sql.indexOf(`create policy ${policy}`)
  assert.ok(start > 0, policy)
  const using = sql.indexOf('using (', start)
  assert.ok(using > start, policy)
  const end = sql.indexOf(');', using)
  assert.ok(end > using, policy)
  return sql.slice(using, end)
}

test('partner logo select policy is staff only and matches the write path', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf(galleryName))
  const hotfix = read(`supabase/migrations/${migrationName}`)
  const gallery = read(`supabase/migrations/${galleryName}`)
  assert.equal(gallery.includes('partner_logos_select_staff'), false)
  assert.match(hotfix, /create policy partner_logos_select_staff on storage\.objects/)
  assert.match(hotfix, /for select to authenticated/)
  assert.equal(hotfix.includes(pathClause), true)
  assert.equal(usingBody(hotfix, 'partner_logos_select_staff'), usingBody(gallery, 'partner_logos_delete_staff'))
  assert.match(usingBody(hotfix, 'partner_logos_select_staff'), /bucket_id = 'partner-logos'/)
  assert.match(usingBody(hotfix, 'partner_logos_select_staff'), /private\.is_staff\(\)/)
  assert.equal((hotfix.match(/create policy /g) ?? []).length, 1)
  assert.equal(/to anon|to public|grant /i.test(hotfix), false)
  assert.equal(/create (or replace )?function/i.test(hotfix), false)
  assert.equal(/search_path\s*=\s*public/i.test(hotfix), false)
  assert.equal(hotfix.includes('the desk'), false)
  assert.equal(/sponsor/i.test(hotfix), false)
  assert.equal(hotfix.includes('\u2014'), false)
  assert.equal(hotfix.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(hotfix), false)
  const panel = read('src/pages/admin/TrustedPartnersPanel.tsx')
  const actions = read('src/lib/partnerLogoActions.ts')
  assert.match(panel, /Remove logo/)
  assert.match(panel, /removePartnerLogo\(/)
  assert.match(panel, /savePartnerLogo\(/)
  assert.equal(panel.includes('Could not upload that logo.'), false)
  assert.equal(panel.includes('Could not save that logo.'), false)
  assert.equal(actions.includes(PARTNER_LOGO_SAVE_ERROR), true)
  assert.equal(panel.includes('\u2014') || actions.includes('\u2014'), false)
})

test('remove deletes the storage object and clears the partner logo', async () => {
  const calls: string[] = []
  const client: PartnerLogoClient = {
    async upload(path) {
      calls.push(`upload:${path}`)
      return { error: null }
    },
    async remove(paths) {
      calls.push(`remove:${paths.join(',')}`)
      return { error: null }
    },
    async setLogo(id, logoPath) {
      calls.push(`set:${id}:${String(logoPath)}`)
      return { error: null }
    },
  }
  const removed = await removePartnerLogo(client, partnerId)
  assert.equal(removed, null)
  assert.deepEqual(calls, [`remove:${partnerLogoObjectPath(partnerId)}`, `set:${partnerId}:null`])

  calls.length = 0
  let cleared = false
  const denied: PartnerLogoClient = {
    async upload() {
      return { error: null }
    },
    async remove() {
      return { error: { message: 'denied' } }
    },
    async setLogo() {
      cleared = true
      return { error: null }
    },
  }
  assert.equal(await removePartnerLogo(denied, partnerId), PARTNER_LOGO_SAVE_ERROR)
  assert.equal(cleared, false)
  assert.equal(PARTNER_LOGO_SAVE_ERROR, 'We could not save that. Please try again.')

  const saved = await savePartnerLogo(
    {
      async upload(path, _bytes, options) {
        calls.push(`upload:${path}:${options.upsert}`)
        return { error: { message: 'denied' } }
      },
      async remove() {
        return { error: null }
      },
      async setLogo() {
        calls.push('set')
        return { error: null }
      },
    },
    partnerId,
    Uint8Array.from([1]),
    'image/png',
  )
  assert.equal(saved, PARTNER_LOGO_SAVE_ERROR)
  assert.deepEqual(calls, [`upload:${partnerLogoObjectPath(partnerId)}:true`])
})

test('admin logo control offers remove only when a logo is stored', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const editor = await vite.ssrLoadModule('/src/pages/admin/TrustedPartnersPanel.tsx')
    const row = {
      id: partnerId,
      is_demo: false,
      published: true,
      name: 'Example Capital',
      blurb: 'One line for a fixture partner.',
      monogram: 'EC',
      logo_path: partnerLogoObjectPath(partnerId),
      category_slug: null,
      offer: null,
      sponsor_user_id: null,
      sort_order: 1,
    }
    const withLogo = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(editor.TrustedPartnersPanel, { previewRows: [row] })),
    )
    assert.match(withLogo, /Remove logo/)
    assert.match(withLogo, /Example Capital/)
    const withoutLogo = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(editor.TrustedPartnersPanel, { previewRows: [{ ...row, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', logo_path: null, name: 'Example Advisory' }] }),
      ),
    )
    assert.equal(withoutLogo.includes('Remove logo'), false)
    assert.match(withoutLogo, />Logo</)
  } finally {
    await vite.close()
  }
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
  staff_id uuid := '33333333-3333-4333-8333-333333333333';
  partner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  seen int;
begin
  insert into auth.users (id, email) values
    (member_id, 'member@example.com'),
    (staff_id, 'staff@example.com');
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff@example.com', 'staff');
  insert into storage.objects (bucket_id, name) values
    ('partner-logos', partner_id::text || '/logo'),
    ('partner-logos', 'secret.txt');

  if (
    select count(*) from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and p.polname = 'partner_logos_select_staff'
      and p.polcmd = 'r'
      and p.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
  ) <> 1 then
    raise exception 'select policy is not authenticated only';
  end if;
  if exists (
    select 1 from pg_policy p
    where p.polname = 'partner_logos_select_public'
       or (
         p.polname like 'partner_logos%'
         and (
           p.polroles = '{}'::oid[]
           or p.polroles && array[(select oid from pg_roles where rolname = 'anon')]::oid[]
         )
       )
  ) then
    raise exception 'anon can use a partner logo policy';
  end if;

  set local role anon;
  select count(*) into seen from storage.objects where bucket_id = 'partner-logos';
  if seen <> 0 then
    raise exception 'anon listed partner logos';
  end if;
  delete from storage.objects where bucket_id = 'partner-logos';
  reset role;
  if (select count(*) from storage.objects where name = partner_id::text || '/logo') <> 1 then
    raise exception 'anon delete removed a logo';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from storage.objects where bucket_id = 'partner-logos';
  if seen <> 0 then
    raise exception 'member listed partner logos';
  end if;
  update storage.objects set name = name where bucket_id = 'partner-logos';
  if found then
    raise exception 'member replaced a logo';
  end if;
  delete from storage.objects where bucket_id = 'partner-logos';
  if found then
    raise exception 'member deleted a logo';
  end if;
  begin
    insert into storage.objects (bucket_id, name) values ('partner-logos', partner_id::text || '/logo');
    raise exception 'member uploaded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from storage.objects where bucket_id = 'partner-logos';
  if seen <> 0 then
    raise exception 'staff aal1 listed partner logos';
  end if;
  delete from storage.objects where bucket_id = 'partner-logos';
  if found then
    raise exception 'staff aal1 deleted a logo';
  end if;
  begin
    insert into storage.objects (bucket_id, name) values ('partner-logos', partner_id::text || '/logo');
    raise exception 'staff aal1 uploaded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  if (select count(*) from storage.objects where name = partner_id::text || '/logo') <> 1 then
    raise exception 'aal1 delete removed a logo';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from storage.objects
  where bucket_id = 'partner-logos' and name = partner_id::text || '/logo';
  if seen <> 1 then
    raise exception 'staff aal2 missed the logo';
  end if;
  select count(*) into seen from storage.objects where bucket_id = 'partner-logos' and name = 'secret.txt';
  if seen <> 0 then
    raise exception 'staff listed a stray object';
  end if;
  update storage.objects
  set name = partner_id::text || '/logo'
  where bucket_id = 'partner-logos' and name = partner_id::text || '/logo';
  if not found then
    raise exception 'staff aal2 could not replace';
  end if;
  delete from storage.objects
  where bucket_id = 'partner-logos' and name = partner_id::text || '/logo';
  if not found then
    raise exception 'staff aal2 could not delete';
  end if;
  insert into storage.objects (bucket_id, name) values ('partner-logos', partner_id::text || '/logo');
  begin
    insert into storage.objects (bucket_id, name) values ('partner-logos', 'evil.svg');
    raise exception 'svg path inserted';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into seen from storage.objects
  where bucket_id = 'partner-logos' and name = partner_id::text || '/logo';
  if seen <> 1 then
    raise exception 'staff aal2 upload did not land';
  end if;
  reset role;
end
$checks$;
`

test('staff aal2 can select, replace, and delete a partner logo; others cannot list', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-partner-logo-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_partner_logo_${process.pid}`
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
