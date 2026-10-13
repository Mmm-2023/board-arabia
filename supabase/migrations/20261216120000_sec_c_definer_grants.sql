-- SEC-C. Clear the anon security-definer advisor without opening tables.
-- Apply after 20261213120000_rls_initplan_select_auth_uid.sql.
-- The authoring agent does not apply this file and does not run db push.
--
-- The six public RPCs that anon must call move their bodies into private
-- security definer impls with search_path ''. The public functions become
-- security invoker wrappers, so the Data API no longer exposes a definer
-- to anon. Execute on each impl is revoked from public, then granted only
-- to anon and authenticated. Those are the roles that call the wrappers.
-- service_role does not call them. This is not a table grant.
-- Usage on schema private is required for an invoker wrapper
-- to see the impl. 20260923120000 revoked that usage from anon.
-- supabase/config.toml does not list private in an API schemas setting.
--
-- The other member and staff RPCs stay security definer. Authenticated
-- keeps execute. Public and anon lose execute. That remaining authenticated
-- definer warning is accepted: revoking it would break the app.
-- Every security definer in public and private gets search_path ''.
--
-- This file does not drop or create policies. The 17 auth.uid initplan
-- policies in 20261213120000 stay as written. It does not disable or
-- unforce row level security. Tables with RLS and no policy stay deny-all.
-- Leaked password protection is an auth setting. It is not changed here.
-- Safe to run again.

alter default privileges in schema private revoke execute on functions from public, anon;

create or replace function private.list_partner_categories_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'name', c.name,
      'gloss', c.gloss
    ) order by c.sort_order, c.name)
    from public.partner_categories c
  ), '[]'::jsonb);
$fn$;

revoke all on function private.list_partner_categories_impl() from public, anon, authenticated, service_role;
revoke execute on function private.list_partner_categories_impl() from public;
grant execute on function private.list_partner_categories_impl() to anon, authenticated;

create or replace function private.list_trusted_partners_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  real_n int;
  member_view boolean;
begin
  select count(*)::int into real_n
  from public.trusted_partners t
  where t.is_demo = false
    and t.published = true;

  member_view := auth.uid() is not null
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
    );

  if member_view then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'is_demo', t.is_demo,
        'is_partner', (t.sponsor_user_id is not null and private.is_sponsor(t.sponsor_user_id)),
        'name', t.name,
        'blurb', t.blurb,
        'monogram', t.monogram,
        'logo_path', t.logo_path,
        'category_slug', t.category_slug
      ) order by t.sort_order, t.name)
      from public.trusted_partners t
      where t.published
        and (
          (real_n > 0 and t.is_demo = false)
          or (real_n = 0 and t.is_demo = true)
        )
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'is_partner', (t.sponsor_user_id is not null and private.is_sponsor(t.sponsor_user_id)),
      'name', t.name,
      'blurb', t.blurb,
      'monogram', t.monogram,
      'logo_path', t.logo_path,
      'category_slug', t.category_slug
    ) order by t.sort_order, t.name)
    from public.trusted_partners t
    where t.published
      and t.is_demo = false
      and t.logo_path is not null
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function private.list_trusted_partners_impl() from public, anon, authenticated, service_role;
revoke execute on function private.list_trusted_partners_impl() from public;
grant execute on function private.list_trusted_partners_impl() to anon, authenticated;

