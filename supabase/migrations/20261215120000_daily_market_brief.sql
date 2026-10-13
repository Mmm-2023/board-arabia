-- Daily market brief outlets, days, and settings.
-- Apply after 20261214120000_digest_review_tiers.sql.
-- Do not apply this file from the app, from CI, or against a live database from this PR.
-- No personal data. Days are kept 90 days by market-brief-daily on a real run.
-- The retention sweep is not changed here.
-- model_id stays in the table. No RPC returns it.
-- enabled and members_visible default to false.

create table public.market_brief_settings (
  id smallint primary key default 1,
  enabled boolean not null default false,
  members_visible boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint market_brief_settings_one_row check (id = 1)
);

alter table public.market_brief_settings enable row level security;
alter table public.market_brief_settings force row level security;
revoke all on table public.market_brief_settings from public, anon, authenticated;

comment on table public.market_brief_settings is
  'One row. Members see a brief only when enabled and members_visible are both true.';

insert into public.market_brief_settings (id, enabled, members_visible)
values (1, false, false);

create table public.market_brief_outlets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null,
  domain text not null,
  path_prefix text,
  enabled boolean not null default true,
  sort_order integer not null,
  updated_by uuid,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint market_brief_outlets_domain_key unique (domain),
  constraint market_brief_outlets_name_check check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120
    and pg_catalog.strpos(name, '@') = 0
  ),
  constraint market_brief_outlets_domain_check check (
    domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and domain !~ 'xn--'
    and domain !~ '^[0-9.]+$'
  ),
  constraint market_brief_outlets_prefix_check check (
    path_prefix is null
    or (
      path_prefix ~ '^/[a-z0-9][a-z0-9/_-]{0,60}$'
      and path_prefix !~ '\.\.'
      and pg_catalog.right(path_prefix, 1) <> '/'
    )
  )
);

alter table public.market_brief_outlets enable row level security;
alter table public.market_brief_outlets force row level security;
revoke all on table public.market_brief_outlets from public, anon, authenticated;

comment on table public.market_brief_outlets is
  'Admin outlet allowlist for the daily market brief. Clients have no table grant.';

insert into public.market_brief_outlets (name, domain, path_prefix, enabled, sort_order)
values
  ('Saudi Press Agency', 'spa.gov.sa', null, true, 1),
  ('Argaam', 'argaam.com', '/en', true, 2),
  ('Arab News', 'arabnews.com', null, true, 3),
  ('Saudi Gazette', 'saudigazette.com.sa', null, true, 4),
  ('Asharq Business with Bloomberg', 'asharqbusiness.com', '/en', true, 5),
  ('Zawya', 'zawya.com', null, true, 6),
  ('MEED', 'meed.com', null, true, 7),
  ('Saudi Exchange (Tadawul) announcements', 'saudiexchange.sa', null, true, 8),
  ('Capital Market Authority', 'cma.org.sa', null, true, 9),
  ('Ministry of Investment', 'misa.gov.sa', null, true, 10),
  ('Vision 2030', 'vision2030.gov.sa', null, true, 11);

create table public.market_brief_days (
  brief_date date primary key,
  status text not null,
  items jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default pg_catalog.now(),
  model_id text,
  constraint market_brief_days_status_check check (
    status in ('ok', 'not_configured', 'failed', 'empty')
  )
);

alter table public.market_brief_days enable row level security;
alter table public.market_brief_days force row level security;
revoke all on table public.market_brief_days from public, anon, authenticated;

comment on table public.market_brief_days is
  'One brief per UTC date. No personal data. Kept 90 days.';

comment on column public.market_brief_days.model_id is
  'Server-side only. Not returned by member or admin RPCs.';

grant select on table public.market_brief_outlets to service_role;
grant select, insert, update, delete on table public.market_brief_days to service_role;

create or replace function public.market_brief_for_member()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_on boolean;
  v_visible boolean;
  v_date date;
  v_at timestamptz;
  v_items jsonb;
begin
  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    return 'null'::jsonb;
  end if;
  select s.enabled, s.members_visible
    into v_on, v_visible
  from public.market_brief_settings s
  where s.id = 1;
  if coalesce(v_on, false) is not true or coalesce(v_visible, false) is not true then
    return 'null'::jsonb;
  end if;
  select d.brief_date, d.generated_at, d.items
    into v_date, v_at, v_items
  from public.market_brief_days d
  where d.status = 'ok'
    and pg_catalog.jsonb_typeof(d.items) = 'array'
    and pg_catalog.jsonb_array_length(d.items) > 0
  order by d.brief_date desc
  limit 1;
  if v_date is null then
    return 'null'::jsonb;
  end if;
  return pg_catalog.jsonb_build_object(
    'brief_date', v_date,
    'generated_at', v_at,
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'group', item->>'group',
        'summary', item->>'summary',
        'outlet', item->>'outlet',
        'url', item->>'url',
        'dated', item->>'dated'
      ))
      from pg_catalog.jsonb_array_elements(v_items) item
      where item->>'group' in ('deals', 'regulation', 'leadership')
        and coalesce(item->>'summary', '') <> ''
        and coalesce(item->>'url', '') <> ''
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.market_brief_for_member() from public, anon;
grant execute on function public.market_brief_for_member() to authenticated;

comment on function public.market_brief_for_member() is
  'Latest ok brief for an admitted member, and only when both switches are on. No model id.';

