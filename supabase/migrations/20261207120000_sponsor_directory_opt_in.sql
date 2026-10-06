-- Sponsor directory access is member opt-in.
-- Apply this file only, and only after 20261206120000.
-- Do not apply it from the app, from CI, or against a live database from this PR.
-- show_card_to_sponsors defaults to false, which backfills existing rows.
-- A second run does not clear a later choice.
-- The member sets the column only through set_show_card_to_sponsors, which
-- updates auth.uid() and no other row.
-- Anon and authenticated have no privilege on the column.
-- No new table. public.members already has row security enabled and forced.
-- A sponsor sees another member's card only when that member opted in and is
-- not directory_hidden. The signed-in sponsor still sees their own card.
-- Members, and aal2 staff, keep the directory they already had.
-- Sample directory cards stay for members and staff. A sponsor does not receive them.

alter table public.members
  add column if not exists show_card_to_sponsors boolean not null default false;

update public.members
set show_card_to_sponsors = false
where show_card_to_sponsors is null;

comment on column public.members.show_card_to_sponsors is
  'When true, a sponsor may see this member card. Default false. Set only by set_show_card_to_sponsors for auth.uid().';

revoke all (show_card_to_sponsors) on table public.members from public, anon, authenticated;

create or replace function private.caller_sees_member_card(p_member pg_catalog.uuid)
returns pg_catalog.bool
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_member is not null
    and (
      private.is_staff()
      or not private.is_sponsor(auth.uid())
      or p_member = auth.uid()
      or exists (
        select 1
        from public.members m
        where m.user_id = p_member
          and m.show_card_to_sponsors
          and coalesce(m.directory_hidden, false) = false
      )
    );
$$;

revoke all on function private.caller_sees_member_card(uuid) from public, anon;
grant execute on function private.caller_sees_member_card(uuid) to authenticated;

comment on function private.caller_sees_member_card(uuid) is
  'True for members and aal2 staff. A sponsor sees self, or a member who opted in and is not directory_hidden.';

create or replace function public.set_show_card_to_sponsors(p_show pg_catalog.bool)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_show is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.members
  set show_card_to_sponsors = p_show
  where user_id = auth.uid()
    and status in ('invited', 'active');

  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object('show_card_to_sponsors', p_show);
end;
$$;

revoke all on function public.set_show_card_to_sponsors(boolean) from public, anon;
grant execute on function public.set_show_card_to_sponsors(boolean) to authenticated;

comment on function public.set_show_card_to_sponsors(boolean) is
  'Sets show_card_to_sponsors on the caller row only. Authenticated members. Not anon.';

create or replace function public.own_directory_visibility()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hidden pg_catalog.bool;
  show_sponsors pg_catalog.bool;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select m.directory_hidden, m.show_card_to_sponsors
    into hidden, show_sponsors
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');

  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'directory_hidden', coalesce(hidden, false),
    'show_card_to_sponsors', coalesce(show_sponsors, false)
  );
end;
$$;

revoke all on function public.own_directory_visibility() from public, anon;
grant execute on function public.own_directory_visibility() to authenticated;

create or replace function public.list_directory()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  real_n pg_catalog.int4;
  show_demo pg_catalog.bool;
