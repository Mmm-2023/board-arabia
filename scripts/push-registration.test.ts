import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { endAuthSession } from '../src/lib/endSession.ts'
import {
  normalizePushTarget,
  pushEnabledFromPreference,
  pushPlatform,
  pushShotAllowed,
  routeFromPushAction,
  routeFromPushPayload,
  shouldAskPushPermission,
  showPushSetting,
} from '../src/shell/pushRegistration.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261228120000_push_registration.sql'
const deleteName = '20261225120000_member_self_delete.sql'
const prefsName = '20261224120000_board_seats_notifications.sql'
const OWNER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'a'.repeat(16)
const OTHER_TOKEN = 'b'.repeat(16)
const HASH = 'c'.repeat(64)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function stubSql() {
  const text = readFileSync(path.join(root, 'scripts/definer-audit.test.ts'), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

function walk(dir: string, found: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const abs = path.join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs, found)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) found.push(path.relative(root, abs))
  }
}

test('the push migration is slotted after account delete and is not assumed to be newest', () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const prefixed = files.filter((name) => name.startsWith('20261228120000'))
  assert.deepEqual(prefixed, [migrationName])
  assert.equal(files.includes(migrationName), true)
  assert.equal(files.includes(deleteName), true)
  assert.equal(files.includes(prefsName), true)
  assert.ok(files.indexOf(migrationName) > files.indexOf(deleteName))
  assert.ok(files.indexOf(migrationName) > files.indexOf(prefsName))
  const covered = files.filter((name) => name <= migrationName)
  assert.equal(covered.includes(migrationName), true)
  assert.equal(covered.includes(deleteName), true)

  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/\b(price|fee|usd|sar)\b|pg_cron|net\.http|send_email/i.test(sql), false)
  assert.equal(/\bto anon\b/i.test(sql), false)
  assert.equal(/\bto public\b/i.test(sql), false)
  assert.equal(/AIza|BEGIN PRIVATE|google-services\.json|firebase|apns/i.test(sql), false)
  assert.match(sql, /alter table public\.member_push_tokens force row level security/)
  assert.match(sql, /revoke all on table public\.member_push_tokens from public/)
  assert.match(sql, /grant select on table public\.member_push_tokens to authenticated/)
  assert.ok(sql.indexOf('revoke all on table public.member_push_tokens from public') < sql.indexOf('grant select on table public.member_push_tokens to authenticated'))
  assert.match(sql, /push_enabled boolean not null default false/)
  assert.match(sql, /delete from public\.member_push_tokens/)
  assert.equal(/create policy[\s\S]{0,240}is_staff\(\)/i.test(sql), false)
  for (const signature of [
    'public.register_push_token(text, text)',
    'public.revoke_my_push_tokens()',
    'public.set_push_notifications(boolean)',
    'public.own_push_preference()',
    'public.confirm_account_delete(uuid, text)',
    'private.member_notification_prefs_guard()',
  ]) {
    const revokeAt = sql.indexOf(`revoke all on function ${signature} from public`)
    const grantAt = sql.indexOf(`grant execute on function ${signature}`)
    assert.ok(revokeAt >= 0, signature)
    if (signature.startsWith('private.')) {
      assert.equal(grantAt, -1, signature)
    } else if (signature.includes('confirm_account_delete')) {
      assert.ok(grantAt > revokeAt, signature)
      assert.match(sql, /grant execute on function public\.confirm_account_delete\(uuid, text\) to service_role/)
    } else {
      assert.ok(grantAt > revokeAt, signature)
    }
  }
  const headers = sql.split(/create or replace function /i).slice(1)
  assert.ok(headers.length >= 6)
  for (const header of headers) {
    const signature = header.slice(0, header.search(/\bas\b/i))
    if (/security\s+definer/i.test(signature)) assert.match(signature, /set search_path = ''/)
  }
})

