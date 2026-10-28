import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261216120000_sec_c_definer_grants.sql'
const priorName = '20261213120000_rls_initplan_select_auth_uid.sql'

const anonNames = [
  'landing_platform_totals',
  'list_landing_preview_deals',
  'list_partner_categories',
  'list_trusted_partners',
  'lookup_member_invite',
  'submit_partner_interest',
]

const policies = [
  'members_select_own',
  'members_clear_password_flag',
  'profiles_select_own',
  'profiles_update_own',
  'member_invites_select_own',
  'candidates_select_own',
  'candidates_update_own',
  'candidate_events_select',
  'candidate_notes_staff',
  'intro_suggestions_select_own',
  'intro_meet_outcomes_select_own',
  're_appetite_select',
  're_appetite_insert',
  're_appetite_update',
  'majlis_events_insert_own_pending',
  'majlis_rsvps_select_own',
  'staff_users_select_own',
]

function migrationSql() {
  return readFileSync(path.join(migrationsDir, migrationName), 'utf8')
}

function stubSql() {
  const text = readFileSync(new URL('./definer-audit.test.ts', import.meta.url), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

test('sec-c migration exists and sorts after the initplan file', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.equal(names.includes(priorName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const sql = migrationSql()
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/eyJ|sk_live|service_role_key|SUPABASE_SERVICE_ROLE|BEGIN PRIVATE KEY/i.test(sql), false)
  assert.equal(sql.includes('the desk'), false)
  assert.equal(/create policy|drop policy|alter policy/i.test(sql), false)
  assert.equal(/disable row level security|no force row level security/i.test(sql), false)
  assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\b/i.test(sql), false)
  assert.match(sql, /20261213120000/)
  for (const policy of policies) {
    assert.equal(sql.includes(policy), false, policy)
  }
})

test('sec-c anon grants are the six impls, their wrappers, and private usage', () => {
  const sql = migrationSql()
  const statements = sql.replace(/--.*$/gm, '').split(';')
  const anonGrants = statements.filter((statement) => /^\s*grant\b/i.test(statement) && /\bto\s+anon\b/i.test(statement))
  assert.ok(anonGrants.length >= 7)
  for (const statement of anonGrants) {
    const compact = statement.replace(/\s+/g, ' ').trim().toLowerCase()
    assert.equal(/on\s+table\b/.test(compact), false, compact)
    const usage = compact === 'grant usage on schema private to anon'
    const execute = anonNames.some((name) => {
      const impl = `grant execute on function private.${name}_impl(`
      const wrap = `grant execute on function public.${name}(`
      return compact.startsWith(impl) || compact.startsWith(wrap)
    })
    assert.equal(usage || execute, true, compact)
  }
})

test('sec-c private impl execute is exactly anon and authenticated', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const sql = migrationSql().replace(/--.*$/gm, '')
  for (const name of anonNames) {
    assert.match(sql, new RegExp(`revoke execute on function private\\.${name}_impl\\([^)]*\\) from public`, 'i'))
    const grant = sql.match(new RegExp(`grant execute on function private\\.${name}_impl\\([^)]*\\) to ([^;]+)`, 'i'))
    assert.ok(grant, name)
    const roles = grant[1].split(',').map((role) => role.trim().toLowerCase()).sort()
    assert.deepEqual(roles, ['anon', 'authenticated'], name)
  }
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  assert.equal(/\bprivate\b/.test(config), false)
  const schemaLines = config.split('\n').filter((line) => /^\s*schemas\s*=/.test(line))
  assert.deepEqual(schemaLines, [])
})

test('sec-c definers in this file set an empty search_path and the interest cap stays generic', () => {
  const sql = migrationSql()
  const chunks = sql.split(/create or replace function /i).slice(1)
  assert.ok(chunks.length >= 12)
  for (const chunk of chunks) {
    const header = chunk.slice(0, chunk.search(/as\s+\$fn\$/i))
    if (!/security definer/i.test(header)) continue
    assert.match(header, /set search_path = ''/)
    assert.equal(/search_path\s*=\s*public/i.test(header), false)
  }
  const impl = sql.slice(
    sql.indexOf('function private.submit_partner_interest_impl'),
    sql.indexOf('revoke all on function private.submit_partner_interest_impl'),
  )
  assert.match(impl, /\) >= 20 then/)
  assert.match(impl, /i\.category_slug = v_slug/)
  assert.match(impl, /\) >= 10 then/)
  assert.match(impl, /raise exception 'busy_today' using errcode = 'P0001'/)
  const returns = impl.match(/return jsonb_build_object\('ok', true\)/g) || []
  assert.equal(returns.length, 2)
  assert.equal(impl.includes("'id'"), false)
  assert.equal(impl.includes('already_sent'), false)
  const lookup = sql.slice(
    sql.indexOf('function private.lookup_member_invite_impl'),
    sql.indexOf('revoke all on function private.lookup_member_invite_impl'),
  )
  assert.match(lookup, /'inviter_label'/)
  assert.equal(lookup.includes('email'), false)
  assert.equal(lookup.includes('recipient_name'), false)
  assert.match(readFileSync(path.join(root, 'src/pages/PartnersPage.tsx'), 'utf8'), /submit_partner_interest/)
})