begin
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4 into real_n
  from public.members m
  where m.is_demo = false
    and m.status in ('invited', 'active')
    and m.seat in ('ksa', 'intl')
    and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid());

  show_demo := private.demo_rows_visible('directory', real_n);
  if private.is_sponsor(auth.uid()) and not private.is_staff() then
    show_demo := false;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(payload order by demo_flag, sort_order, sort_name)
    from (
      select
        false as demo_flag,
        0 as sort_order,
        pg_catalog.lower(coalesce(p.full_name, '')) as sort_name,
        pg_catalog.jsonb_build_object(
          'id', m.user_id,
          'is_demo', false,
          'full_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'location', coalesce(p.location, ''),
          'sector', coalesce(p.sector_tags[1], ''),
          'sectors', coalesce(pg_catalog.to_jsonb(p.sector_tags), '[]'::pg_catalog.jsonb),
          'vision_themes', coalesce(pg_catalog.to_jsonb(p.vision_themes), '[]'::pg_catalog.jsonb),
          'availability', p.availability,
          'seat', m.seat,
          'preferred_partner', private.is_sponsor(m.user_id),
          'portrait_asset', null,
          'avatar_path', p.avatar_path,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'membership_status', m.status
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
        and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid())
        and private.caller_sees_member_card(m.user_id)
      union all
      select
        true,
        d.sort_order,
        pg_catalog.lower(d.full_name),
        pg_catalog.jsonb_build_object(
          'id', d.id,
          'is_demo', true,
          'full_name', d.full_name,
          'headline', d.headline,
          'company', d.company,
          'location', d.location,
          'sector', d.sector,
          'sectors', pg_catalog.jsonb_build_array(d.sector),
          'vision_themes', coalesce(pg_catalog.to_jsonb(d.vision_themes), '[]'::pg_catalog.jsonb),
          'availability', d.availability,
          'seat', d.seat,
          'preferred_partner', false,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null,
          'avatar_style', 'male',
          'membership_status', null
        )
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;

create or replace function public.search_deal_room_directory(p_query pg_catalog.text)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle pg_catalog.text;
begin
  perform private.active_member(auth.uid());
  needle := pg_catalog.left(coalesce(p_query, ''), 80);
  needle := pg_catalog.regexp_replace(needle, '[%_\\]', '', 'g');
  needle := pg_catalog.btrim(pg_catalog.regexp_replace(needle, '\s+', ' ', 'g'));
  if pg_catalog.char_length(needle) < 2 then
    return '[]'::pg_catalog.jsonb;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', found.user_id,
        'full_name', found.full_name,
        'headline', found.headline,
        'company', found.company,
        'seat', found.seat
      )
      order by found.sort_name
    )
    from (
      select
        m.user_id,
        pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'), 200) as full_name,
        pg_catalog.left(coalesce(p.headline, ''), 160) as headline,
        pg_catalog.left(coalesce(p.company, ''), 200) as company,
        m.seat,
        pg_catalog.lower(coalesce(p.full_name, '')) as sort_name
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status = 'active'
        and m.seat in ('ksa', 'intl', 'sponsor')
        and m.user_id is distinct from auth.uid()
        and private.caller_sees_member_card(m.user_id)
        and (
          coalesce(p.full_name, '') ilike '%' || needle || '%'
          or coalesce(p.headline, '') ilike '%' || needle || '%'
          or coalesce(p.company, '') ilike '%' || needle || '%'
        )
      order by pg_catalog.lower(coalesce(p.full_name, ''))
      limit 8
    ) found
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.search_deal_room_directory(text) from public, anon;
grant execute on function public.search_deal_room_directory(text) to authenticated;

create or replace function public.list_my_intro_suggestions()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id,
      'suggested_id', s.suggested_id,
      'full_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'),
      'headline', coalesce(nullif(pg_catalog.btrim(p.headline), ''), ''),
      'company', coalesce(nullif(pg_catalog.btrim(p.company), ''), ''),
      'location', coalesce(nullif(pg_catalog.btrim(p.location), ''), ''),
      'reason', s.reason,
      'rank', s.rank,
      'avatar_style', coalesce(p.avatar_style, 'male'),
      'avatar_path', p.avatar_path
    ) order by s.rank)
    from public.intro_suggestions s
    join public.profiles p on p.user_id = s.suggested_id
    join public.members suggested on suggested.user_id = s.suggested_id
    where s.member_id = auth.uid()
      and s.iso_year = extract(isoyear from pg_catalog.timezone('UTC', pg_catalog.now()))::pg_catalog.int4
      and s.iso_week = extract(week from pg_catalog.timezone('UTC', pg_catalog.now()))::pg_catalog.int4
      and suggested.is_demo = false
      and suggested.status in ('invited', 'active')
      and suggested.directory_hidden = false
      and private.caller_sees_member_card(s.suggested_id)
      and not private.sample_subject(s.suggested_id)
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.list_my_intro_suggestions() from public, anon;
grant execute on function public.list_my_intro_suggestions() to authenticated;

comment on function public.list_my_intro_suggestions() is
  'Current ISO week suggestions for the signed-in member. Omits suggested members hidden from the directory. A sponsor also only sees members who opted in.';