test('permission is asked only after the native toggle is turned on', () => {
  assert.equal(showPushSetting(false), false)
  assert.equal(showPushSetting(true), true)
  assert.equal(pushShotAllowed(false), false)
  assert.equal(pushShotAllowed(true), true)
  assert.equal(shouldAskPushPermission(false, true), false)
  assert.equal(shouldAskPushPermission(true, false), false)
  assert.equal(shouldAskPushPermission(true, true), true)
  assert.equal(pushPlatform('iOS'), 'ios')
  assert.equal(pushPlatform('android'), 'android')
  assert.equal(pushPlatform('web'), null)
  assert.equal(pushEnabledFromPreference(null), false)
  assert.equal(pushEnabledFromPreference({ push_enabled: false }), false)
  assert.equal(pushEnabledFromPreference({ push_enabled: true }), true)

  const files: string[] = []
  walk(path.join(root, 'src'), files)
  const asked = files.filter((file) => read(file).includes('requestPermissions'))
  assert.deepEqual(asked, ['src/shell/nativePush.ts'])
  assert.equal(read('src/shell/PushBridge.tsx').includes('requestPermissions'), false)
  assert.equal(read('src/shell/PushBridge.tsx').includes('askPushPermission'), false)
  assert.match(read('src/pages/dashboard/PrivacyPanelPage.tsx'), /askPushPermission/)
  assert.match(read('src/lib/endSession.ts'), /revoke_my_push_tokens/)

  const entitlements = read('ios/App/App/App.entitlements')
  assert.match(entitlements, /<key>aps-environment<\/key>\s*<string>development<\/string>/)
  assert.equal(/[A-Z0-9]{10}/.test(entitlements.replace(/applinks:boardarabia\.com/g, '').replace(/applinks:www\.boardarabia\.com/g, '')), false)
  assert.match(read('ios/App/App/Info.plist'), /remote-notification/)
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android\.permission\.POST_NOTIFICATIONS/)
  assert.match(read('android/.gitignore'), /^google-services\.json$/m)
  assert.equal(read('README.md').includes('ANDROID_GOOGLE_SERVICES_JSON'), true)
  assert.equal(read('README.md').includes('Nothing is sent'), true)
  const workflow = read('.github/workflows/app-builds.yml')
  assert.match(workflow, /native\/push-shot\/settings/)
  assert.match(workflow, /ios-push-settings\.png/)
  assert.match(workflow, /android-push-settings\.png/)
  assert.equal(workflow.includes('secrets.'), false)
  assert.match(read('src/App.tsx'), /path="\/apply" element=\{<ApplyPage/)
  assert.match(read('src/App.tsx'), /path="\/native\/push-shot\/settings"/)
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@capacitor/push-notifications'], '8.0.2')
  for (const rel of [
    'src/shell/pushRegistration.ts',
    'src/shell/nativePush.ts',
    'src/shell/PushBridge.tsx',
    'src/shell/PushShot.tsx',
    'src/components/privacy/PushNotificationSetting.tsx',
    'src/pages/dashboard/PrivacyPanelPage.tsx',
  ]) {
    const text = read(rel)
    assert.equal(text.includes('\u2014'), false, rel)
    assert.equal(text.includes('\u2013'), false, rel)
    assert.equal(/\bthe desk\b/i.test(text), false, rel)
    assert.equal(/\bsponsor\b/i.test(text), false, rel)
    assert.equal(/AIza|BEGIN PRIVATE KEY/.test(text), false, rel)
  }
})