test('sec-c keeps anon off tables, keeps the 17 policies, and the form still submits', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const earlier = names.filter((name) => name < migrationName)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sec-c-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sec_c_${process.pid}`
  writeFileSync(
    script,
    [stubSql(), ...earlier.map(include), snapshotSql, include(migrationName), assertSql, include(migrationName), assertSql].join('\n'),
  )
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

const snapshotSql = `
create temp table sec_c_anon_tables as
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon';

create temp table sec_c_policies as
select policyname, tablename, cmd, roles::text as roles,
       coalesce(qual, '') as qual,
       coalesce(with_check, '') as with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'members_select_own',
    'members_clear_password_flag',
    'profiles_select_own',
    'profiles_update_own',
    'member_invites_select_own',
    'candidates_select_own',
    'candidates_update_own',
    'candidate_events_select',
    'candidate_notes_staff',
    'intro_suggestions_select_own',
    'intro_meet_outcomes_select_own',
    're_appetite_select',
    're_appetite_insert',
    're_appetite_update',
    'majlis_events_insert_own_pending',
    'majlis_rsvps_select_own',
    'staff_users_select_own'
  );

create temp table sec_c_rls as
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relkind = 'r';
`

const assertSql = `
do $checks$
declare
  anon_found text[];
  bad text;
  payload jsonb;
  saved jsonb;
  member_id uuid := '11111111-1111-4111-8111-111111111111';
  staff_id uuid := '33333333-3333-4333-8333-333333333333';
