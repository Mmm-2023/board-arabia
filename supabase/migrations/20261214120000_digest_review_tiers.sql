-- Digest review, tier audience, and in-app delivery.
-- Does not send mail. Does not schedule anything. Does not edit 20261212120000.
-- Apply via MCP after 20261212120000_weekly_digest.sql.
-- Factory does not apply migrations.

alter table public.digest_issues
  add column if not exists audience text[] not null default '{}',
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz;

alter table public.digest_issues drop constraint if exists digest_issues_audience_check;
alter table public.digest_issues
  add constraint digest_issues_audience_check
  check (audience = private.normalize_membership_tiers(audience));

comment on column public.digest_issues.audience is
  'Membership tiers that receive this issue. Empty until admin chooses. Approve refuses an empty list.';

alter table public.digest_issue_log drop constraint if exists digest_issue_log_action_check;
alter table public.digest_issue_log
  add constraint digest_issue_log_action_check
  check (action in ('created', 'approved', 'withdrawn', 'edited'));

create table if not exists public.digest_notices (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.digest_issues (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint digest_notices_once unique (issue_id, member_id)
);

comment on table public.digest_notices is
  'Per-member unread flag for an approved digest. There is no older notification table. Withdraw deletes the rows.';

create index if not exists digest_notices_member_idx
  on public.digest_notices (member_id, created_at desc);

alter table public.digest_notices enable row level security;
alter table public.digest_notices force row level security;

revoke all on table public.digest_notices from public, anon, authenticated, service_role;

drop policy if exists digest_notices_staff on public.digest_notices;
create policy digest_notices_staff
  on public.digest_notices
  for all
  to public
  using (private.is_staff())
  with check (private.is_staff());

create or replace function private.digest_clean_list(p_rows jsonb, p_kind text)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_text text;
begin
  for v_item in
    select listed.item
    from pg_catalog.jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
      with ordinality as listed(item, ord)
    order by listed.ord
  loop
    if p_kind = 'member' then
      v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', case
          when coalesce(v_item->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then v_item->>'id'
          else null
        end,
        'full_name', coalesce(nullif(private.digest_plain(v_item->>'full_name', 200), ''), 'Member'),
        'headline', nullif(private.digest_plain(v_item->>'headline', 160), ''),
        'company', nullif(private.digest_plain(v_item->>'company', 200), '')
      )));
    elsif p_kind = 'mandate' then
      v_text := private.digest_plain(v_item->>'one_liner', 280);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'sector', private.digest_plain(v_item->>'sector', 120),
          'deal_type', private.digest_plain(v_item->>'deal_type', 80),
          'ticket_band', private.digest_plain(v_item->>'ticket_band', 40),
          'geography', nullif(private.digest_plain(v_item->>'geography', 40), ''),
          'stage', private.digest_plain(v_item->>'stage', 40),
          'one_liner', v_text
        )));
      end if;
    elsif p_kind = 'event' then
      v_text := private.digest_plain(v_item->>'title', 160);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'title', v_text,
          'starts_at', private.digest_plain(v_item->>'starts_at', 40),
          'region', nullif(private.digest_plain(v_item->>'region', 80), ''),
          'host_name', coalesce(nullif(private.digest_plain(v_item->>'host_name', 200), ''), 'Board Arabia'),
          'venue_address', nullif(private.digest_plain(v_item->>'venue_address', 200), '')
        )));
      end if;
    elsif p_kind = 'intro' then
      v_text := private.digest_plain(v_item->>'full_name', 200);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'full_name', v_text,
          'headline', private.digest_plain(v_item->>'headline', 160),
          'company', private.digest_plain(v_item->>'company', 200),
          'reason', private.digest_plain(v_item->>'reason', 200)
        ));
      end if;
    elsif p_kind = 'note' then
      v_text := private.digest_plain(v_item->>'text', 500);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('text', v_text));
      end if;
    end if;
  end loop;
  return v_out;
end;
$fn$;

revoke all on function private.digest_clean_list(jsonb, text) from public, anon, authenticated;

