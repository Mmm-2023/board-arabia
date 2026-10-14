import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261218120000_digest_sections.sql'
const earlier = '20261214120000_digest_review_tiers.sql'

test('section 4 auto-fill hides private members and news links are checked', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.includes(earlier))
  assert.ok(names.indexOf(migrationName) > names.indexOf(earlier))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-digest-sections-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_digest_sections_${process.pid}`
  const stub = readFileSync(path.join(root, 'scripts/definer-audit.test.ts'), 'utf8')
  const stubStart = stub.indexOf('const stubSql = `') + 'const stubSql = `'.length
  const stubEnd = stub.indexOf('`\n\nconst assertSql')
  assert.ok(stubStart > 0 && stubEnd > stubStart)
  writeFileSync(script, [stub.slice(stubStart, stubEnd), ...names.map(include), assertSql].join('\n'))

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
do $checks$
declare
  shown_id uuid := gen_random_uuid();
  opted_id uuid := gen_random_uuid();
  hidden_id uuid := gen_random_uuid();
  demo_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  partner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  built jsonb;
  issue jsonb;
  digest jsonb;
  partner_digest jsonb;
  names jsonb;
begin
  insert into auth.users (id, email) values
    (shown_id, 'shown@example.com'),
    (opted_id, 'optout@example.com'),
    (hidden_id, 'hidden@example.com'),
    (demo_id, 'demo@example.com'),
    (member_id, 'member@example.com'),
    (partner_id, 'partner@example.com'),
    (staff_id, 'admin@example.com');

  insert into public.members (user_id, email, seat, status, directory_hidden, is_demo, show_card_to_sponsors, created_at) values
    (shown_id, 'shown@example.com', 'ksa', 'active', false, false, true, now()),
    (opted_id, 'optout@example.com', 'ksa', 'active', false, false, false, now()),
    (hidden_id, 'hidden@example.com', 'ksa', 'active', true, false, false, now()),
    (demo_id, 'demo@example.com', 'ksa', 'active', false, true, false, now()),
    (member_id, 'member@example.com', 'ksa', 'active', false, false, false, now() - interval '40 days'),
    (partner_id, 'partner@example.com', 'sponsor', 'active', false, false, false, now() - interval '40 days');

  update public.members set tiers = array['founding']::text[] where user_id in (shown_id, opted_id, member_id);
  update public.members set tiers = array['sponsor']::text[] where user_id = partner_id;

  insert into public.profiles (user_id, full_name, headline, company) values
    (shown_id, 'Example Shown', 'Director', 'Example Company A'),
    (opted_id, 'Example Opt Out', 'Director', 'Example Company B'),
    (hidden_id, 'Example Hidden', 'Director', 'Example Company C'),
    (demo_id, 'Example Demo', 'Director', 'Example Company D'),
    (member_id, 'Example Member', 'Director', 'Example Company E'),
    (partner_id, 'Example Partner', 'Director', 'Example Company F');

  insert into public.mandates (
    id, is_demo, published, sector, deal_type, ticket_band, geography, stage, one_liner,
    company_name, exact_amount, terms, contact_name, contact_email, contact_phone, narrative
  ) values (
    gen_random_uuid(), false, true,
    'Energy', 'Growth equity', 'Mid band', 'KSA', 'Diligence',
    'A clear example mandate for members.',
    'Example Counterparty', 'Terms on request', 'One board seat.',
    'Example Contact', 'contact.note@example.com', 'Room note',
    'The private brief stays out of the weekly digest.'
  );

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'admin@example.com', 'staff');

  built := private.digest_build_payload();
  if built::text ilike '%example hidden%'
     or built::text ilike '%example demo%'
     or built::text ilike '%example counterparty%'
     or built::text ilike '%contact.note@example.com%'
     or built::text ilike '%room note%' then
    raise exception 'auto-fill leaked a private row %', built;
  end if;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(built->'new_members') item;
  if names <> '["Example Opt Out", "Example Shown"]'::jsonb then
    raise exception 'auto-fill members %', names;
  end if;
  if built->'new_mandates'->0->>'one_liner' is distinct from 'A clear example mandate for members.'
     or built->'new_mandates'->0 ? 'company_name' then
    raise exception 'auto-fill mandate %', built->'new_mandates';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.staff_create_digest_draft();
  begin
    perform public.staff_save_digest_draft(
      jsonb_build_object(
        'boardroom', jsonb_build_array(
          jsonb_build_object(
            'headline', 'Example headline',
            'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
            'sources', '[]'::jsonb
          ),
          jsonb_build_object(
            'headline', 'Second example headline',
            'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
            'sources', jsonb_build_array(jsonb_build_object('label', 'Example review', 'url', 'https://example.org/review'))
          )
        )
      ),
      array['founding', 'sponsor']
    );
    raise exception 'news without a source was stored';
  exception
    when data_exception then
      if sqlerrm not like '%digest_news_invalid%' then
        raise exception 'news error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_save_digest_draft(
      jsonb_build_object(
        'deals', jsonb_build_array(
          jsonb_build_object(
            'headline', 'Example headline',
            'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
            'sources', jsonb_build_array(jsonb_build_object('label', 'Bad', 'url', 'javascript:alert(1)'))
          ),
          jsonb_build_object(
            'headline', 'Second example headline',
            'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
            'sources', jsonb_build_array(jsonb_build_object('label', 'Example review', 'url', 'https://example.org/review'))
          )
        )
      ),
      array['founding', 'sponsor']
    );
    raise exception 'bad link was stored';
  exception
    when data_exception then
      if sqlerrm not like '%digest_link_invalid%' then
        raise exception 'link error %', sqlerrm;
      end if;
  end;

  issue := public.staff_save_digest_draft(
    jsonb_build_object(
      'issue_number', '42',
      'issue_date', '13 Oct 2026',
      'opening', 'A short briefing for members.',
      'hidden_sections', jsonb_build_array('partner'),
      'boardroom', jsonb_build_array(
        jsonb_build_object(
          'headline', 'Boards ask for a clearer capital plan',
          'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
          'board_lens', 'Ask whether the plan still matches.',
          'sources', jsonb_build_array(jsonb_build_object('label', 'Example review', 'url', 'https://example.org/review')),
          'people', jsonb_build_array(jsonb_build_object(
            'name', 'Example Director',
            'linkedin_url', 'https://www.linkedin.com/in/example-director'
          ))
        ),
        jsonb_build_object(
          'headline', 'Regional markets stay selective',
          'sentences', jsonb_build_array('First example sentence.', 'Second example sentence.'),
          'sources', jsonb_build_array(jsonb_build_object('label', 'Example review', 'url', 'https://example.org/markets'))
        )
      ),
      'new_members', built->'new_members',
      'key_members', jsonb_build_array(
        jsonb_build_object('id', hidden_id, 'full_name', 'Example Hidden', 'headline', 'Director', 'company', 'Hidden Co'),
        jsonb_build_object('id', demo_id, 'full_name', 'Example Demo', 'headline', 'Director', 'company', 'Demo Co'),
        jsonb_build_object('id', shown_id, 'full_name', 'Example Shown', 'headline', 'Director', 'company', 'Example Company A', 'key', true)
      ),
      'new_mandates', built->'new_mandates',
      'partner_insight', jsonb_build_object(
        'sentences', jsonb_build_array('A partner note for members.', 'The second sentence stays short.'),
        'source', jsonb_build_object('label', 'Example partner note', 'url', 'https://example.org/partner')
      ),
      'notes', '[]'::jsonb,
      'introductions', '[]'::jsonb
    ),
    array['founding', 'sponsor']
  );
  if issue->'issue'->'payload'->>'mail_ready' is distinct from 'false' then
    raise exception 'mail ready was stored true';
  end if;
  if issue->'issue'->'payload'->'boardroom'->0->>'board_lens' is distinct from 'Ask whether the plan still matches.' then
    raise exception 'board lens was dropped %', issue->'issue'->'payload'->'boardroom';
  end if;
  if issue->'issue'->'payload'->'hidden_sections' <> '["partner"]'::jsonb then
    raise exception 'hidden section was not stored %', issue->'issue'->'payload'->'hidden_sections';
  end if;
  perform public.staff_decide_digest_issue('approve');
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  digest := public.my_weekly_digest();
  set role postgres;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(digest->'new_members') item;
  if names <> '["Example Opt Out", "Example Shown"]'::jsonb then
    raise exception 'member section 4 %', names;
  end if;
  if digest::text ilike '%example hidden%'
     or digest::text ilike '%example demo%'
     or digest::text ilike '%example counterparty%'
     or digest->>'mail_ready' is distinct from 'false'
     or digest->'partner_insight' is distinct from 'null'::jsonb
     or digest->'boardroom'->0->>'headline' is distinct from 'Boards ask for a clearer capital plan' then
    raise exception 'member digest leaked or dropped a section %', digest;
  end if;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(digest->'key_members') item;
  if names <> '["Example Shown"]'::jsonb then
    raise exception 'key members were not filtered %', names;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', partner_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  partner_digest := public.my_weekly_digest();
  set role postgres;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(partner_digest->'new_members') item;
  if names <> '["Example Shown"]'::jsonb
     or jsonb_array_length(partner_digest->'upcoming_events') <> 0
     or partner_digest::text ilike '%example opt out%'
     or partner_digest::text ilike '%example hidden%'
     or partner_digest::text ilike '%example demo%' then
    raise exception 'partner saw a private member %', partner_digest;
  end if;
end
$checks$;
`