create or replace function public.market_brief_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_visible boolean;
  v_outlets jsonb;
  v_latest jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.enabled, s.members_visible
    into v_enabled, v_visible
  from public.market_brief_settings s
  where s.id = 1;
  select coalesce(pg_catalog.jsonb_agg(row_json), '[]'::jsonb)
    into v_outlets
  from (
    select pg_catalog.jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'domain', o.domain,
      'path_prefix', o.path_prefix,
      'enabled', o.enabled,
      'sort_order', o.sort_order
    ) as row_json
    from public.market_brief_outlets o
    order by o.sort_order, o.name
  ) listed;
  select pg_catalog.jsonb_build_object(
    'brief_date', d.brief_date,
    'status', d.status,
    'generated_at', d.generated_at,
    'item_count', case
      when pg_catalog.jsonb_typeof(d.items) = 'array' then pg_catalog.jsonb_array_length(d.items)
      else 0
    end,
    'items', case
      when pg_catalog.jsonb_typeof(d.items) = 'array' then coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'group', item->>'group',
          'summary', item->>'summary',
          'outlet', item->>'outlet',
          'url', item->>'url',
          'dated', item->>'dated'
        ))
        from pg_catalog.jsonb_array_elements(d.items) item
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
    into v_latest
  from public.market_brief_days d
  order by d.brief_date desc
  limit 1;
  return pg_catalog.jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'members_visible', coalesce(v_visible, false),
    'outlets', coalesce(v_outlets, '[]'::jsonb),
    'latest', v_latest
  );
end;
$$;

revoke all on function public.market_brief_admin_state() from public, anon;
grant execute on function public.market_brief_admin_state() to authenticated;

comment on function public.market_brief_admin_state() is
  'aal2 staff read outlets, switches, and the latest brief. No model id.';

create or replace function public.market_brief_save_settings(
  p_enabled boolean,
  p_members_visible boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.market_brief_settings
  set enabled = coalesce(p_enabled, false),
      members_visible = coalesce(p_members_visible, false),
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id = 1;
end;
$$;

revoke all on function public.market_brief_save_settings(boolean, boolean) from public, anon;
grant execute on function public.market_brief_save_settings(boolean, boolean) to authenticated;

create or replace function public.market_brief_save_outlet(
  p_id uuid,
  p_name text,
  p_domain text,
  p_path_prefix text,
  p_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_domain text;
  v_prefix text;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  if pg_catalog.char_length(v_name) < 1
     or pg_catalog.char_length(v_name) > 120
     or pg_catalog.strpos(v_name, '@') > 0 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  v_domain := pg_catalog.lower(pg_catalog.btrim(coalesce(p_domain, '')));
  v_domain := pg_catalog.regexp_replace(v_domain, '\.+$', '');
  if v_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
     or v_domain ~ 'xn--'
     or v_domain ~ '^[0-9.]+$'
     or pg_catalog.char_length(v_domain) > 253 then
    raise exception 'invalid_domain' using errcode = '22023';
  end if;
  if p_path_prefix is null or pg_catalog.btrim(p_path_prefix) = '' then
    v_prefix := null;
  else
    v_prefix := pg_catalog.btrim(p_path_prefix);
    if v_prefix !~ '^/[a-z0-9][a-z0-9/_-]{0,60}$'
       or v_prefix ~ '\.\.'
       or pg_catalog.right(v_prefix, 1) = '/'
       or pg_catalog.strpos(v_prefix, '//') > 0 then
      raise exception 'invalid_prefix' using errcode = '22023';
    end if;
  end if;
  if exists (
    select 1
    from public.market_brief_outlets o
    where o.domain = v_domain
      and (p_id is null or o.id is distinct from p_id)
  ) then
    raise exception 'domain_taken' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.market_brief_outlets (
      name, domain, path_prefix, enabled, sort_order, updated_by, updated_at
    )
    values (
      v_name,
      v_domain,
      v_prefix,
      coalesce(p_enabled, true),
      coalesce((select pg_catalog.max(sort_order) + 1 from public.market_brief_outlets), 1),
      auth.uid(),
      pg_catalog.now()
    )
    returning id into v_id;
    return v_id;
  end if;
  update public.market_brief_outlets
  set name = v_name,
      domain = v_domain,
      path_prefix = v_prefix,
      enabled = coalesce(p_enabled, enabled),
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.market_brief_save_outlet(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.market_brief_save_outlet(uuid, text, text, text, boolean) to authenticated;

create or replace function public.market_brief_reorder_outlets(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_count := coalesce(pg_catalog.array_length(p_ids, 1), 0);
  if v_count < 1
     or (select count(*) from public.market_brief_outlets) <> v_count
     or (select count(distinct incoming.id) from pg_catalog.unnest(p_ids) as incoming(id)) <> v_count
     or exists (
       select 1
       from pg_catalog.unnest(p_ids) as incoming(id)
       where not exists (
         select 1 from public.market_brief_outlets o where o.id = incoming.id
       )
     ) then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  update public.market_brief_outlets o
  set sort_order = incoming.ord::integer,
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  from (
    select id, ord
    from pg_catalog.unnest(p_ids) with ordinality as listed(id, ord)
  ) incoming
  where o.id = incoming.id;
end;
$$;

revoke all on function public.market_brief_reorder_outlets(uuid[]) from public, anon;
grant execute on function public.market_brief_reorder_outlets(uuid[]) to authenticated;
