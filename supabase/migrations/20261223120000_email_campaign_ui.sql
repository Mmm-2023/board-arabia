-- Campaign screen support for letters, the apply-form tick, and the release gate.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch stays off. Nothing in this file turns it on.
-- A test of the stored letter is recorded only after the screen calls email-send.
-- The owner address is read from the caller account at runtime. It is not stored.
-- Apply after 20261220120000_email_core.sql. 20261222120000 is already used.
-- Factory does not apply migrations.

alter table public.applications
  add column if not exists news_invitations_opt_in boolean not null default false;

comment on column public.applications.news_invitations_opt_in is
  'Unticked on the apply form. True only when the applicant ticks the box. Read at admit. Does not send mail.';

alter table public.email_campaigns
  add column if not exists tested_version text,
  add column if not exists tested_by uuid,
  add column if not exists tested_at timestamptz;

alter table public.email_campaigns
  drop constraint if exists email_campaigns_tested_version_check;

alter table public.email_campaigns
  add constraint email_campaigns_tested_version_check
  check (tested_version is null or tested_version ~ '^[0-9a-f]{64}$');

comment on column public.email_campaigns.tested_version is
  'Hash of the letter that was test sent. An edit clears it. The address is not stored.';

create or replace function private.email_campaign_version(
  p_kind text,
  p_category text,
  p_issue uuid,
  p_subject text,
  p_preheader text,
  p_body text,
  p_html text,
  p_audience text[]
) returns text
language sql
immutable
security definer
set search_path = ''
as $fn$
  select encode(
    extensions.digest(
      convert_to(
        coalesce(p_kind, '') || '|' ||
        coalesce(p_category, '') || '|' ||
        coalesce(p_issue::text, '') || '|' ||
        coalesce(p_subject, '') || '|' ||
        coalesce(p_preheader, '') || '|' ||
        coalesce(p_body, '') || '|' ||
        coalesce(p_html, '') || '|' ||
        coalesce(pg_catalog.array_to_string(p_audience, ','), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$fn$;

revoke all on function private.email_campaign_version(text, text, uuid, text, text, text, text, text[])
  from public, anon, authenticated;

comment on function private.email_campaign_version(text, text, uuid, text, text, text, text, text[]) is
  'Hash of one stored letter. Used to see whether a test still matches. Does not send mail.';

create or replace function private.email_apply_admit_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cat record;
  opted boolean;
  act text;
  src text;
  news_ticked boolean := false;
begin
  if p_user_id is null then
    return;
  end if;
  if not exists (select 1 from public.members m where m.user_id = p_user_id) then
    return;
  end if;
  if exists (
    select 1
    from public.email_preferences p
    where p.user_id = p_user_id
      and p.category = 'weekly_digest'
  ) then
    return;
  end if;

  select coalesce(a.news_invitations_opt_in, false) into news_ticked
  from public.members m
  left join public.applications a on a.id = m.application_id
  where m.user_id = p_user_id;

  for cat in
    select c.key, c.requires_opt_in
    from public.email_categories c
    order by c.key
  loop
    if cat.key = 'news_invitations' and coalesce(news_ticked, false) then
      opted := true;
      act := 'opt_in';
      src := 'apply_form';
    else
      opted := not cat.requires_opt_in;
      act := case when opted then 'opt_in' else 'opt_out' end;
      src := 'admit_default';
    end if;
    insert into public.email_preferences (user_id, category, opted_in, updated_at)
    values (p_user_id, cat.key, opted, pg_catalog.now());
    insert into public.email_consent_log (
      user_id, email_hash, category, action, source, notice_version
    )
    select
      p_user_id,
      private.email_address_hash(m.email),
      cat.key,
      act,
      src,
      'email-ui-1'
    from public.members m
    where m.user_id = p_user_id
      and private.email_address_hash(m.email) is not null;
    if cat.key = 'weekly_digest' and opted then
      update public.members
      set digest_email_opt_in = true
      where user_id = p_user_id;
    end if;
  end loop;
end;
$fn$;

revoke all on function private.email_apply_admit_defaults(uuid) from public, anon, authenticated;

comment on function private.email_apply_admit_defaults(uuid) is
  'At admit, turn Weekly email on and log source admit_default. A ticked apply form turns News and invitations on and logs source apply_form. If a weekly preference already exists, do nothing.';

create or replace function public.my_email_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  weekly_col boolean;
  weekly_pref boolean;
  news_pref boolean;
  connected boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.digest_email_opt_in into weekly_col
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.opted_in into weekly_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'weekly_digest';
  select p.opted_in into news_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'news_invitations';
  select s.master_enabled into connected
  from public.email_settings s
  where s.id;
  return pg_catalog.jsonb_build_object(
    'weekly_digest', coalesce(weekly_pref, weekly_col, false),
    'news_invitations', coalesce(news_pref, false),
    'delivery_connected', coalesce(connected, false)
  );
end;
$fn$;

revoke all on function public.my_email_preferences() from public, anon;
grant execute on function public.my_email_preferences() to authenticated;

create or replace function public.staff_upsert_campaign(
  p_id uuid,
  p_kind text,
  p_category text,
  p_subject text,
  p_preheader text,
  p_body_text text,
  p_body_html text,
  p_audience text[],
  p_digest_issue_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_requires boolean;
  v_audience text[];
  v_subject text;
  v_preheader text;
  v_body text;
  v_html text;
  v_tested text;
  v_version text;
  v_reset boolean := false;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('digest', 'campaign') then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  select c.requires_opt_in into v_requires
  from public.email_categories c
  where c.key = p_category;
  if not found then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and v_requires is not true then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and p_category is distinct from 'weekly_digest' then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and (
    p_digest_issue_id is null
    or not exists (select 1 from public.digest_issues i where i.id = p_digest_issue_id)
  ) then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and p_digest_issue_id is not null then
    raise exception 'not_allowed' using errcode = '22023';
  end if;

  v_audience := private.normalize_membership_tiers(coalesce(p_audience, array[]::text[]));
  if coalesce(pg_catalog.cardinality(v_audience), 0) > 0
     and not private.membership_tiers_valid(v_audience) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  v_subject := coalesce(private.digest_plain(p_subject, 180), '');
  v_preheader := coalesce(private.digest_plain(p_preheader, 180), '');
  v_body := coalesce(private.digest_plain(p_body_text, 8000), '');
  perform private.email_assert_links(v_subject);
  perform private.email_assert_links(v_preheader);
  perform private.email_assert_links(v_body);
  v_html := private.email_sanitise_html(p_body_html);
  v_version := private.email_campaign_version(
    p_kind, p_category, p_digest_issue_id, v_subject, v_preheader, v_body, v_html, v_audience
  );

  if p_id is null then
    insert into public.email_campaigns (
      kind, digest_issue_id, category, subject, preheader, body_text,
      body_html_sanitised, audience_tiers, status, created_by
    ) values (
      p_kind, p_digest_issue_id, p_category, v_subject, v_preheader, v_body,
      v_html, v_audience, 'draft', auth.uid()
    )
    returning id into v_id;
    v_status := 'draft';
  else
    select c.status, c.tested_version into v_status, v_tested
    from public.email_campaigns c
    where c.id = p_id
    for update;
    if v_status is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_status not in ('draft', 'approved', 'test_sent') then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    v_reset := v_status = 'test_sent' and v_version is distinct from v_tested;
    if v_reset then
      v_status := 'approved';
    end if;
    update public.email_campaigns
    set kind = p_kind,
        digest_issue_id = p_digest_issue_id,
        category = p_category,
        subject = v_subject,
        preheader = v_preheader,
        body_text = v_body,
        body_html_sanitised = v_html,
        audience_tiers = v_audience,
        status = v_status,
        tested_version = case when v_reset then null else tested_version end,
        tested_by = case when v_reset then null else tested_by end,
        tested_at = case when v_reset then null else tested_at end
    where id = p_id;
    v_id := p_id;
  end if;

  return pg_catalog.jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

comment on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid) is
  'Admin saves a letter. An edit after a test returns it to approved. Does not send mail.';

create or replace function public.staff_email_release_gate(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean;
  v_master boolean;
  v_status text;
  v_kind text;
  v_category text;
  v_issue uuid;
  v_subject text;
  v_preheader text;
  v_body text;
  v_html text;
  v_audience text[];
  v_tested text;
  v_tested_by uuid;
  v_approved timestamptz;
  v_version text;
  v_hash text;
  v_account text;
  v_match boolean := false;
  v_test boolean := false;
  v_counts jsonb;
  v_eligible integer := 0;
  v_ready boolean := false;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_owner := private.is_owner();
  select s.master_enabled into v_master from public.email_settings s where s.id;
  select
    c.status, c.kind, c.category, c.digest_issue_id, c.subject, c.preheader,
    c.body_text, c.body_html_sanitised, c.audience_tiers, c.tested_version,
    c.tested_by, c.approved_at
    into
      v_status, v_kind, v_category, v_issue, v_subject, v_preheader,
      v_body, v_html, v_audience, v_tested, v_tested_by, v_approved
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_version := private.email_campaign_version(
    v_kind, v_category, v_issue, v_subject, v_preheader, v_body, v_html, v_audience
  );
  v_match := v_status = 'test_sent'
    and v_approved is not null
    and v_tested is not null
    and v_tested = v_version
    and v_tested_by is not null
    and v_tested_by = auth.uid();
  select u.email into v_account
  from auth.users u
  where u.id = auth.uid();
  v_hash := private.email_address_hash(v_account);
  if v_hash is not null and v_match then
    v_test := exists (
      select 1
      from public.email_sends s
      where s.campaign_id = p_campaign_id
        and s.is_test
        and s.status in ('sent', 'delivered')
        and s.email_hash = v_hash
    );
  end if;
  v_counts := private.email_audience_counts(v_audience, v_category);
  v_eligible := coalesce((v_counts->>'eligible')::integer, 0);
  v_ready := v_owner
    and coalesce(v_master, false)
    and v_match
    and v_test
    and v_eligible > 0;
  return pg_catalog.jsonb_build_object(
    'ready', v_ready,
    'is_owner', v_owner,
    'master_enabled', coalesce(v_master, false),
    'approved', v_approved is not null,
    'test_sent', v_test,
    'version_matches', v_status = 'test_sent' and v_tested is not null and v_tested = v_version,
    'eligible', v_eligible
  );
end;
$$;

revoke all on function public.staff_email_release_gate(uuid) from public, anon;
grant execute on function public.staff_email_release_gate(uuid) to authenticated;

comment on function public.staff_email_release_gate(uuid) is
  'Owner release is open only after a test of this version went to the caller account, the master switch is on, and the letter is approved. No address is returned. Does not send mail.';

create or replace function public.staff_record_campaign_test(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_kind text;
  v_category text;
  v_issue uuid;
  v_subject text;
  v_preheader text;
  v_body text;
  v_html text;
  v_audience text[];
  v_version text;
  v_account text;
  v_hash text;
  v_owner boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select
    c.status, c.kind, c.category, c.digest_issue_id, c.subject, c.preheader,
    c.body_text, c.body_html_sanitised, c.audience_tiers
    into
      v_status, v_kind, v_category, v_issue, v_subject, v_preheader,
      v_body, v_html, v_audience
  from public.email_campaigns c
  where c.id = p_id
  for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('approved', 'test_sent') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if pg_catalog.btrim(coalesce(v_subject, '')) = ''
     or pg_catalog.btrim(coalesce(v_body, '')) = '' then
    raise exception 'copy_required' using errcode = '22023';
  end if;
  select u.email into v_account
  from auth.users u
  where u.id = auth.uid();
  v_hash := private.email_address_hash(v_account);
  if v_hash is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_version := private.email_campaign_version(
    v_kind, v_category, v_issue, v_subject, v_preheader, v_body, v_html, v_audience
  );
  insert into public.email_sends (
    campaign_id, user_id, email_hash, status, is_test, attempt
  ) values (
    p_id,
    (select m.user_id from public.members m where m.user_id = auth.uid()),
    v_hash,
    'sent',
    true,
    1
  );
  v_owner := private.is_owner();
  if v_owner then
    update public.email_campaigns
    set status = 'test_sent',
        tested_version = v_version,
        tested_by = auth.uid(),
        tested_at = pg_catalog.now()
    where id = p_id;
    v_status := 'test_sent';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', v_status,
    'qualifies', v_owner
  );
end;
$$;

revoke all on function public.staff_record_campaign_test(uuid) from public, anon;
grant execute on function public.staff_record_campaign_test(uuid) to authenticated;

comment on function public.staff_record_campaign_test(uuid) is
  'Records a test of the stored letter against the caller account. Only an owner test sets test_sent. Does not send mail. The screen calls email-send first.';

create or replace function private.email_newsletter_event_rows(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  event_col text;
  time_col text;
  url_col text;
  result jsonb;
begin
  if pg_catalog.to_regclass('public.newsletter_events') is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'newsletter_events'
      and c.column_name = 'campaign_id'
  ) then
    return '[]'::jsonb;
  end if;

  select case
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'event'
    ) then 'event'
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'event_type'
    ) then 'event_type'
    else null
  end into event_col;

  select case
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'created_at'
    ) then 'created_at'
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'occurred_at'
    ) then 'occurred_at'
    else null
  end into time_col;

  select case
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'url'
    ) then 'url'
    when exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'newsletter_events' and c.column_name = 'clicked_url'
    ) then 'clicked_url'
    else null
  end into url_col;

  if event_col is null or time_col is null then
    return '[]'::jsonb;
  end if;

  execute pg_catalog.format(
    'select coalesce(pg_catalog.jsonb_agg(ev.payload order by ev.at desc), ''[]''::jsonb)
     from (
       select e.%I as at,
         pg_catalog.jsonb_build_object(
           ''status'', e.%I,
           ''at'', e.%I,
           ''is_test'', false,
           ''url'', %s
         ) as payload
       from public.newsletter_events e
       where e.campaign_id = $1
       order by e.%I desc
       limit 8
     ) ev',
    time_col,
    event_col,
    time_col,
    case
      when url_col is null then 'null'
      else pg_catalog.format(
        'case when e.%I ~ ''^https?://'' then e.%I else null end',
        url_col,
        url_col
      )
    end,
    time_col
  )
  into result
  using p_campaign_id;

  return coalesce(result, '[]'::jsonb);