create or replace function private.digest_store_payload(p_payload jsonb, p_year integer, p_week integer)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', p_year,
    'iso_week', p_week,
    'new_members', private.digest_clean_list(p_payload->'new_members', 'member'),
    'new_mandates', private.digest_clean_list(p_payload->'new_mandates', 'mandate'),
    'upcoming_events', private.digest_clean_list(p_payload->'upcoming_events', 'event'),
    'introductions', private.digest_clean_list(
      case when p_payload ? 'introductions' then p_payload->'introductions' else p_payload->'preview_intros' end,
      'intro'
    ),
    'notes', private.digest_clean_list(p_payload->'notes', 'note'),
    'preview_intros', private.digest_clean_list(
      case when p_payload ? 'introductions' then p_payload->'introductions' else p_payload->'preview_intros' end,
      'intro'
    )
  );
$fn$;

revoke all on function private.digest_store_payload(jsonb, integer, integer) from public, anon, authenticated;

create or replace function private.digest_with_preview(p_payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', p_payload->'iso_year',
    'iso_week', p_payload->'iso_week',
    'new_members', coalesce(p_payload->'new_members', '[]'::jsonb),
    'new_mandates', private.digest_strip_ids(p_payload->'new_mandates'),
    'upcoming_events', private.digest_strip_ids(p_payload->'upcoming_events'),
    'notes', coalesce(p_payload->'notes', '[]'::jsonb),
    'introductions', case
      when p_payload ? 'introductions' then p_payload->'introductions'
      else '[]'::jsonb
    end,
    'preview_intros', case
      when p_payload ? 'preview_intros' then p_payload->'preview_intros'
      else private.digest_preview_intros()
    end
  );
$fn$;

revoke all on function private.digest_with_preview(jsonb) from public, anon, authenticated;

create or replace function private.digest_issue_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_send boolean;
  v_issue jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select s.send_enabled into v_send
  from public.digest_settings s
  where s.id;

  select pg_catalog.jsonb_build_object(
    'id', i.id,
    'iso_year', i.iso_year,
    'iso_week', i.iso_week,
    'status', i.status,
    'approved_at', i.approved_at,
    'audience', i.audience,
    'updated_at', i.updated_at,
    'payload', private.digest_with_preview(i.payload),
    'log', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'action', l.action,
          'created_at', l.created_at
        )
        order by l.created_at
      )
      from public.digest_issue_log l
      where l.issue_id = i.id
    ), '[]'::jsonb)
  )
    into v_issue
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week;

  return pg_catalog.jsonb_build_object(
    'send_enabled', coalesce(v_send, false),
    'mail_ready', false,
    'live', private.digest_with_preview(private.digest_build_payload()),
    'issue', v_issue
  );
end;
$fn$;

revoke all on function private.digest_issue_state() from public, anon, authenticated;

