-- SM-1 general board seats and the in-app notifications store.
-- Additive columns on public.re_board_roles. Existing real estate rows stay valid.
-- In-app only. Nothing is sent off the platform. Nothing is scheduled.
-- No payment columns.
-- Apply later. This file does not run against a live database and does not deploy.
-- Order: after 20261219120000_operator_row_owner_lock.sql.

create or replace function private.board_seat_list_allowed(p_tags text[], p_allowed text[], p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_tags is not null
    and p_allowed is not null
    and p_max >= 0
    and pg_catalog.cardinality(p_tags) <= p_max
    and p_tags <@ p_allowed
    and pg_catalog.cardinality(p_tags) = (
      select count(*)
      from pg_catalog.unnest(p_tags) as item
      where item is not null and pg_catalog.char_length(pg_catalog.btrim(item)) > 0
    )
    and pg_catalog.cardinality(p_tags) = (
      select count(distinct item)
      from pg_catalog.unnest(p_tags) as item
    );
$$;

revoke all on function private.board_seat_list_allowed(text[], text[], integer) from public, anon, authenticated;

create or replace function private.board_seat_regions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Qassim',
    'Ha''il',
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf'
  ]::text[];
$$;

revoke all on function private.board_seat_regions() from public, anon, authenticated;

create or replace function private.board_seat_has_phone(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text, '') ~ '[0-9](?:[0-9]|[[:space:]]|-|\.|\(|\)){6,}[0-9]';
$$;

revoke all on function private.board_seat_has_phone(text) from public, anon, authenticated;

alter table public.re_board_roles
  add column if not exists scope text,
  add column if not exists status text,
  add column if not exists sector_tags text[],
  add column if not exists regions text[],
  add column if not exists posted_by_member_id uuid;

alter table public.re_board_roles alter column scope set default 'real_estate';
update public.re_board_roles set scope = 'real_estate' where scope is null;
alter table public.re_board_roles alter column scope set not null;

update public.re_board_roles
set status = case when published then 'published' else 'draft' end
where status is null;
alter table public.re_board_roles alter column status set default 'draft';
alter table public.re_board_roles alter column status set not null;

update public.re_board_roles set sector_tags = '{}'::text[] where sector_tags is null;
alter table public.re_board_roles alter column sector_tags set default '{}'::text[];
alter table public.re_board_roles alter column sector_tags set not null;

update public.re_board_roles set regions = '{}'::text[] where regions is null;
alter table public.re_board_roles alter column regions set default '{}'::text[];
alter table public.re_board_roles alter column regions set not null;

alter table public.re_board_roles alter column city drop not null;
alter table public.re_board_roles alter column asset_class drop not null;
alter table public.re_board_roles alter column contact_name drop not null;
alter table public.re_board_roles alter column contact_email drop not null;
alter table public.re_board_roles alter column contact_phone drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 're_board_roles_posted_by_member_id_fkey'
  ) then
    alter table public.re_board_roles
      add constraint re_board_roles_posted_by_member_id_fkey
      foreign key (posted_by_member_id) references public.members (user_id) on delete set null;
  end if;
end
$$;