end;
$fn$;

revoke all on function private.email_newsletter_event_rows(uuid) from public, anon, authenticated;

comment on function private.email_newsletter_event_rows(uuid) is
  'Latest webhook rows from public.newsletter_events for one letter. The transactional mail log is not read. Does not send mail.';

create or replace function public.staff_email_screen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_master boolean;
  v_owner boolean;
  v_rows jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.master_enabled into v_master from public.email_settings s where s.id;
  v_owner := private.is_owner();
  select coalesce(pg_catalog.jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select c.created_at,
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'kind', c.kind,
        'category', c.category,
        'subject', c.subject,
        'preheader', c.preheader,
        'body_text', c.body_text,
        'status', c.status,
        'audience_tiers', pg_catalog.to_jsonb(c.audience_tiers),
        'digest_issue_id', c.digest_issue_id,
        'created_at', c.created_at,
        'approved', c.approved_at is not null,
        'audience', private.email_audience_counts(c.audience_tiers, c.category),
        'release', public.staff_email_release_gate(c.id),
        'log', pg_catalog.jsonb_build_object(
          'queued', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'queued' and s.is_test = false
          ),
          'skipped', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'skipped' and s.is_test = false
          ),
          'sent', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'sent' and s.is_test = false
          ),
          'delivered', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'delivered' and s.is_test = false
          ),
          'bounced', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'bounced' and s.is_test = false
          ),
          'complained', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'complained' and s.is_test = false
          ),
          'failed', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'failed' and s.is_test = false
          ),
          'test', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.is_test
          ),
          'events', private.email_newsletter_event_rows(c.id)
        )
      ) as payload
    from public.email_campaigns c
    order by c.created_at desc
    limit 40
  ) item;
  return pg_catalog.jsonb_build_object(
    'master_enabled', coalesce(v_master, false),
    'is_owner', v_owner,
    'campaigns', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_email_screen() from public, anon;
grant execute on function public.staff_email_screen() to authenticated;

comment on function public.staff_email_screen() is
  'Admin letter list, audience counts, and send log counts. No address is returned. Does not send mail.';