create or replace function private.deliver_digest_notices(p_issue uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_audience text[];
  v_status text;
begin
  select i.audience, i.status into v_audience, v_status
  from public.digest_issues i
  where i.id = p_issue;

  delete from public.digest_notices where issue_id = p_issue;

  if v_status is distinct from 'approved' or coalesce(cardinality(v_audience), 0) < 1 then
    return;
  end if;

  insert into public.digest_notices (issue_id, member_id)
  select p_issue, m.user_id
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.anonymised_at is null
    and m.tiers && v_audience;
end;
$fn$;

revoke all on function private.deliver_digest_notices(uuid) from public, anon, authenticated;

create or replace function public.staff_save_digest_draft(p_payload jsonb, p_audience text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_week integer;
  v_id uuid;
  v_status text;
  v_audience text[];
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_audience := private.normalize_membership_tiers(p_audience);

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.id, i.status
    into v_id, v_status
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week
  for update;

  if v_id is null or v_status is distinct from 'draft' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.digest_issues
  set payload = private.digest_store_payload(coalesce(p_payload, '{}'::jsonb), v_year, v_week),
      audience = v_audience,
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id = v_id;

  insert into public.digest_issue_log (issue_id, action, actor_id)
  values (v_id, 'edited', auth.uid());

  return private.digest_issue_state();
end;
$$;

revoke all on function public.staff_save_digest_draft(jsonb, text[]) from public, anon;
grant execute on function public.staff_save_digest_draft(jsonb, text[]) to authenticated;

comment on function public.staff_save_digest_draft(jsonb, text[]) is
  'Staff aal2 save draft text, removed fields, added items, and the tier audience. Does not send mail.';

create or replace function public.staff_digest_sources()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_members jsonb;
  v_mandates jsonb;
  v_events jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.sort_name), '[]'::jsonb)
    into v_members
  from (
    select
      pg_catalog.lower(coalesce(p.full_name, '')) as sort_name,
      pg_catalog.jsonb_build_object(
        'id', m.user_id,
        'full_name', coalesce(nullif(private.digest_plain(p.full_name, 200), ''), 'Member'),
        'headline', private.digest_plain(p.headline, 160),
        'company', private.digest_plain(p.company, 200)
      ) as payload
    from public.members m
    join public.profiles p on p.user_id = m.user_id
    where private.digest_member_visible(m.user_id)
    order by 1
    limit 24
  ) listed;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.sort_at), '[]'::jsonb)
    into v_mandates
  from (
    select
      m.created_at as sort_at,
      pg_catalog.jsonb_build_object(
        'sector', private.digest_plain(m.sector, 120),
        'deal_type', private.digest_plain(m.deal_type, 80),
        'ticket_band', private.digest_plain(m.ticket_band, 40),
        'geography', private.digest_plain(m.geography, 40),
        'stage', private.digest_plain(m.stage, 40),
        'one_liner', private.digest_plain(m.one_liner, 280)
      ) as payload
    from public.mandates m
    where m.published = true
      and m.is_demo = false
      and not private.sample_subject(m.id)
    order by m.created_at desc
    limit 24
  ) listed;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.starts_at), '[]'::jsonb)
    into v_events
  from (
    select
      e.starts_at,
      pg_catalog.jsonb_build_object(
        'title', private.digest_plain(e.title, 160),
        'starts_at', private.digest_when(e.starts_at),
        'region', private.digest_plain(e.region, 80),
        'host_name', case
          when coalesce(host_member.directory_hidden, false) then 'Board Arabia'
          else coalesce(nullif(private.digest_plain(host_profile.full_name, 200), ''), 'Board Arabia')
        end
      ) as payload
    from public.majlis_events e
    left join public.members host_member on host_member.user_id = e.host_member_id
    left join public.profiles host_profile on host_profile.user_id = e.host_member_id
    where e.status = 'published'
      and e.cancelled_at is null
      and e.starts_at > pg_catalog.now()
    order by e.starts_at
    limit 24
  ) listed;

  return pg_catalog.jsonb_build_object(
    'members', coalesce(v_members, '[]'::jsonb),
    'mandates', coalesce(v_mandates, '[]'::jsonb),
    'events', coalesce(v_events, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_digest_sources() from public, anon;
grant execute on function public.staff_digest_sources() to authenticated;

create or replace function public.staff_decide_digest_issue(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_week integer;
  v_id uuid;
  v_status text;
  v_audience text[];
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action is distinct from 'approve' and p_action is distinct from 'withdraw' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.id, i.status, i.audience
    into v_id, v_status, v_audience
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week
  for update;

  if v_id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action = 'approve' and v_status = 'draft' then
    if coalesce(cardinality(v_audience), 0) < 1 then
      raise exception 'audience_required' using errcode = '42501';
    end if;

    update public.digest_issues
    set status = 'approved',
        approved_by = auth.uid(),
        approved_at = pg_catalog.now()
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'approved', auth.uid());

    perform private.deliver_digest_notices(v_id);
  elsif p_action = 'withdraw' and v_status in ('draft', 'approved') then
    update public.digest_issues
    set status = 'withdrawn'
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'withdrawn', auth.uid());

    perform private.deliver_digest_notices(v_id);
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.digest_issue_state();
end;
$$;

revoke all on function public.staff_decide_digest_issue(text) from public, anon;
grant execute on function public.staff_decide_digest_issue(text) to authenticated;

create or replace function public.staff_digest_mail_plan(p_issue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_audience text[];
  v_ready text;
  v_count integer;
  v_send boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select i.status, i.audience, coalesce(i.payload->>'mail_ready', 'false')
    into v_status, v_audience, v_ready
  from public.digest_issues i
  where i.id = p_issue_id;

  select count(*) into v_count
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.anonymised_at is null
    and m.tiers && coalesce(v_audience, '{}'::text[]);

  select s.send_enabled into v_send from public.digest_settings s where s.id;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'sendable', false,
    'status', v_status,
    'audience', coalesce(v_audience, '{}'::text[]),
    'recipient_count', coalesce(v_count, 0),
    'send_enabled', coalesce(v_send, false),
    'stored_mail_ready', coalesce(v_ready, 'false')
  );
end;
$$;

revoke all on function public.staff_digest_mail_plan(uuid) from public, anon;
grant execute on function public.staff_digest_mail_plan(uuid) to authenticated;

comment on function public.staff_digest_mail_plan(uuid) is
  'Per-tier recipient count for a later letter. mail_ready and sendable are false. Does not send mail.';

create or replace function public.my_weekly_digest()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_payload jsonb;
  v_audience text[];
  v_members jsonb;
  v_events jsonb;
  v_sponsor boolean;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.is_demo = false
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.payload, i.audience
    into v_payload, v_audience
  from public.digest_issues i
  join public.members me on me.user_id = auth.uid()
  where i.iso_year = v_year
    and i.iso_week = v_week
    and i.status = 'approved'
    and me.tiers && i.audience;

  if v_payload is null then
    return pg_catalog.jsonb_build_object(
      'mail_ready', false,
      'iso_year', v_year,
      'iso_week', v_week,
      'new_members', '[]'::jsonb,
      'new_mandates', '[]'::jsonb,
      'upcoming_events', '[]'::jsonb,
      'introductions', '[]'::jsonb,
      'suggestions', '[]'::jsonb,
      'notes', '[]'::jsonb
    );
  end if;

  v_sponsor := private.is_sponsor(auth.uid()) and not private.is_staff();

  select coalesce(pg_catalog.jsonb_agg((item - 'id') order by item->>'full_name'), '[]'::jsonb)
    into v_members
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'new_members', '[]'::jsonb)) item
  where coalesce(item->>'full_name', '') <> ''
    and (
      coalesce(item->>'id', '') !~ '^[0-9a-fA-F-]{36}$'
      or (
        private.digest_member_visible((item->>'id')::uuid)
        and private.caller_sees_member_card((item->>'id')::uuid)
      )
    );

  if v_sponsor then
    v_events := '[]'::jsonb;
  else
    v_events := coalesce(v_payload->'upcoming_events', '[]'::jsonb);
  end if;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', v_year,
    'iso_week', v_week,
    'new_members', coalesce(v_members, '[]'::jsonb),
    'new_mandates', coalesce(v_payload->'new_mandates', '[]'::jsonb),
    'upcoming_events', v_events,
    'introductions', coalesce(v_payload->'introductions', '[]'::jsonb),
    'suggestions', coalesce(v_payload->'introductions', '[]'::jsonb),
    'notes', coalesce(v_payload->'notes', '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.my_weekly_digest() from public, anon;
grant execute on function public.my_weekly_digest() to authenticated;

comment on function public.my_weekly_digest() is
  'Approved issue for the signed-in member when their tier is selected. Otherwise empty. mail_ready is false. Does not send mail.';

create or replace function public.my_digest_notices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', n.id,
      'href', '/dashboard/digest',
      'title', 'This week''s update is ready',
      'read', n.read_at is not null
    ) order by n.created_at desc)
    from public.digest_notices n
    join public.digest_issues i on i.id = n.issue_id
    join public.members m on m.user_id = n.member_id
    where n.member_id = auth.uid()
      and n.read_at is null
      and i.status = 'approved'
      and m.tiers && i.audience
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.my_digest_notices() from public, anon;
grant execute on function public.my_digest_notices() to authenticated;

create or replace function public.mark_my_digest_notice_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.digest_notices
  set read_at = pg_catalog.now()
  where member_id = auth.uid()
    and read_at is null;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.mark_my_digest_notice_read() from public, anon;
grant execute on function public.mark_my_digest_notice_read() to authenticated;

comment on function public.mark_my_digest_notice_read() is
  'Marks the signed-in member notices read. Does not send mail.';