test('a tapped notification is classified by the incoming link helper', () => {
  const home = routeFromPushPayload({ url: 'https://boardarabia.com/dashboard/privacy' })
  assert.equal(home.kind, 'in-app')
  if (home.kind === 'in-app') assert.equal(home.path, '/dashboard/privacy')
  const bare = routeFromPushPayload({ link: '/dashboard/digest' })
  assert.equal(bare.kind, 'in-app')
  if (bare.kind === 'in-app') assert.equal(bare.path, '/dashboard/digest')
  assert.equal(normalizePushTarget('/dashboard/digest'), 'https://boardarabia.com/dashboard/digest')
  const outside = routeFromPushAction({
    notification: { link: 'https://example.com/out', data: {} },
  })
  assert.equal(outside.kind, 'external')
  if (outside.kind === 'external') assert.match(outside.href, /^https:\/\/example\.com\/out/)
  assert.equal(routeFromPushPayload({ url: 'javascript:alert(1)' }).kind, 'ignore')
  assert.equal(routeFromPushPayload({}).kind, 'ignore')
  assert.equal(routeFromPushAction(null).kind, 'ignore')
  const custom = routeFromPushAction({
    notification: { data: { url: 'com.boardarabia.app://dashboard/privacy' } },
  })
  assert.equal(custom.kind, 'in-app')
  if (custom.kind === 'in-app') assert.equal(custom.path, '/dashboard/privacy')
})

test('sign-out revokes push registration before the session ends', async () => {
  const order: string[] = []
  await endAuthSession(
    {
      rpc: async (name) => {
        assert.equal(name, 'revoke_my_push_tokens')
        order.push('revoke')
      },
      auth: {
        async signOut() {
          order.push('sign-out')
          return { error: null }
        },
      },
    },
    [],
  )
  assert.deepEqual(order, ['revoke', 'sign-out'])

  const failed: string[] = []
  await endAuthSession(
    {
      rpc: async () => {
        throw new Error('offline')
      },
      auth: {
        async signOut() {
          failed.push('sign-out')
          return { error: null }
        },
      },
    },
    [],
  )
  assert.deepEqual(failed, ['sign-out'])
})

test('the web privacy page hides push and the native control defaults off', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const viewMod = await vite.ssrLoadModule('/src/components/privacy/PrivacyPanelView.tsx')
    const settingMod = await vite.ssrLoadModule('/src/components/privacy/PushNotificationSetting.tsx')
    const props = {
      hidden: false,
      showSponsors: false,
      twoStepOn: false,
      analyticsOn: false,
      privacyContact: null,
      downloadState: 'idle',
      onHidden: () => undefined,
      onShowSponsors: () => undefined,
      onDownload: () => undefined,
    }
    const hidden = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(viewMod.PrivacyPanelView, props)),
    )
    const shown = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(viewMod.PrivacyPanelView, { ...props, pushAvailable: true, pushEnabled: false }),
      ),
    )
    const on = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(viewMod.PrivacyPanelView, { ...props, pushAvailable: true, pushEnabled: true }),
      ),
    )
    assert.equal(hidden.includes('Push notifications'), false)
    assert.equal(hidden.includes('data-push-notifications'), false)
    assert.match(shown, /data-push-notifications="off"/)
    assert.match(shown, /Notifications/)
    assert.match(shown, /Off\. This device is not registered for notifications\./)
    assert.match(shown, /Off unless you turn it on\. Turning this on asks this device for permission\. Nothing is sent now\./)
    assert.match(on, /data-push-notifications="on"/)
    assert.match(on, /Nothing is sent from here\./)
    for (const html of [hidden, shown, on]) {
      assert.equal(html.includes('\u2014'), false)
      assert.equal(/\bthe desk\b/i.test(html), false)
    }
    const setting = renderToStaticMarkup(
      createElement(settingMod.PushNotificationSetting, { enabled: false, onEnabled: () => undefined }),
    )
    assert.match(setting, /aria-label="Push notifications"/)
    assert.match(setting, />Off</)
    assert.match(setting, />On</)
  } finally {
    await vite.close()
  }
})