create or replace function private.submit_partner_interest_impl(
  p_name text,
  p_firm text,
  p_category text,
  p_note text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_firm text;
  v_slug text;
  v_note text;
begin
  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  v_firm := pg_catalog.btrim(coalesce(p_firm, ''));
  v_slug := pg_catalog.btrim(coalesce(p_category, ''));
  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');

  if char_length(v_name) < 1 or char_length(v_name) > 120
     or char_length(v_firm) < 1 or char_length(v_firm) > 160
     or v_note is not null and char_length(v_note) > 1000
     or position('@' in v_name) > 0
     or position('@' in v_firm) > 0
     or (v_note is not null and position('@' in v_note) > 0)
     or not exists (select 1 from public.partner_categories c where c.slug = v_slug)
  then
    raise exception 'invalid_interest' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.partner_interest i
    where lower(i.firm) = lower(v_firm)
      and i.created_at > pg_catalog.now() - interval '1 day'
  ) then
    return jsonb_build_object('ok', true);
  end if;

  if (
    select count(*)
    from public.partner_interest i
    where i.created_at > pg_catalog.now() - interval '1 day'
  ) >= 20 then
    raise exception 'busy_today' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.partner_interest i
    where i.category_slug = v_slug
      and i.created_at > pg_catalog.now() - interval '1 day'
  ) >= 10 then
    raise exception 'busy_today' using errcode = 'P0001';
  end if;

  insert into public.partner_interest (contact_name, firm, category_slug, note)
  values (v_name, v_firm, v_slug, v_note);

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function private.submit_partner_interest_impl(text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.submit_partner_interest_impl(text, text, text, text) from public;
grant execute on function private.submit_partner_interest_impl(text, text, text, text) to anon, authenticated;

create or replace function private.list_landing_preview_deals_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  real_n int;
  show_demo boolean;
begin
  select count(*)::int into real_n
  from public.mandates
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('mandates', real_n);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', picked.id,
      'is_demo', picked.is_demo,
      'sector', picked.sector,
      'ask', picked.one_liner,
      'status', picked.stage
    ) order by picked.sort_order, picked.created_at)
    from (
      select m.id, m.is_demo, m.sector, m.one_liner, m.stage, m.sort_order, m.created_at
      from public.mandates m
      where m.published
        and (
          (show_demo and m.is_demo)
          or ((not show_demo) and m.is_demo = false)
        )
      order by m.sort_order, m.created_at
      limit 3
    ) picked
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function private.list_landing_preview_deals_impl() from public, anon, authenticated, service_role;
revoke execute on function private.list_landing_preview_deals_impl() from public;
grant execute on function private.list_landing_preview_deals_impl() to anon, authenticated;

create or replace function private.landing_platform_totals_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'investment_usd', greatest(coalesce(s.investment_capability_usd, 0), t.floor_investment_usd),
    'fo_aum_usd', greatest(coalesce(s.fo_aum_usd, 0), t.floor_fo_aum_usd),
    'turnover_usd', greatest(coalesce(s.turnover_usd, 0), t.floor_turnover_usd),
    'founding_admitted_count', s.founding_admitted_count,
    'founding_ksa_count', s.founding_ksa_count,
    'founding_intl_count', s.founding_intl_count,
    'updated_at', s.updated_at
  )
  from public.demo_thresholds t
  left join public.platform_stats s on s.id = 1
  where t.id = 1;
$fn$;

revoke all on function private.landing_platform_totals_impl() from public, anon, authenticated, service_role;
revoke execute on function private.landing_platform_totals_impl() from public;
grant execute on function private.landing_platform_totals_impl() to anon, authenticated;

-- valid, state, and inviter_label only. inviter_label is a display name.
-- No email, member id, seat, or tier is selected or returned.
create or replace function private.lookup_member_invite_impl(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  invite_row public.member_invites%rowtype;
  label text;
  bucket text;
  hits integer;
begin
  if p_token is null
     or char_length(p_token) < 43
     or char_length(p_token) > 80
     or p_token !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  bucket := 'lkp:' || (((hashtext(p_token) % 128) + 128) % 128)::text;

  insert into public.invite_lookup_limits (rate_key, window_start, hit_count)
  values (bucket, now(), 1)
  on conflict (rate_key) do update
  set
    hit_count = case
      when public.invite_lookup_limits.window_start < now() - interval '1 hour' then 1
      else public.invite_lookup_limits.hit_count + 1
    end,
    window_start = case
      when public.invite_lookup_limits.window_start < now() - interval '1 hour' then now()
      else public.invite_lookup_limits.window_start
    end
  returning hit_count into hits;

  if hits > 40 then
    return jsonb_build_object('valid', false, 'state', 'limited');
  end if;

  select * into invite_row
  from public.member_invites
  where token = p_token;

  if not found then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  if invite_row.expires_at <= now() then
    return jsonb_build_object('valid', false, 'state', 'expired');
  end if;

  if invite_row.status in ('applied', 'accepted', 'admitted') then
    return jsonb_build_object('valid', false, 'state', 'used');
  end if;

  if invite_row.status <> 'pending' and invite_row.status <> 'opened' then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  if invite_row.status = 'pending' then
    update public.member_invites
    set status = 'opened',
        opened_at = coalesce(opened_at, now())
    where id = invite_row.id
      and status = 'pending';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'A Board Arabia member')
    into label
  from public.profiles p
  where p.user_id = invite_row.inviter_member_id;

  if label is null or label = '' then
    label := 'A Board Arabia member';
  end if;

  return jsonb_build_object(
    'valid', true,
    'state', 'valid',
    'inviter_label', label
  );