alter table public.re_board_roles drop constraint if exists re_board_roles_seat_kind;
alter table public.re_board_roles
  add constraint re_board_roles_seat_kind check (
    seat_kind in ('developer', 'propco', 'company_board', 'ned', 'adviser')
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_scope;
alter table public.re_board_roles
  add constraint re_board_roles_scope check (scope in ('real_estate', 'general'));

alter table public.re_board_roles drop constraint if exists re_board_roles_status;
alter table public.re_board_roles
  add constraint re_board_roles_status check (
    status in ('draft', 'pending_review', 'published', 'closed')
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_kind_scope;
alter table public.re_board_roles
  add constraint re_board_roles_kind_scope check (
    (scope = 'real_estate' and seat_kind in ('developer', 'propco'))
    or (scope = 'general' and seat_kind in ('company_board', 'ned', 'adviser'))
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_real_estate_place;
alter table public.re_board_roles
  add constraint re_board_roles_real_estate_place check (
    scope <> 'real_estate'
    or (
      city is not null
      and asset_class is not null
      and contact_name is not null
      and contact_email is not null
      and contact_phone is not null
    )
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_company_contacts;
alter table public.re_board_roles
  add constraint re_board_roles_company_contacts check (
    not (
      scope = 'general'
      and posted_by_member_id is null
      and seat_kind = 'company_board'
    )
    or (
      contact_name is not null
      and pg_catalog.char_length(pg_catalog.btrim(contact_name)) between 1 and 120
      and contact_email is not null
      and pg_catalog.lower(contact_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and contact_phone is not null
      and pg_catalog.char_length(pg_catalog.btrim(contact_phone)) between 1 and 40
    )
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_general_published_tags;
alter table public.re_board_roles
  add constraint re_board_roles_general_published_tags check (
    status <> 'published'
    or scope <> 'general'
    or pg_catalog.cardinality(sector_tags) > 0
    or pg_catalog.cardinality(regions) > 0
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_sector_tags_ok;
alter table public.re_board_roles
  add constraint re_board_roles_sector_tags_ok check (
    private.board_seat_list_allowed(sector_tags, private.profile_sector_tags(), 16)
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_regions_ok;
alter table public.re_board_roles
  add constraint re_board_roles_regions_ok check (
    private.board_seat_list_allowed(regions, private.board_seat_regions(), 13)
  );

alter table public.re_board_roles drop constraint if exists re_board_roles_published_matches_status;
alter table public.re_board_roles
  add constraint re_board_roles_published_matches_status check (
    published = (status = 'published')
  );

create or replace function private.re_board_roles_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is null then
    new.status := case when coalesce(new.published, false) then 'published' else 'draft' end;
  end if;
  if new.scope is null then
    new.scope := 'real_estate';
  end if;
  if new.sector_tags is null then
    new.sector_tags := '{}'::text[];
  end if;
  if new.regions is null then
    new.regions := '{}'::text[];
  end if;
  new.published := new.status = 'published';
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.re_board_roles_sync_status() from public, anon, authenticated;

drop trigger if exists re_board_roles_sync_status on public.re_board_roles;
create trigger re_board_roles_sync_status
  before insert or update on public.re_board_roles
  for each row execute function private.re_board_roles_sync_status();

create index if not exists re_board_roles_general_status_idx
  on public.re_board_roles (status, created_at desc)
  where scope = 'general';

alter table public.re_board_role_intros
  add column if not exists note text,
  add column if not exists decided_by_role text;

alter table public.re_board_role_intros drop constraint if exists re_board_role_intros_note_clear;
alter table public.re_board_role_intros
  add constraint re_board_role_intros_note_clear check (
    note is null
    or (
      pg_catalog.char_length(note) <= 400
      and pg_catalog.strpos(note, '@') = 0
      and not private.board_seat_has_phone(note)
    )
  );

alter table public.re_board_role_intros drop constraint if exists re_board_role_intros_decided_by_role;
alter table public.re_board_role_intros
  add constraint re_board_role_intros_decided_by_role check (
    decided_by_role is null or decided_by_role in ('admin', 'poster')
  );

create table public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  kind text not null,
  ref_id uuid,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  constraint member_notifications_kind check (
    kind in ('board_seat_match', 'board_seat_applicant', 'message', 'tracker_reminder')
  ),
  constraint member_notifications_title_len check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 120
  ),
  constraint member_notifications_body_len check (
    pg_catalog.char_length(body) <= 280
  )
);

alter table public.member_notifications enable row level security;
alter table public.member_notifications force row level security;

revoke all on table public.member_notifications from public, anon, authenticated, service_role;
grant select on table public.member_notifications to authenticated;
grant update (read_at) on table public.member_notifications to authenticated;

comment on table public.member_notifications is
  'In-app notes for the signed-in member. No staff policy. Insert only from a security definer function.';

create or replace function private.member_notifications_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(pg_catalog.current_setting('ba.member_notification_write', true), '') is distinct from 'on' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.member_id is distinct from old.member_id
     or new.kind is distinct from old.kind
     or new.ref_id is distinct from old.ref_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.member_notifications_guard() from public, anon, authenticated;

drop trigger if exists member_notifications_guard on public.member_notifications;
create trigger member_notifications_guard
  before insert or update on public.member_notifications
  for each row execute function private.member_notifications_guard();

drop policy if exists member_notifications_select_own on public.member_notifications;
create policy member_notifications_select_own
  on public.member_notifications
  for select
  to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists member_notifications_update_own on public.member_notifications;
create policy member_notifications_update_own
  on public.member_notifications
  for update
  to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

create index if not exists member_notifications_unread_idx
  on public.member_notifications (member_id, created_at desc)
  where read_at is null;

create table public.member_notification_prefs (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  board_seat_nudges boolean not null default true
);

alter table public.member_notification_prefs enable row level security;
alter table public.member_notification_prefs force row level security;

revoke all on table public.member_notification_prefs from public, anon, authenticated, service_role;
grant select, insert, update on table public.member_notification_prefs to authenticated;

comment on table public.member_notification_prefs is
  'Member opt-out for board seat notes. Missing row means nudges stay on. No staff policy.';

create or replace function private.member_notification_prefs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.member_notification_prefs_guard() from public, anon, authenticated;

drop trigger if exists member_notification_prefs_guard on public.member_notification_prefs;
create trigger member_notification_prefs_guard
  before update on public.member_notification_prefs
  for each row execute function private.member_notification_prefs_guard();

drop policy if exists member_notification_prefs_select_own on public.member_notification_prefs;
create policy member_notification_prefs_select_own
  on public.member_notification_prefs
  for select
  to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists member_notification_prefs_insert_own on public.member_notification_prefs;
create policy member_notification_prefs_insert_own
  on public.member_notification_prefs
  for insert
  to authenticated
  with check (member_id = (select auth.uid()));

drop policy if exists member_notification_prefs_update_own on public.member_notification_prefs;
create policy member_notification_prefs_update_own
  on public.member_notification_prefs
  for update
  to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

create or replace function private.raise_member_notification(
  p_member uuid,
  p_kind text,
  p_ref uuid,
  p_title text,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_id uuid;
begin
  if p_member is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_kind not in ('board_seat_match', 'board_seat_applicant', 'message', 'tracker_reminder') then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;
  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  v_body := coalesce(p_body, '');
  if pg_catalog.char_length(v_title) < 1 or pg_catalog.char_length(v_title) > 120 then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_body) > 280 then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;
  if pg_catalog.strpos(v_title, '@') > 0 or pg_catalog.strpos(v_body, '@') > 0 then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;
  if private.board_seat_has_phone(v_title) or private.board_seat_has_phone(v_body) then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;

  perform set_config('ba.member_notification_write', 'on', true);
  insert into public.member_notifications (member_id, kind, ref_id, title, body)
  values (p_member, p_kind, p_ref, v_title, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.raise_member_notification(uuid, text, uuid, text, text)
  from public, anon, authenticated;

create or replace function private.prepare_general_seat(
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_title text;
  v_sector text;
  v_capacity text;
  v_org text;
  v_terms text;
  v_name text;
  v_email text;
  v_phone text;
  v_narrative text;
  v_tags text[];
  v_regions text[];
begin
  v_kind := pg_catalog.btrim(coalesce(p_seat_kind, ''));
  if v_kind not in ('company_board', 'ned', 'adviser') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  v_sector := pg_catalog.btrim(coalesce(p_sector, ''));
  v_capacity := pg_catalog.btrim(coalesce(p_capacity, ''));
  v_org := pg_catalog.btrim(coalesce(p_organisation_name, ''));
  v_terms := pg_catalog.btrim(coalesce(p_terms, ''));
  v_narrative := pg_catalog.btrim(coalesce(p_narrative, ''));
  v_name := nullif(pg_catalog.btrim(coalesce(p_contact_name, '')), '');
  v_email := nullif(pg_catalog.btrim(coalesce(p_contact_email, '')), '');
  v_phone := nullif(pg_catalog.btrim(coalesce(p_contact_phone, '')), '');
  v_tags := coalesce(p_sector_tags, '{}'::text[]);
  v_regions := coalesce(p_regions, '{}'::text[]);

  if pg_catalog.char_length(v_title) < 1 or pg_catalog.char_length(v_title) > 160
     or pg_catalog.char_length(v_sector) < 1 or pg_catalog.char_length(v_sector) > 120
     or pg_catalog.char_length(v_capacity) < 1 or pg_catalog.char_length(v_capacity) > 160
     or pg_catalog.char_length(v_org) < 1 or pg_catalog.char_length(v_org) > 200
     or pg_catalog.char_length(v_terms) < 1 or pg_catalog.char_length(v_terms) > 400
     or pg_catalog.char_length(v_narrative) < 1 or pg_catalog.char_length(v_narrative) > 2000
  then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if pg_catalog.strpos(v_title, '@') > 0
     or pg_catalog.strpos(v_sector, '@') > 0
     or pg_catalog.strpos(v_capacity, '@') > 0
     or pg_catalog.strpos(v_org, '@') > 0
     or pg_catalog.strpos(v_terms, '@') > 0
     or pg_catalog.strpos(v_narrative, '@') > 0
     or pg_catalog.strpos(pg_catalog.lower(v_title), pg_catalog.lower(v_org)) > 0
     or pg_catalog.strpos(pg_catalog.lower(v_sector), pg_catalog.lower(v_org)) > 0
     or pg_catalog.strpos(pg_catalog.lower(v_capacity), pg_catalog.lower(v_org)) > 0
  then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if private.board_seat_has_phone(v_title)
     or private.board_seat_has_phone(v_sector)
     or private.board_seat_has_phone(v_capacity)
     or private.board_seat_has_phone(v_terms)
     or private.board_seat_has_phone(v_narrative)
  then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if not private.board_seat_list_allowed(v_tags, private.profile_sector_tags(), 16)
     or not private.board_seat_list_allowed(v_regions, private.board_seat_regions(), 13)
  then
    raise exception 'invalid_tags' using errcode = '22023';
  end if;

  if v_kind = 'company_board' and (v_name is null or v_email is null or v_phone is null) then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;
  if v_email is not null and pg_catalog.lower(v_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;
  if v_name is not null and (
    pg_catalog.char_length(v_name) > 120 or pg_catalog.strpos(v_name, '@') > 0
  ) then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;
  if v_phone is not null and (
    pg_catalog.char_length(v_phone) > 40 or pg_catalog.strpos(v_phone, '@') > 0
  ) then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'seat_kind', v_kind,
    'title', v_title,
    'sector', v_sector,
    'capacity', v_capacity,
    'sector_tags', pg_catalog.to_jsonb(v_tags),
    'regions', pg_catalog.to_jsonb(v_regions),
    'organisation_name', v_org,
    'terms', v_terms,
    'contact_name', v_name,
    'contact_email', v_email,
    'contact_phone', v_phone,
    'narrative', v_narrative
  );
end;
$$;

revoke all on function private.prepare_general_seat(
  text, text, text, text, text[], text[], text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function private.board_seat_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.array_agg(item)
      from pg_catalog.jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb)) as item
    ),
    '{}'::text[]
  );
$$;

revoke all on function private.board_seat_text_array(jsonb) from public, anon, authenticated;

-- member_board_role_feed_v2_begin
create or replace function private.re_member_board_role_feed(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  real_n int;
  show_demo boolean;
begin
  if auth.uid() is distinct from p_member
     or not exists (
       select 1
       from public.members m
       where m.user_id = p_member
         and m.seat in ('ksa', 'intl')
         and m.status in ('invited', 'active')
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.re_board_roles
  where is_demo = false
    and published = true
    and scope = 'real_estate';

  show_demo := private.demo_rows_visible('re_board_roles', real_n);

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        r.sort_order,
        r.created_at,
        case
          when i.status = 'approved' then private.re_board_role_open_json(
            r.id,
            r.is_demo,
            r.seat_kind,
            r.title,
            r.sector,
            r.capacity,
            r.city,
            r.asset_class,
            r.organisation_name,
            r.terms,
            r.contact_name,
            r.contact_email,
            r.contact_phone,
            r.narrative
          )
          else private.re_board_role_locked_json(
            r.id,
            r.is_demo,
            r.seat_kind,
            r.title,
            r.sector,
            r.capacity,
            r.city,
            r.asset_class,
            i.status
          )
        end as payload
      from public.re_board_roles r
      left join public.re_board_role_intros i
        on i.role_id = r.id
       and i.member_id = p_member
      where r.published
        and r.scope = 'real_estate'
        and (r.is_demo = false or show_demo)
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- member_board_role_feed_v2_end

revoke all on function private.re_member_board_role_feed(uuid) from public, anon, authenticated;

create or replace function private.re_staff_board_role_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        r.sort_order,
        r.created_at,
        private.re_board_role_inventory_json(
          r.id,
          r.is_demo,
          r.seat_kind,
          r.title,
          r.sector,
          r.capacity,
          r.city,
          r.asset_class,
          r.organisation_name,
          r.terms,
          r.contact_name,
          r.contact_email,
          r.contact_phone,
          r.narrative,
          r.published,
          r.sort_order
        ) as payload
      from public.re_board_roles r
      where r.scope = 'real_estate'
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.re_staff_board_role_inventory() from public, anon, authenticated;

create or replace function public.request_re_board_role_intro(p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  visible boolean;
  new_id uuid;
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.seat in ('ksa', 'intl')
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(p_role_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.re_board_roles r
    where r.id = p_role_id
      and r.published
      and r.is_demo = false
      and r.scope = 'real_estate'
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_board_role_intros (role_id, member_id, status)
  values (p_role_id, auth.uid(), 'pending')
  on conflict (role_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  select i.status into current_status
  from public.re_board_role_intros i
  where i.role_id = p_role_id
    and i.member_id = auth.uid();

  return pg_catalog.jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_re_board_role_intro(uuid) from public, anon;
grant execute on function public.request_re_board_role_intro(uuid) to authenticated;

create or replace function public.staff_create_board_seat(
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_clean := private.prepare_general_seat(
    p_seat_kind,
    p_title,
    p_sector,
    p_capacity,
    p_sector_tags,
    p_regions,
    p_organisation_name,
    p_terms,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_narrative
  );

  insert into public.re_board_roles (
    is_demo,
    published,
    scope,
    status,
    seat_kind,
    title,
    sector,
    capacity,
    city,
    asset_class,
    sector_tags,
    regions,
    posted_by_member_id,
    organisation_name,
    terms,
    contact_name,
    contact_email,
    contact_phone,
    narrative,
    sort_order
  ) values (
    false,
    false,
    'general',
    'draft',
    v_clean->>'seat_kind',
    v_clean->>'title',
    v_clean->>'sector',
    v_clean->>'capacity',
    null,
    null,
    private.board_seat_text_array(v_clean->'sector_tags'),
    private.board_seat_text_array(v_clean->'regions'),
    null,
    v_clean->>'organisation_name',
    v_clean->>'terms',
    v_clean->>'contact_name',
    v_clean->>'contact_email',
    v_clean->>'contact_phone',
    v_clean->>'narrative',
    0
  )
  returning id into v_id;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'status', 'draft');
end;
$$;

revoke all on function public.staff_create_board_seat(
  text, text, text, text, text[], text[], text, text, text, text, text, text
) from public, anon;
grant execute on function public.staff_create_board_seat(
  text, text, text, text, text[], text[], text, text, text, text, text, text
) to authenticated;

create or replace function public.staff_edit_board_seat(
  p_id uuid,
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select r.status into v_status
  from public.re_board_roles r
  where r.id = p_id
    and r.scope = 'general';
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'closed' then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  v_clean := private.prepare_general_seat(
    p_seat_kind,
    p_title,
    p_sector,
    p_capacity,
    p_sector_tags,
    p_regions,
    p_organisation_name,
    p_terms,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_narrative
  );

  update public.re_board_roles
  set seat_kind = v_clean->>'seat_kind',
      title = v_clean->>'title',
      sector = v_clean->>'sector',
      capacity = v_clean->>'capacity',
      sector_tags = private.board_seat_text_array(v_clean->'sector_tags'),
      regions = private.board_seat_text_array(v_clean->'regions'),
      organisation_name = v_clean->>'organisation_name',
      terms = v_clean->>'terms',
      contact_name = v_clean->>'contact_name',
      contact_email = v_clean->>'contact_email',
      contact_phone = v_clean->>'contact_phone',
      narrative = v_clean->>'narrative'
  where id = p_id
    and scope = 'general'
    and status = v_status;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end;
$$;

revoke all on function public.staff_edit_board_seat(
  uuid, text, text, text, text, text[], text[], text, text, text, text, text, text
) from public, anon;
grant execute on function public.staff_edit_board_seat(
  uuid, text, text, text, text, text[], text[], text, text, text, text, text, text
) to authenticated;

create or replace function public.staff_publish_board_seat(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.re_board_roles%rowtype;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_row
  from public.re_board_roles r
  where r.id = p_id
    and r.scope = 'general';
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('draft', 'pending_review') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(v_row.sector_tags) = 0
     and pg_catalog.cardinality(v_row.regions) = 0
  then
    raise exception 'invalid_tags' using errcode = '22023';
  end if;

  update public.re_board_roles
  set status = 'published'
  where id = p_id
    and scope = 'general'
    and status in ('draft', 'pending_review');

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'id', p_id, 'status', 'published');
end;
$$;

revoke all on function public.staff_publish_board_seat(uuid) from public, anon;
grant execute on function public.staff_publish_board_seat(uuid) to authenticated;

create or replace function public.staff_close_board_seat(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select r.status into v_status
  from public.re_board_roles r
  where r.id = p_id
    and r.scope = 'general';
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'closed' then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  update public.re_board_roles
  set status = 'closed'
  where id = p_id
    and scope = 'general'
    and status = v_status;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'id', p_id, 'status', 'closed');
end;
$$;

revoke all on function public.staff_close_board_seat(uuid) from public, anon;
grant execute on function public.staff_close_board_seat(uuid) to authenticated;

create or replace function public.staff_list_board_seats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by created_at desc)
    from (
      select
        r.created_at,
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'is_demo', r.is_demo,
          'seat_kind', r.seat_kind,
          'scope', r.scope,
          'status', r.status,
          'title', r.title,
          'sector', r.sector,
          'capacity', r.capacity,
          'sector_tags', r.sector_tags,
          'regions', r.regions,
          'organisation_name', r.organisation_name,
          'terms', r.terms,
          'contact_name', r.contact_name,
          'contact_email', r.contact_email,
          'contact_phone', r.contact_phone,
          'narrative', r.narrative,
          'posted_by_member_id', r.posted_by_member_id,
          'poster_name', case
            when r.posted_by_member_id is null then null
            else coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member')
          end,
          'applicant_count', (
            select count(*)::int
            from public.re_board_role_intros i
            where i.role_id = r.id
          )
        ) as payload
      from public.re_board_roles r
      left join public.profiles p on p.user_id = r.posted_by_member_id
      where r.scope = 'general'
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_board_seats() from public, anon;
grant execute on function public.staff_list_board_seats() to authenticated;

create or replace function public.staff_list_board_seat_applicants(p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_rec record;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.re_board_roles r
    where r.id = p_role_id
      and r.scope = 'general'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for v_rec in
    select
      i.id,
      i.member_id,
      i.status,
      coalesce(i.note, '') as note,
      coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member') as member_name,
      coalesce(p.headline, '') as headline,
      coalesce(p.company, '') as company
    from public.re_board_role_intros i
    left join public.profiles p on p.user_id = i.member_id
    where i.role_id = p_role_id
    order by i.requested_at
  loop
    perform private.log_staff_access(auth.uid(), v_rec.member_id, 'board_seat_applicant', v_rec.id, 'read');
    v_rows := v_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_rec.id,
        'member_name', v_rec.member_name,
        'headline', v_rec.headline,
        'company', v_rec.company,
        'note', v_rec.note,
        'status', v_rec.status
      )
    );
  end loop;

  return v_rows;
end;
$$;

revoke all on function public.staff_list_board_seat_applicants(uuid) from public, anon;
grant execute on function public.staff_list_board_seat_applicants(uuid) to authenticated;

create or replace function public.my_unread_notification()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.jsonb_build_object(
        'id', n.id,
        'kind', n.kind,
        'title', n.title,
        'body', n.body,
        'created_at', n.created_at
      )
      from public.member_notifications n
      where n.member_id = auth.uid()
        and n.read_at is null
      order by n.created_at desc
      limit 1
    ),
    'null'::jsonb
  );
$$;

revoke all on function public.my_unread_notification() from public, anon;
grant execute on function public.my_unread_notification() to authenticated;