test('RLS, register, revoke, and account delete keep push rows with the owner', { timeout: 300_000 }, () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql') && name <= migrationName).sort()
  assert.equal(files.includes(migrationName), true)
  assert.equal(files.includes(deleteName), true)
  assert.ok(files.indexOf(migrationName) > files.indexOf(deleteName))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-app4-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_app4_${process.pid}`
  writeFileSync(script, [stubSql(), ...files.map(include), assertSql].join('\n'))
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
    try {
      execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    } catch {
      // The database may already be gone.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

const assertSql = `
create or replace function pg_temp.fail(msg text) returns void
language plpgsql as $$
begin
  raise exception '%', msg;
end;
$$;

create or replace function pg_temp.assume(p_sub uuid, p_aal text, p_role text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', p_role)::text,
    false
  );
  execute format('set role %I', p_role);
end;
$$;

do $checks$
declare
  v_count int;
  v_pref jsonb;
  v_revoked timestamptz;
  v_seen timestamptz;
  v_old timestamptz;
  v_result jsonb;
  v_issued text;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'member_push_tokens'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    perform pg_temp.fail('push tokens are not force RLS');
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_push_tokens'
      and (coalesce(qual, '') ilike '%is_staff%' or coalesce(with_check, '') ilike '%is_staff%')
  ) then
    perform pg_temp.fail('staff policy on push tokens');
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_push_tokens'
  ) <> 1 then
    perform pg_temp.fail('push policy count');
  end if;

  if has_table_privilege('anon', 'public.member_push_tokens', 'select')
     or has_table_privilege('anon', 'public.member_push_tokens', 'insert')
     or has_table_privilege('authenticated', 'public.member_push_tokens', 'insert')
     or has_table_privilege('authenticated', 'public.member_push_tokens', 'update')
     or has_table_privilege('authenticated', 'public.member_push_tokens', 'delete')
     or has_table_privilege('service_role', 'public.member_push_tokens', 'select')
  then
    perform pg_temp.fail('push table grant');
  end if;

  if not has_table_privilege('authenticated', 'public.member_push_tokens', 'select') then
    perform pg_temp.fail('owner cannot select');
  end if;

  if has_function_privilege('anon', 'public.register_push_token(text, text)', 'execute')
     or has_function_privilege('anon', 'public.revoke_my_push_tokens()', 'execute')
     or has_function_privilege('anon', 'public.set_push_notifications(boolean)', 'execute')
     or has_function_privilege('public', 'public.register_push_token(text, text)', 'execute')
  then
    perform pg_temp.fail('anon can register');
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'register_push_token'
      and p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
          and cfg !~ 'public'
      )
  ) then
    perform pg_temp.fail('register search_path');
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'confirm_account_delete'
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
          and cfg !~ 'public'
      )
  ) then
    perform pg_temp.fail('delete search_path');
  end if;

  insert into auth.users (id, email) values
    ('${OWNER}', 'member-one'),
    ('${OTHER}', 'member-two');
  insert into public.members (user_id, email, seat, status) values
    ('${OWNER}', 'member-one', 'ksa', 'active'),
    ('${OTHER}', 'member-two', 'intl', 'active');

  insert into public.member_notification_prefs (member_id) values ('${OWNER}');
  if (
    select push_enabled from public.member_notification_prefs where member_id = '${OWNER}'
  ) is distinct from false then
    perform pg_temp.fail('push default');
  end if;

  perform pg_temp.assume('${OWNER}', 'aal1', 'authenticated');
  v_pref := public.own_push_preference();
  if v_pref->>'push_enabled' is distinct from 'false' then
    perform pg_temp.fail('preference default');
  end if;
  begin
    perform public.register_push_token('ios', '${TOKEN}');
    perform pg_temp.fail('registered while off');
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform public.register_push_token('web', '${TOKEN}');
    perform pg_temp.fail('web platform');
  exception
    when invalid_parameter_value then
      null;
  end;
  perform public.set_push_notifications(true);
  perform public.register_push_token('ios', '${TOKEN}');
  select count(*) into v_count from public.member_push_tokens;
  if v_count <> 1 then
    perform pg_temp.fail('owner count');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  select count(*) into v_count from public.member_push_tokens;
  if v_count <> 0 then
    perform pg_temp.fail('other member saw a token');
  end if;
  begin
    insert into public.member_push_tokens (member_id, platform, token)
    values ('${OTHER}', 'android', '${OTHER_TOKEN}');
    perform pg_temp.fail('direct insert');
  exception
    when insufficient_privilege then
      null;
  end;

  perform pg_temp.assume('11111111-1111-4111-8111-111111111111', 'aal2', 'authenticated');
  select count(*) into v_count from public.member_push_tokens;
  if v_count <> 0 then
    perform pg_temp.fail('staff saw a token');
  end if;

  begin
    execute 'set role anon';
    perform 1 from public.member_push_tokens;
    perform pg_temp.fail('anon selected');
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  update public.member_push_tokens
  set last_seen_at = pg_catalog.now() - interval '2 days'
  where member_id = '${OWNER}';
  select last_seen_at into v_old from public.member_push_tokens where member_id = '${OWNER}';

  perform pg_temp.assume('${OWNER}', 'aal1', 'authenticated');
  perform public.register_push_token('android', '${TOKEN}');
  execute 'reset role';
  select last_seen_at, revoked_at into v_seen, v_revoked
  from public.member_push_tokens
  where member_id = '${OWNER}' and token = '${TOKEN}';
  if v_seen <= v_old or v_revoked is not null then
    perform pg_temp.fail('upsert did not refresh');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  perform public.set_push_notifications(true);
  perform public.register_push_token('ios', '${TOKEN}');
  execute 'reset role';
  select revoked_at into v_revoked
  from public.member_push_tokens
  where member_id = '${OWNER}' and token = '${TOKEN}';
  if v_revoked is null then
    perform pg_temp.fail('previous owner stayed live');
  end if;
  select count(*) into v_count
  from public.member_push_tokens
  where member_id = '${OTHER}' and revoked_at is null;
  if v_count <> 1 then
    perform pg_temp.fail('new owner missing');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  v_result := public.revoke_my_push_tokens();
  if (v_result->>'revoked')::int <> 1 then
    perform pg_temp.fail('revoke count');
  end if;
  execute 'reset role';
  select revoked_at into v_revoked
  from public.member_push_tokens
  where member_id = '${OTHER}';
  if v_revoked is null then
    perform pg_temp.fail('sign-out revoke');
  end if;

  perform pg_temp.assume('${OWNER}', 'aal1', 'authenticated');
  perform public.set_push_notifications(true);
  perform public.register_push_token('ios', '${OTHER_TOKEN}');
  perform public.set_push_notifications(false);
  execute 'reset role';
  select revoked_at into v_revoked
  from public.member_push_tokens
  where member_id = '${OWNER}' and token = '${OTHER_TOKEN}';
  if v_revoked is null then
    perform pg_temp.fail('toggle off did not revoke');
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  v_issued := public.issue_account_delete_code('${OWNER}', '${HASH}', pg_catalog.now() + interval '10 minutes');
  if v_issued is distinct from 'ok' then
    perform pg_temp.fail('issue ' || coalesce(v_issued, 'null'));
  end if;
  v_result := public.confirm_account_delete('${OWNER}', '${HASH}');
  if v_result->>'status' is distinct from 'ok' then
    perform pg_temp.fail('delete ' || coalesce(v_result::text, 'null'));
  end if;
  select count(*) into v_count from public.member_push_tokens where member_id = '${OWNER}';
  if v_count <> 0 then
    perform pg_temp.fail('delete left a push row');
  end if;
  if (
    select count(*) from public.member_notification_prefs where member_id = '${OWNER}'
  ) <> 0 then
    perform pg_temp.fail('delete left prefs');
  end if;
end;
$checks$;
`
