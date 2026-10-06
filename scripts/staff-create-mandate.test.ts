import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { emptyNewMandate, validateNewMandate, type NewMandateDraft } from '../src/lib/newMandate.ts'
import type { StaffMandateBrief } from '../src/lib/mandateMatch.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261206120000_staff_create_mandate.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function weeklyStub(): string {
  const text = readFileSync(new URL('./weekly-intro-suggestions.test.ts', import.meta.url), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

function validDraft(patch: Partial<NewMandateDraft> = {}): NewMandateDraft {
  return {
    ...emptyNewMandate(),
    sector: 'Logistics',
    dealType: 'Growth equity',
    ticketBand: 'Growth band',
    geography: 'KSA',
    stage: 'Diligence',
    oneLiner: 'Growth capital for a regional freight platform.',
    companyName: 'Example Freight',
    exactAmount: 'Set on request',
    terms: 'One board seat.',
    contactName: 'Example Contact',
    contactEmail: 'contact@example.com',
    contactPhone: 'Extension 100',
    narrative: 'Example Freight is a sample brief. Terms stay in this note.',
    sectorTags: ['Logistics'],
    visionThemes: ['Industrial development and logistics'],
    ...patch,
  }
}

test('staff create mandate migration sorts after the held slots and locks the RPC', () => {
  const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  for (const name of names) assert.ok(name <= migrationName, name)
  assert.ok(migrationName > '20261205120000')
  assert.ok(migrationName > '20261204120000')
  assert.ok(migrationName > '20261203120000_staff_display_names.sql')
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /if not private\.is_staff\(\) then/)
  assert.match(sql, /raise exception 'not_allowed' using errcode = '42501'/)
  assert.match(sql, /raise exception 'invalid_mandate' using errcode = '22023'/)
  assert.match(sql, /is_demo,\s*\n\s*published/)
  assert.match(sql, /pg_catalog\.gen_random_uuid\(\),\s*\n\s*false,\s*\n\s*false,/)
  assert.match(sql, /'published', false/)
  assert.equal(/p_published/.test(sql), false)
  assert.equal(/v_published/.test(sql), false)
  assert.equal(/\bupdate\b/i.test(sql), false)
  assert.equal(/majlis_/i.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(sql.includes('the desk'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), false)
  assert.match(
    sql,
    /revoke all on function public\.staff_create_mandate\(\s*text, text, text, text, text, text, text, text, text, text, text, text, text, text, text\[\], text\[\]\s*\) from public, anon, authenticated;/,
  )
  assert.match(
    sql,
    /revoke all on function public\.staff_create_mandate\(\s*text, text, text, text, text, text, text, text, text, text, text, text, text, text, text\[\], text\[\]\s*\) from public, anon;/,
  )
  assert.match(
    sql,
    /grant execute on function public\.staff_create_mandate\(\s*text, text, text, text, text, text, text, text, text, text, text, text, text, text, text\[\], text\[\]\s*\) to authenticated;/,
  )
  assert.equal(/grant execute on function public\.staff_create_mandate\([\s\S]*\) to anon/.test(sql), false)
  assert.equal(/grant execute on function public\.staff_create_mandate\([\s\S]*\) to public/.test(sql), false)
})

test('field checks reject length, @ in public text, and missing required values', () => {
  assert.equal(validateNewMandate(validDraft()), null)
  assert.equal(validateNewMandate(validDraft({ sector: '   ' }))?.message, 'Sector is required.')
  assert.equal(validateNewMandate(validDraft({ narrative: '' }))?.field, 'narrative')
  assert.equal(validateNewMandate(validDraft({ contactEmail: '' }))?.message, 'Contact email is required.')
  assert.equal(validateNewMandate(validDraft({ oneLiner: 'x'.repeat(281) }))?.message, 'One liner is too long.')
  assert.equal(validateNewMandate(validDraft({ sector: 'x'.repeat(121) }))?.message, 'Sector is too long.')
  assert.equal(validateNewMandate(validDraft({ narrative: 'x'.repeat(2001) }))?.message, 'Narrative is too long.')
  assert.equal(
    validateNewMandate(validDraft({ sector: 'Logistics @ north' }))?.message,
    'Public fields cannot include @.',
  )
  assert.equal(
    validateNewMandate(validDraft({ oneLiner: 'Write to name@example.com for the brief.' }))?.message,
    'Public fields cannot include @.',
  )
  assert.equal(
    validateNewMandate(validDraft({ oneLiner: 'Growth capital for Example Freight this year.' }))?.message,
    'The one liner cannot include the company name.',
  )
  assert.equal(validateNewMandate(validDraft({ contactEmail: 'not-an-email' }))?.message, 'Enter a valid contact email.')
  assert.equal(
    validateNewMandate(validDraft({ sectorTags: ['Logistics', 'Health', 'Mining', 'Tourism'] }))?.message,
    'Choose at most 3 sector tags.',
  )
  assert.equal(validateNewMandate(validDraft({ deckUrl: 'http://example.com/brief' }))?.field, 'deckUrl')
  const page = read('src/pages/admin/AdminMandatesPage.tsx')
  const deniedAt = page.indexOf("list.status === 'denied'")
  const submitAt = page.indexOf('async function onSubmit')
  assert.ok(deniedAt > 0 && submitAt > deniedAt)
  const denied = page.slice(deniedAt, submitAt)
  assert.equal(denied.includes('AdminMandatesView'), false)
  assert.equal(denied.includes('NewMandateForm'), false)
  assert.equal(read('src/pages/dashboard/MandatesPage.tsx').includes('NewMandateForm'), false)
  assert.equal(read('src/pages/dashboard/MandatesPage.tsx').includes('staff_create_mandate'), false)
  assert.equal(page.includes('\u2014'), false)
  assert.equal(page.includes('the desk'), false)
  assert.equal(read('src/pages/admin/NewMandateForm.tsx').includes('the desk'), false)
  assert.equal(read('src/pages/admin/AdminMandatesView.tsx').includes('the desk'), false)
})

test('the new mandate form renders on the staff list and not on member pages', async () => {
  const src = path.join(root, 'src')
  const formHits: string[] = []
  const rpcHits: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      const text = readFileSync(full, 'utf8')
      const rel = path.relative(root, full)
      if (text.includes('NewMandateForm')) formHits.push(rel)
      if (text.includes('staff_create_mandate')) rpcHits.push(rel)
    }
  }
  walk(src)
  assert.deepEqual(formHits.sort(), [
    'src/pages/admin/AdminMandatesView.tsx',
    'src/pages/admin/NewMandateForm.tsx',
  ])
  assert.deepEqual(rpcHits.sort(), ['src/lib/database.types.ts', 'src/lib/mandateMatchApi.ts'])

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/admin/AdminMandatesView.tsx')
    const empty = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.AdminMandatesView, {
          mandates: [],
          draft: emptyNewMandate(),
          field: '',
          message: '',
          notice: '',
          busy: false,
          onDraft: () => undefined,
          onSubmit: () => undefined,
        }),
      ),
    )
    assert.match(empty, /data-new-mandate="form"/)
    assert.match(empty, /Save mandate/)
    assert.equal(empty.includes('data-new-mandate-error'), false)
    assert.equal(empty.includes('>Example<'), false)
    assert.equal(empty.includes('Published'), false)
    assert.equal(read('src/pages/admin/NewMandateForm.tsx').includes('Published'), false)
    assert.equal(read('src/lib/newMandate.ts').includes('p_published'), false)

    const invalid = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.AdminMandatesView, {
          mandates: [],
          draft: validDraft({ sector: 'Logistics @ north' }),
          field: 'sector',
          message: 'Public fields cannot include @.',
          notice: '',
          busy: false,
          onDraft: () => undefined,
          onSubmit: () => undefined,
        }),
      ),
    )
    assert.match(invalid, /data-new-mandate-error/)
    assert.match(invalid, /Public fields cannot include @\./)

    const saved = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.AdminMandatesView, {
          mandates: [],
          draft: emptyNewMandate(),
          field: '',
          message: '',
          notice: 'Mandate saved. It is not an Example.',
          busy: false,
          onDraft: () => undefined,
          onSubmit: () => undefined,
        }),
      ),
    )
    assert.match(saved, /data-new-mandate-notice/)
    assert.match(saved, /Mandate saved\. It is not an Example\./)

    const created: StaffMandateBrief = {
      id: 'example-freight',
      isDemo: false,
      published: false,
      sector: 'Logistics',
      dealType: 'Growth equity',
      ticketBand: 'Growth band',
      geography: 'KSA',
      stage: 'Diligence',
      oneLiner: 'Growth capital for a regional freight platform.',
      companyName: 'Example Freight',
      sectorTags: ['Logistics'],
      visionThemes: ['Industrial development and logistics'],
      matchCount: 0,
    }
    const sample: StaffMandateBrief = {
      ...created,
      id: 'example-holdings',
      isDemo: true,
      published: true,
      sector: 'Health',
      companyName: 'Example Holdings',
      oneLiner: 'A sample brief kept on the list.',
    }
    const list = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.AdminMandatesView, {
          mandates: [created, sample],
          draft: emptyNewMandate(),
          field: '',
          message: '',
          notice: '',
          busy: false,
          onDraft: () => undefined,
          onSubmit: () => undefined,
        }),
      ),
    )
    const live = list.match(/data-example="false"[\s\S]*?<\/li>/)?.[0] ?? ''
    const demo = list.match(/data-example="true"[\s\S]*?<\/li>/)?.[0] ?? ''
    assert.match(live, /Example Freight/)
    assert.equal(live.includes('>Example<'), false)
    assert.match(demo, /Example Holdings/)
    assert.match(demo, />Example</)
  } finally {
    await vite.close()
  }
})