end;
$fn$;

revoke all on function private.lookup_member_invite_impl(text) from public, anon, authenticated, service_role;
revoke execute on function private.lookup_member_invite_impl(text) from public;
grant execute on function private.lookup_member_invite_impl(text) to anon, authenticated;

grant usage on schema private to anon;

create or replace function public.list_partner_categories()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select private.list_partner_categories_impl();
$fn$;

revoke all on function public.list_partner_categories() from public;
grant execute on function public.list_partner_categories() to anon, authenticated, service_role;

create or replace function public.list_trusted_partners()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
begin
  return private.list_trusted_partners_impl();
end;
$fn$;

revoke all on function public.list_trusted_partners() from public;
grant execute on function public.list_trusted_partners() to anon, authenticated, service_role;

create or replace function public.submit_partner_interest(
  p_name text,
  p_firm text,
  p_category text,
  p_note text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
begin
  return private.submit_partner_interest_impl(p_name, p_firm, p_category, p_note);
end;
$fn$;

revoke all on function public.submit_partner_interest(text, text, text, text) from public;
grant execute on function public.submit_partner_interest(text, text, text, text) to anon, authenticated, service_role;

create or replace function public.list_landing_preview_deals()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
begin
  return private.list_landing_preview_deals_impl();
end;
$fn$;

revoke all on function public.list_landing_preview_deals() from public;
grant execute on function public.list_landing_preview_deals() to anon, authenticated, service_role;

create or replace function public.landing_platform_totals()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select private.landing_platform_totals_impl();
$fn$;

revoke all on function public.landing_platform_totals() from public;
grant execute on function public.landing_platform_totals() to anon, authenticated, service_role;

create or replace function public.lookup_member_invite(p_token text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
begin
  return private.lookup_member_invite_impl(p_token);
end;
$fn$;

revoke all on function public.lookup_member_invite(text) from public;
grant execute on function public.lookup_member_invite(text) to anon, authenticated, service_role;

do $sec_c_grants$
declare
  r record;
  surface text[] := array[
    'delete_own_ai_tool_job',
    'delete_own_due_diligence_report',
    'digest_issue_sendable',
    'dismiss_my_application_answer',
    'dismiss_sponsor_welcome',
    'download_my_data',
    'express_re_club_interest',
    'get_my_application_answers',
    'get_my_re_appetite',
    'landing_platform_totals',
    'list_accepted_intro_contacts',
    'list_directory',
    'list_landing_preview_deals',
    'list_member_home_activity',
    'list_member_mandates',
    'list_member_rooms',
    'list_my_deal_rooms',
    'list_my_intro_suggestions',
    'list_my_intros',
    'list_own_ai_tool_jobs',
    'list_partner_categories',
    'list_re_board_roles',
    'list_re_opportunities',
    'list_re_partners',
    'list_sponsor_showcase',
    'list_staff_directory',
    'list_trusted_partners',
    'lookup_member_invite',
    'mark_sponsor_handed_over',
    'marketing_funnel_counts',
    'my_intro_quota',
    'my_re_club_interest',
    'my_weekly_digest',
    'own_admin_share_state',
    'own_digest_preference',
    'own_directory_visibility',
    'own_sponsor_welcome',
    'read_ai_tool_frame',
    'read_dd_retention_copy',
    'record_ai_tool_consent',
    'record_intro_meet',
    'request_mandate_intro',
    'request_member_intro',
    'request_re_board_role_intro',
    'request_re_opportunity_intro',
    'request_re_partner_intro',
    'request_sponsor_intro',
    'respond_member_intro',
    'save_my_re_appetite',
    'search_deal_room_directory',
    'set_ai_tool_flag',
    'set_ai_tool_result_admin_share',
    'set_ai_tool_retention',
    'set_dd_retention_copy',
    'set_digest_email_opt_in',
    'set_digest_send_enabled',
    'set_directory_hidden',
    'set_due_diligence_deck_admin_share',
    'set_due_diligence_report_admin_share',
    'set_member_tiers',
    'set_show_card_to_sponsors',
    'sponsor_desk',
    'sponsor_intro_counts',
    'staff_assign_sponsor_category',
    'staff_assign_sponsor_package',
    'staff_create_digest_draft',
    'staff_create_mandate',
    'staff_decide_digest_issue',
    'staff_decide_mandate_intro',
    'staff_decide_re_board_role_intro',
    'staff_decide_re_opportunity_intro',
    'staff_decide_re_partner_intro',
    'staff_decide_sponsor_intro',
    'staff_digest_issue',
    'staff_get_intro_monthly_limit',
    'staff_get_own_display_name',
    'staff_intro_funnel',
    'staff_link_re_club_room',
    'staff_list_access_log',
    'staff_list_all_intros',
    'staff_list_desk_intros',
    'staff_list_intro_deals',
    'staff_list_mandate_intros',
    'staff_list_mandate_matches',
    'staff_list_mandates',
    'staff_list_partner_interest',
    'staff_list_re_appetites',
    'staff_list_re_board_role_intros',
    'staff_list_re_club_interest',
    'staff_list_re_opportunity_intros',
    'staff_list_re_partner_intros',
    'staff_list_sponsor_catalog',
    'staff_list_sponsor_intros',
    'staff_list_sponsor_options',
    'staff_list_trusted_partners',
    'staff_mark_desk_intro_sent',
    'staff_mark_partner_interest_seen',
    'staff_open_re_club_room',
    'staff_private_work_counts',
    'staff_read_desk_intro',
    'staff_read_member',
    'staff_read_membership_request',
    'staff_read_shared_item',
    'staff_reorder_trusted_partners',
    'staff_save_re_opportunity',
    'staff_save_re_partner',
    'staff_save_sponsor_package',
    'staff_save_trusted_partner',
    'staff_set_avatar_style',
    'staff_set_intro_deal',
    'staff_set_intro_monthly_limit',
    'staff_set_majlis_presented_by',
    'staff_set_member_capacity',
    'staff_set_own_display_name',
    'staff_set_re_opportunity_readiness',
    'staff_set_trusted_partner_logo',
    'staff_set_trusted_partner_published',
    'staff_sponsor_handovers',
    'submit_partner_interest'
  ];
  anon_keep text[] := array[
    'landing_platform_totals',
    'list_landing_preview_deals',
    'list_partner_categories',
    'list_trusted_partners',
    'lookup_member_invite',
    'submit_partner_interest'
  ];
  seen int;
begin
  select count(*) into seen
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (surface);
  if seen <> 119 then
    raise exception 'sec-c surface count is %', seen;
  end if;

  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in (
        'landing_platform_totals_impl',
        'list_landing_preview_deals_impl',
        'list_partner_categories_impl',
        'list_trusted_partners_impl',
        'lookup_member_invite_impl',
        'submit_partner_interest_impl'
      )
  loop
    execute format(
      'revoke all on function private.%I(%s) from public, anon',
      r.proname,
      r.args
    );
  end loop;

  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (surface)
      and not (p.proname = any (anon_keep))
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon',
      r.proname,
      r.args
    );
    execute format(
      'grant execute on function public.%I(%s) to authenticated, service_role',
      r.proname,
      r.args
    );
  end loop;

  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg = 'search_path=""'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = ''''',
      r.schema_name,
      r.function_name,
      r.args
    );
  end loop;
end
$sec_c_grants$;

do $sec_c_check$
declare
  bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute');
  if bad is not null then
    raise exception 'anon can still execute a public security definer: %', bad;
  end if;
end
$sec_c_check$;
