-- Daily brief publish gate.
-- Apply after 20270111120000_application_withdrawn_closed_retention.sql.
-- Does not send mail. Does not schedule a job. Does not call retention sweep.
-- Factory does not apply this file.
-- Members read a brief only when it is published and both switches are on.
-- A generator write cannot publish and cannot replace an approved or published day.

alter table public.market_brief_days
  add column if not exists publish_status text not null default 'draft';

alter table public.market_brief_days drop constraint if exists market_brief_days_publish_status_check;
alter table public.market_brief_days
  add constraint market_brief_days_publish_status_check
  check (publish_status in ('draft', 'approved', 'published'));

comment on column public.market_brief_days.publish_status is
  'draft, then approved, then published. Members see published rows only.';

create or replace function private.market_brief_public_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_group text;
  v_headline text;
  v_summary text;
  v_outlet text;
  v_url text;
  v_dated text;
  v_deals integer := 0;
  v_regulation integer := 0;
  v_leadership integer := 0;
  v_count integer := 0;
begin
  for v_item in
    select listed.item
    from pg_catalog.jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as listed(item)
    order by
      case listed.item->>'group'
        when 'deals' then 1
        when 'regulation' then 2
        when 'leadership' then 3
        else 9
      end,
      listed.item->>'dated' desc
  loop
    exit when v_count >= 8;
    v_group := v_item->>'group';
    if v_group = 'deals' then
      if v_deals >= 3 then
        continue;
      end if;
    elsif v_group = 'regulation' then
      if v_regulation >= 3 then
        continue;
      end if;
    elsif v_group = 'leadership' then
      if v_leadership >= 3 then
        continue;
      end if;
    else
      continue;
    end if;
    v_headline := pg_catalog.btrim(coalesce(v_item->>'headline', ''));
    v_summary := pg_catalog.btrim(coalesce(v_item->>'summary', ''));
    v_outlet := pg_catalog.btrim(coalesce(v_item->>'outlet', ''));
    v_url := coalesce(v_item->>'url', '');
    v_dated := pg_catalog.left(coalesce(v_item->>'dated', ''), 10);
    if pg_catalog.char_length(v_headline) < 1 or pg_catalog.char_length(v_headline) > 90 then
      continue;
    end if;
    if pg_catalog.char_length(v_summary) < 1 or pg_catalog.char_length(v_summary) > 300 then
      continue;
    end if;
    if pg_catalog.char_length(v_outlet) < 1 or pg_catalog.char_length(v_outlet) > 120 then
      continue;
    end if;
    if v_url !~ '^https://' or pg_catalog.strpos(v_url, '@') > 0 then
      continue;
    end if;
    if v_dated !~ '^\d{4}-\d{2}-\d{2}$' then
      continue;
    end if;
    if pg_catalog.strpos(v_headline, '@') > 0 or pg_catalog.strpos(v_summary, '@') > 0 then
      continue;
    end if;
    if pg_catalog.strpos(v_headline, pg_catalog.chr(8212)) > 0
       or pg_catalog.strpos(v_headline, pg_catalog.chr(8211)) > 0
       or pg_catalog.strpos(v_summary, pg_catalog.chr(8212)) > 0
       or pg_catalog.strpos(v_summary, pg_catalog.chr(8211)) > 0 then
      continue;
    end if;
    if v_group = 'deals' then
      v_deals := v_deals + 1;
    elsif v_group = 'regulation' then
      v_regulation := v_regulation + 1;
    else
      v_leadership := v_leadership + 1;
    end if;
    v_count := v_count + 1;
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'group', v_group,
      'headline', v_headline,
      'summary', v_summary,
      'outlet', v_outlet,
      'url', v_url,
      'dated', v_dated
    ));
  end loop;
  return v_out;
end;
$$;

revoke all on function private.market_brief_public_items(jsonb) from public, anon, authenticated;

create or replace function private.market_brief_guard_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.publish_status := 'draft';
    return new;
  end if;
  if new.publish_status is distinct from old.publish_status then
    if not (
      (old.publish_status = 'draft' and new.publish_status = 'approved')
      or (old.publish_status = 'approved' and new.publish_status = 'published')
    ) then
      raise exception 'invalid_transition' using errcode = '22023';
    end if;
    if old.publish_status = 'draft' and new.publish_status = 'approved' then
      if new.status is distinct from 'ok'
         or pg_catalog.jsonb_array_length(private.market_brief_public_items(new.items)) < 1 then
        raise exception 'invalid_items' using errcode = '22023';
      end if;
    end if;
  end if;
  if old.publish_status <> 'draft' then
    new.items := old.items;
    new.status := old.status;
    new.generated_at := old.generated_at;
    new.model_id := old.model_id;
  end if;
  return new;
end;
$$;

revoke all on function private.market_brief_guard_day() from public, anon, authenticated;

drop trigger if exists market_brief_days_guard on public.market_brief_days;
create trigger market_brief_days_guard
  before insert or update on public.market_brief_days
  for each row execute function private.market_brief_guard_day();

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
  v_public jsonb;
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
    and d.publish_status = 'published'
    and pg_catalog.jsonb_typeof(d.items) = 'array'
    and pg_catalog.jsonb_array_length(d.items) > 0
  order by d.brief_date desc
  limit 1;
  if v_date is null then
    return 'null'::jsonb;
  end if;
  v_public := private.market_brief_public_items(v_items);
  if pg_catalog.jsonb_array_length(v_public) < 1 then
    return 'null'::jsonb;
  end if;
  return pg_catalog.jsonb_build_object(
    'brief_date', v_date,
    'generated_at', v_at,
    'items', v_public
  );
end;
$$;

revoke all on function public.market_brief_for_member() from public, anon;
grant execute on function public.market_brief_for_member() to authenticated;

comment on function public.market_brief_for_member() is
  'Latest published brief for an admitted member, and only when both switches are on. No model id.';

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
    'publish_status', d.publish_status,
    'generated_at', d.generated_at,
    'item_count', pg_catalog.jsonb_array_length(private.market_brief_public_items(d.items)),
    'items', private.market_brief_public_items(d.items)
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

create or replace function public.market_brief_set_publish(p_brief_date date, p_next text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publish text;
  v_status text;
  v_items jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_next is distinct from 'approved' and p_next is distinct from 'published' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select d.publish_status, d.status, d.items
    into v_publish, v_status, v_items
  from public.market_brief_days d
  where d.brief_date = p_brief_date
  for update;
  if v_publish is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_next = 'approved' and v_publish is distinct from 'draft' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_next = 'published' and v_publish is distinct from 'approved' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_next = 'approved' and (
    v_status is distinct from 'ok'
    or pg_catalog.jsonb_array_length(private.market_brief_public_items(v_items)) < 1
  ) then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  update public.market_brief_days
  set publish_status = p_next
  where brief_date = p_brief_date;
end;
$$;

revoke all on function public.market_brief_set_publish(date, text) from public, anon;
grant execute on function public.market_brief_set_publish(date, text) to authenticated;

comment on function public.market_brief_set_publish(date, text) is
  'aal2 staff move a brief from draft to approved, or from approved to published.';