begin
  perform set_config('request.jwt.claims', '{}', false);

  if (select count(*) from sec_c_policies) <> 17 then
    raise exception 'initplan policy snapshot is %', (select count(*) from sec_c_policies);
  end if;
  if exists (
    select 1
    from sec_c_policies before
    left join pg_policies after
      on after.schemaname = 'public'
     and after.policyname = before.policyname
    where after.policyname is null
       or after.tablename is distinct from before.tablename
       or after.cmd is distinct from before.cmd
       or after.roles::text is distinct from before.roles
       or coalesce(after.qual, '') is distinct from before.qual
       or coalesce(after.with_check, '') is distinct from before.with_check
  ) then
    raise exception 'an initplan policy changed';
  end if;

  if exists (
    select 1
    from sec_c_anon_tables before
    full join (
      select table_schema, table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon'
    ) after
      using (table_schema, table_name, privilege_type)
    where before.table_name is null or after.table_name is null
  ) then
    raise exception 'anon table grants changed';
  end if;

  if exists (
    select 1
    from sec_c_rls before
    join pg_class c on c.relname = before.relname
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = before.nspname
    where c.relrowsecurity is distinct from before.relrowsecurity
       or c.relforcerowsecurity is distinct from before.relforcerowsecurity
  ) then
    raise exception 'rls enable or force changed';
  end if;

  select coalesce(array_agg(sig order by sig), '{}')
    into anon_found
  from (
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'execute')
  ) listed;
  if anon_found is distinct from array[
    'private.landing_platform_totals_impl()',
    'private.list_landing_preview_deals_impl()',
    'private.list_partner_categories_impl()',
    'private.list_trusted_partners_impl()',
    'private.lookup_member_invite_impl(p_token text)',
    'private.submit_partner_interest_impl(p_name text, p_firm text, p_category text, p_note text)',
    'public.landing_platform_totals()',
    'public.list_landing_preview_deals()',
    'public.list_partner_categories()',
    'public.list_trusted_partners()',
    'public.lookup_member_invite(p_token text)',
    'public.submit_partner_interest(p_name text, p_firm text, p_category text, p_note text)'
  ]::text[] then
    raise exception 'anon allowlist changed: %', anon_found;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ' order by 1)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg = 'search_path=""'
      )
      or has_function_privilege('anon', p.oid, 'execute')
    );
  if bad is not null then
    raise exception 'public definer search_path or anon execute: %', bad;
  end if;

  select string_agg(p.proname || '=' || listed.roles, ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join lateral (
    select coalesce(string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text), '') as roles
    from aclexplode(p.proacl) a
    where a.privilege_type = 'EXECUTE'
      and a.grantee <> 0
      and a.grantee <> p.proowner
  ) listed on true
  where n.nspname = 'private'
    and p.proname in (
      'landing_platform_totals_impl',
      'list_landing_preview_deals_impl',
      'list_partner_categories_impl',
      'list_trusted_partners_impl',
      'lookup_member_invite_impl',
      'submit_partner_interest_impl'
    )
    and (
      listed.roles is distinct from 'anon,authenticated'
      or has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('service_role', p.oid, 'execute')
    );
  if bad is not null then
    raise exception 'impl execute grants are not anon and authenticated only: %', bad;
  end if;
  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'landing_platform_totals_impl',
        'list_landing_preview_deals_impl',
        'list_partner_categories_impl',
        'list_trusted_partners_impl',
        'lookup_member_invite_impl',
        'submit_partner_interest_impl'
      )
  ) <> 6 then
    raise exception 'expected six private impls';
  end if;

  select string_agg(p.proname, ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'staff\\_%'
    and position('if not private.is_staff()' in p.prosrc) = 0;
  if bad is not null then
    raise exception 'staff function missing the gate: %', bad;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not exists (
        select 1 from unnest(coalesce(c.reloptions, '{}'::text[])) opt
        where opt = 'security_invoker=true'
      )
  ) then
    raise exception 'a public view is missing security_invoker';
  end if;

  delete from public.partner_interest;

  insert into auth.users (id, email) values
    (member_id, 'member.sec-c@example.com'),
    (staff_id, 'staff.sec-c@example.com')
  on conflict (id) do nothing;
  insert into public.members (user_id, email, seat, status)
  values (member_id, 'member.sec-c@example.com', 'ksa', 'active')
  on conflict (user_id) do nothing;
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.sec-c@example.com', 'staff')
  on conflict (user_id) do nothing;

  perform set_config('request.jwt.claims', '{}', false);
  set role anon;
  payload := public.list_partner_categories();
  if jsonb_array_length(payload) <> 15 or payload::text ilike '%@%' then
    raise exception 'categories: %', payload;
  end if;
  payload := public.landing_platform_totals();
  if payload ? 'investment_usd' is not true or payload::text ilike '%@%' then
    raise exception 'totals: %', payload;
  end if;
  payload := public.list_landing_preview_deals();
  if payload::text ilike '%@%' or payload::text ilike '%user_id%' then
    raise exception 'preview: %', payload;
  end if;
  payload := public.list_trusted_partners();
  if payload::text ilike '%sponsor_user_id%' or payload::text ilike '%@%' then
    raise exception 'partners: %', payload;
  end if;
  payload := public.lookup_member_invite('short');
  if payload is distinct from jsonb_build_object('valid', false, 'state', 'invalid') then
    raise exception 'lookup: %', payload;
  end if;
  payload := public.submit_partner_interest('Example Person', 'Example Firm', 'investment-banking', 'A lane note');
  saved := public.submit_partner_interest('Example Person', 'Example Firm', 'investment-banking', 'Again');
  if payload is distinct from jsonb_build_object('ok', true)
     or saved is distinct from payload
     or payload ? 'id'
     or payload ? 'count' then
    raise exception 'interest payload % vs %', payload, saved;
  end if;
  reset role;
  if (select count(*) from public.partner_interest where lower(firm) = lower('Example Firm')) <> 1 then
    raise exception 'same firm stored another row';
  end if;

  for i in 1..8 loop
    insert into public.partner_interest (contact_name, firm, category_slug)
    values ('Example Person', 'Example Cap Firm ' || i::text, 'investment-banking');
  end loop;
  set role anon;
  payload := public.submit_partner_interest('Example Person', 'Example Cap Tenth', 'investment-banking', 'A note');
  if payload is distinct from jsonb_build_object('ok', true) then
    raise exception 'tenth in a category failed: %', payload;
  end if;
  begin
    perform public.submit_partner_interest('Example Person', 'Example Cap Eleventh', 'investment-banking', 'A note');
    raise exception 'category cap did not hold';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'busy_today' then
        raise exception 'category cap error %', sqlerrm;
      end if;
  end;
  payload := public.submit_partner_interest('Example Person', 'Example Other Lane', 'asset-management', 'A note');
  if payload is distinct from jsonb_build_object('ok', true) then
    raise exception 'other category failed under the global cap: %', payload;
  end if;
  reset role;

  insert into public.partner_interest (contact_name, firm, category_slug)
  select 'Example Person', 'Example Global ' || g::text, 'private-equity'
  from generate_series(1, 9) g;
  set role anon;
  begin
    perform public.submit_partner_interest('Example Person', 'Example Global Last', 'venture-capital', 'A note');
    raise exception 'global cap did not hold';
  exception
    when raise_exception then
      if sqlerrm is distinct from 'busy_today' then
        raise exception 'global cap error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_list_mandates();
    raise exception 'anon called a staff rpc';
  exception
    when insufficient_privilege then
      null;
  end;
  reset role;
  delete from public.partner_interest;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  payload := public.submit_partner_interest('Example Member', 'Example Member Firm', 'family-offices', 'A note');
  if payload is distinct from jsonb_build_object('ok', true) then
    raise exception 'signed-in interest failed: %', payload;
  end if;
  perform public.list_trusted_partners();
  begin
    perform public.staff_list_partner_interest();
    raise exception 'member listed interest';
  exception
    when insufficient_privilege then
      null;
  end;
  reset role;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'execute') is not true
      and p.proname in (
        'delete_own_ai_tool_job',
        'submit_partner_interest',
        'staff_list_mandates',
        'list_member_rooms',
        'lookup_member_invite'
      )
  ) then
    raise exception 'authenticated lost a surface rpc';
  end if;

  select string_agg(p.proname, ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array[
      'delete_own_ai_tool_job','delete_own_due_diligence_report','digest_issue_sendable',
      'dismiss_my_application_answer','dismiss_sponsor_welcome','download_my_data',
      'express_re_club_interest','get_my_application_answers','get_my_re_appetite',
      'list_accepted_intro_contacts','list_directory','list_member_home_activity',
      'list_member_mandates','list_member_rooms','list_my_deal_rooms',
      'list_my_intro_suggestions','list_my_intros','list_own_ai_tool_jobs',
      'list_re_board_roles','list_re_opportunities','list_re_partners',
      'list_sponsor_showcase','list_staff_directory','mark_sponsor_handed_over',
      'marketing_funnel_counts','my_intro_quota','my_re_club_interest','my_weekly_digest',
      'own_admin_share_state','own_digest_preference','own_directory_visibility',
      'own_sponsor_welcome','read_ai_tool_frame','read_dd_retention_copy',
      'record_ai_tool_consent','record_intro_meet','request_mandate_intro',
      'request_member_intro','request_re_board_role_intro','request_re_opportunity_intro',
      'request_re_partner_intro','request_sponsor_intro','respond_member_intro',
      'save_my_re_appetite','search_deal_room_directory','set_ai_tool_flag',
      'set_ai_tool_result_admin_share','set_ai_tool_retention','set_dd_retention_copy',
      'set_digest_email_opt_in','set_digest_send_enabled','set_directory_hidden',
      'set_due_diligence_deck_admin_share','set_due_diligence_report_admin_share',
      'set_member_tiers','set_show_card_to_sponsors','sponsor_desk','sponsor_intro_counts',
      'staff_assign_sponsor_category','staff_assign_sponsor_package','staff_create_digest_draft',
      'staff_create_mandate','staff_decide_digest_issue','staff_decide_mandate_intro',
      'staff_decide_re_board_role_intro','staff_decide_re_opportunity_intro',
      'staff_decide_re_partner_intro','staff_decide_sponsor_intro','staff_digest_issue',
      'staff_get_intro_monthly_limit','staff_get_own_display_name','staff_intro_funnel',
      'staff_link_re_club_room','staff_list_access_log','staff_list_all_intros',
      'staff_list_desk_intros','staff_list_intro_deals','staff_list_mandate_intros',
      'staff_list_mandate_matches','staff_list_mandates','staff_list_partner_interest','staff_list_profiles',
      'staff_list_re_appetites','staff_list_re_board_role_intros','staff_list_re_club_interest',
      'staff_list_re_opportunity_intros','staff_list_re_partner_intros','staff_list_sponsor_catalog',
      'staff_list_sponsor_intros','staff_list_sponsor_options','staff_list_trusted_partners',
      'staff_mark_desk_intro_sent','staff_mark_partner_interest_seen','staff_open_re_club_room',
      'staff_private_work_counts','staff_read_desk_intro','staff_read_member',
      'staff_read_membership_request','staff_read_shared_item','staff_reorder_trusted_partners',
      'staff_save_re_opportunity','staff_save_re_partner','staff_save_sponsor_package',
      'staff_save_trusted_partner','staff_set_avatar_style','staff_set_intro_deal',
      'staff_set_intro_monthly_limit','staff_set_majlis_presented_by','staff_set_member_capacity',
      'staff_set_own_display_name','staff_set_re_opportunity_readiness','staff_set_trusted_partner_logo',
      'staff_set_trusted_partner_published','staff_sponsor_handovers'
    ])
    and has_function_privilege('authenticated', p.oid, 'execute') is not true;
  if bad is not null then
    raise exception 'authenticated execute missing: %', bad;
  end if;
end
$checks$;
`