test('aal1, non-staff, and anon cannot create a mandate; aal2 staff can', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-mandate-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_mandate_${process.pid}`
  writeFileSync(script, [weeklyStub(), ...names.map(include), assertSql].join('\n'))
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

const assertSql = `
create or replace function pg_temp.try_mandate(
  p_sector text,
  p_one text,
  p_company text,
  p_email text,
  p_narrative text,
  p_phone text,
  p_deck text,
  p_tags text[],
  p_themes text[]
) returns jsonb
language plpgsql
as $$
begin
  return public.staff_create_mandate(
    p_sector,
    'Growth equity',
    'Growth band',
    'KSA',
    'Diligence',
    p_one,
    p_company,
    'Set on request',
    'One board seat.',
    'Example Contact',
    p_email,
    p_phone,
    p_deck,
    p_narrative,
    p_tags,
    p_themes
  );
end;
$$;

do $checks$
declare
  staff_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  created jsonb;
  demo_n int;
  demo_hash text;
  live_n int;
  stored_demo boolean;
  stored_email text;
  stored_published boolean;
begin
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.mandate@example.com', 'staff');
  insert into auth.users (id, email) values
    (staff_id, 'staff.mandate@example.com'),
    (member_id, 'member.mandate@example.com');
  insert into public.members (user_id, email, seat, status)
  values (member_id, 'member.mandate@example.com', 'ksa', 'active');

  select count(*) into demo_n from public.mandates where is_demo;
  select md5(coalesce(string_agg(
    id::text || '|' || sector || '|' || one_liner || '|' || contact_email,
    E'\\n' order by id
  ), '')) into demo_hash
  from public.mandates
  where is_demo;
  if demo_n < 1 then
    raise exception 'example mandates are missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'staff_create_mandate'
      and pg_get_function_identity_arguments(p.oid) ilike '%p_published%'
  ) then
    raise exception 'signature still accepts p_published';
  end if;
  begin
    perform public.staff_create_mandate(
      true,
      'Logistics',
      'Growth equity',
      'Growth band',
      'KSA',
      'Diligence',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'Set on request',
      'One board seat.',
      'Example Contact',
      'contact@example.com',
      'Extension 100',
      null,
      'A sample note.',
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'p_published was accepted';
  exception
    when undefined_function then
      null;
  end;

  if has_function_privilege(
    'anon',
    'public.staff_create_mandate(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[])',
    'execute'
  ) then
    raise exception 'anon can execute staff_create_mandate';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.staff_create_mandate(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[])',
    'execute'
  ) then
    raise exception 'authenticated cannot execute staff_create_mandate';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'staff_create_mandate'
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=""')
  ) then
    raise exception 'staff_create_mandate is not a definer with an empty search_path';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform pg_temp.try_mandate(
      'Logistics',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'contact@example.com',
      'Example Freight is a sample brief. Terms stay in this note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'aal1 staff created a mandate';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'aal1 error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform pg_temp.try_mandate(
      'Logistics',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'contact@example.com',
      'Example Freight is a sample brief. Terms stay in this note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'member created a mandate';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'member error %', sqlerrm;
      end if;
  end;
  set role postgres;

  set role anon;
  begin
    perform public.staff_create_mandate(
      'Logistics',
      'Growth equity',
      'Growth band',
      'KSA',
      'Diligence',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'Set on request',
      'One board seat.',
      'Example Contact',
      'contact@example.com',
      'Extension 100',
      null,
      'Example Freight is a sample brief. Terms stay in this note.',
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'anon created a mandate';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform pg_temp.try_mandate(
      '',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'contact@example.com',
      'Example Freight is a sample brief. Terms stay in this note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'blank sector was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  begin
    perform pg_temp.try_mandate(
      'Logistics',
      repeat('x', 281),
      'Example Freight',
      'contact@example.com',
      'Example Freight is a sample brief. Terms stay in this note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'long one liner was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  begin
    perform pg_temp.try_mandate(
      'Logistics @ north',
      'Growth capital for a regional freight platform.',
      'Example Freight',
      'contact@example.com',
      'Example Freight is a sample brief. Terms stay in this note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'at sign in a public field was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  begin
    perform pg_temp.try_mandate(
      'Logistics',
      'Growth capital for Example Freight this year.',
      'Example Freight',
      'contact@example.com',
      'A sample note.',
      'Extension 100',
      null,
      array['Logistics']::text[],
      array['Industrial development and logistics']::text[]
    );
    raise exception 'company name in the one liner was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  set role postgres;
  select count(*) into live_n from public.mandates where is_demo = false;
  if live_n <> 0 then
    raise exception 'invalid input stored a row';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  created := pg_temp.try_mandate(
    'Logistics',
    'Growth capital for a regional freight platform.',
    'Example Freight',
    '  Contact@Example.com  ',
    'Example Freight is a sample brief. Terms stay in this note.',
    'Extension 100',
    'https://example.com/brief',
    array['Logistics']::text[],
    array['Industrial development and logistics']::text[]
  );
  if created->>'is_demo' is distinct from 'false' then
    raise exception 'response marked an example %', created;
  end if;
  if created->>'published' is distinct from 'false' then
    raise exception 'response published %', created;
  end if;
  if position('@' in created::text) <> 0 then
    raise exception 'response included an address %', created;
  end if;
  if created->>'company_name' is distinct from 'Example Freight' then
    raise exception 'response company %', created;
  end if;
  set role postgres;

  select is_demo, contact_email, published
    into stored_demo, stored_email, stored_published
  from public.mandates
  where id = (created->>'id')::uuid;
  if stored_demo is distinct from false
     or stored_email is distinct from 'contact@example.com'
     or stored_published is distinct from false then
    raise exception 'stored row % % %', stored_demo, stored_email, stored_published;
  end if;
  if (select count(*) from public.mandates where is_demo) is distinct from demo_n then
    raise exception 'example count changed';
  end if;
  if md5(coalesce((
    select string_agg(id::text || '|' || sector || '|' || one_liner || '|' || contact_email, E'\\n' order by id)
    from public.mandates
    where is_demo
  ), '')) is distinct from demo_hash then
    raise exception 'example rows changed';
  end if;
end
$checks$;
`