create or replace function public.list_my_intros()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(payload order by sort_at desc)
    from (
      select
        i.requested_at as sort_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'kind', 'member',
          'direction', case when i.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
          'status', i.status,
          'title', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'),
          'detail', pg_catalog.concat_ws(
            ' · ',
            nullif(pg_catalog.btrim(p.headline), ''),
            nullif(pg_catalog.btrim(p.company), ''),
            nullif(pg_catalog.btrim(p.location), '')
          ),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', case when i.requester_id = auth.uid() then i.target_id else i.requester_id end,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'ask_desk', i.ask_desk,
          'desk_status', i.desk_status,
          'created_at', i.requested_at,
          'decided_at', i.decided_at,
          'meet_due', (
            i.status = 'accepted'
            and i.decided_at is not null
            and i.decided_at <= (pg_catalog.now() - pg_catalog.interval '7 days')
          ),
          'meet_outcome', (
            select o.outcome
            from public.intro_meet_outcomes o
            where o.intro_id = i.id
              and o.member_id = auth.uid()
          )
        ) as payload
      from public.member_intros i
      join public.profiles p
        on p.user_id = case
          when i.requester_id = auth.uid() then i.target_id
          else i.requester_id
        end
      where (i.requester_id = auth.uid() or i.target_id = auth.uid())
        and (
          private.caller_sees_member_card(
            case
              when i.requester_id = auth.uid() then i.target_id
              else i.requester_id
            end
          )
          or i.target_id = auth.uid()
        )

      union all

      select
        i.requested_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'kind', 'mandate',
          'direction', 'outgoing',
          'status', i.status,
          'title', m.sector || ' · ' || m.deal_type,
          'detail', m.geography,
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'created_at', i.requested_at
        )
      from public.mandate_intros i
      join public.mandates m on m.id = i.mandate_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'kind', 'real_estate',
          'direction', 'outgoing',
          'status', i.status,
          'title', o.sector || ' · ' || o.city,
          'detail', o.asset_class,
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'created_at', i.requested_at
        )
      from public.re_opportunity_intros i
      join public.re_opportunities o on o.id = i.opportunity_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'kind', 'partner',
          'direction', 'outgoing',
          'status', i.status,
          'title', t.name,
          'detail', t.city,
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'created_at', i.requested_at
        )
      from public.re_partner_intros i
      join public.re_partners t on t.id = i.partner_id
      where i.member_id = auth.uid()
    ) listed
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.list_my_intros() from public, anon;
grant execute on function public.list_my_intros() to authenticated;

create or replace function public.request_member_intro(
  p_target_id pg_catalog.uuid,
  p_reason pg_catalog.text,
  p_ask_desk pg_catalog.bool default false
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason pg_catalog.text := pg_catalog.btrim(coalesce(p_reason, ''));
  current_status pg_catalog.text;
  v_used pg_catalog.int4;
  v_allowance pg_catalog.int4;
  v_start pg_catalog.timestamptz;
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

  if p_target_id is null or p_target_id = auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(auth.uid()) or private.sample_subject(p_target_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_reason) < 1
    or pg_catalog.char_length(v_reason) > 280
    or position('@' in v_reason) > 0
    or v_reason ~ '\+?[0-9][[:space:]0-9()-]{7,}'
  then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.user_id = p_target_id
      and m.is_demo = false
      and m.status in ('invited', 'active')
      and m.seat in ('ksa', 'intl')
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select i.status into current_status
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.target_id = p_target_id;

  if current_status is not null then
    return pg_catalog.jsonb_build_object('status', current_status);
  end if;

  if private.is_sponsor(auth.uid())
     and not private.is_staff()
     and not private.caller_sees_member_card(p_target_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_start := private.riyadh_month_start(pg_catalog.now());
  select pg_catalog.count(*)::pg_catalog.int4 into v_used
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.requested_at >= v_start
    and i.requested_at < (v_start + pg_catalog.interval '1 month');

  v_allowance := private.intro_allowance_for(auth.uid());
  if v_used >= v_allowance then
    raise exception 'intro_limit' using errcode = 'P0001';
  end if;

  insert into public.member_intros (requester_id, target_id, reason, status, ask_desk)
  values (auth.uid(), p_target_id, v_reason, 'pending', coalesce(p_ask_desk, false));

  return pg_catalog.jsonb_build_object('status', 'pending');
end;
$$;

revoke all on function public.request_member_intro(uuid, text, boolean) from public, anon;
grant execute on function public.request_member_intro(uuid, text, boolean) to authenticated;

drop policy if exists member_avatars_select_peers on storage.objects;
create policy member_avatars_select_peers on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-avatars'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/avatar$'
    and exists (
      select 1
      from public.members viewer
      where viewer.user_id = (select auth.uid())
        and viewer.status in ('invited', 'active')
    )
    and private.caller_sees_member_card(pg_catalog.split_part(name, '/', 1)::pg_catalog.uuid)
  );
