-- Seat suggestions only include members who have joined.
-- Joined means public.members.status = 'active'.
-- 'invited' is an admitted seat that has not finished password setup.
-- Apply after 20270113120000. Do not apply this file from the app, from CI,
-- or against a live database. No Edge function. Nothing is sent.

create or replace function public.list_people_for_my_seat(p_role_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_status text;
  v_skills text[];
  v_sectors text[];
  v_partner boolean;
begin
  perform private.assert_board_seat_member(true);
  if not private.seat_suggestions_on() then
    return pg_catalog.jsonb_build_object('enabled', false, 'state', 'off', 'people', '[]'::jsonb);
  end if;

  select r.seat_kind, r.status, coalesce(r.skills_wanted, '{}'::text[]), coalesce(r.sector_tags, '{}'::text[])
    into v_kind, v_status, v_skills, v_sectors
  from public.re_board_roles r
  where r.id = p_role_id
    and r.scope = 'general'
    and r.is_demo = false
    and r.posted_by_member_id = auth.uid();

  if v_kind is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status <> 'published' then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'not_published', 'people', '[]'::jsonb);
  end if;

  v_partner := private.is_sponsor(auth.uid());

  return pg_catalog.jsonb_build_object(
    'enabled', true,
    'state', 'ready',
    'people', coalesce((
      select pg_catalog.jsonb_agg(listed.payload order by listed.reason_count desc, listed.sort_name asc)
      from (
        select
          pg_catalog.jsonb_array_length(reasons.payload) as reason_count,
          pg_catalog.lower(private.seat_public_line(p.full_name)) as sort_name,
          pg_catalog.jsonb_build_object(
            'user_id', m.user_id,
            'name', coalesce(nullif(private.seat_public_line(p.full_name), ''), 'Member'),
            'headline', private.seat_public_line(p.headline),
            'company', private.seat_public_line(p.company),
            'intro_status', intro.status,
            'reasons', reasons.payload
          ) as payload
        from public.members m
        join public.profiles p on p.user_id = m.user_id
        left join public.profile_boardroom b on b.user_id = m.user_id
        cross join lateral (
          select private.seat_match_reasons(
            'poster',
            v_kind,
            coalesce(b.seat_types, '{}'::text[]),
            coalesce(b.seat_where, '{}'::text[]),
            coalesce(b.expertise, '{}'::text[]),
            v_skills,
            coalesce(p.sector_tags, '{}'::text[]),
            v_sectors,
            coalesce(p.looking_for, '{}'::text[]),
            coalesce(p.can_help_with, '{}'::text[]),
            coalesce((
              select pg_catalog.array_agg(distinct br.role)
              from public.profile_board_roles br
              where br.user_id = m.user_id
            ), '{}'::text[])
          ) as payload
        ) reasons
        left join lateral (
          select i.status
          from public.member_intros i
          where i.requester_id = auth.uid()
            and i.target_id = m.user_id
          limit 1
        ) intro on true
        where m.user_id <> auth.uid()
          and m.is_demo = false
          and not private.sample_subject(m.user_id)
          and m.status = 'active'
          and m.seat in ('ksa', 'intl')
          and coalesce(m.directory_hidden, false) = false
          and coalesce(b.open_to_seats, false) = true
          and coalesce(pg_catalog.cardinality(b.seat_types), 0) >= 1
          and coalesce(pg_catalog.cardinality(b.seat_where), 0) >= 1
          and reasons.payload is not null
          and (
            not v_partner
            or coalesce(m.show_card_to_sponsors, false) = true
          )
          and not exists (
            select 1
            from public.re_board_role_intros applied
            where applied.role_id = p_role_id
              and applied.member_id = m.user_id
          )
          and not exists (
            select 1
            from public.seat_match_dismissals d
            where d.user_id = auth.uid()
              and d.role_id = p_role_id
              and d.person_id = m.user_id
          )
        order by pg_catalog.jsonb_array_length(reasons.payload) desc, pg_catalog.lower(private.seat_public_line(p.full_name)) asc
        limit 10
      ) listed
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_people_for_my_seat(uuid) from public, anon;
grant execute on function public.list_people_for_my_seat(uuid) to authenticated;


create or replace function public.list_my_seat_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_types text[];
  v_where text[];
  v_expertise text[];
  v_looking text[];
  v_sectors text[];
  v_hidden boolean;
begin
  perform private.assert_board_seat_member(false);
  if not private.seat_suggestions_on() then
    return pg_catalog.jsonb_build_object('enabled', false, 'state', 'off', 'seats', '[]'::jsonb);
  end if;

  select
    coalesce(b.open_to_seats, false),
    coalesce(b.seat_types, '{}'::text[]),
    coalesce(b.seat_where, '{}'::text[]),
    coalesce(b.expertise, '{}'::text[]),
    coalesce(p.looking_for, '{}'::text[]),
    coalesce(p.sector_tags, '{}'::text[]),
    coalesce(m.directory_hidden, false)
  into v_open, v_types, v_where, v_expertise, v_looking, v_sectors, v_hidden
  from public.members m
  left join public.profile_boardroom b on b.user_id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.user_id = auth.uid();

  if not exists (
    select 1
    from public.members caller
    where caller.user_id = auth.uid()
      and caller.status = 'active'
      and caller.is_demo = false
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'ready', 'seats', '[]'::jsonb);
  end if;

  if not coalesce(v_open, false)
     or coalesce(pg_catalog.cardinality(v_types), 0) < 1
     or coalesce(pg_catalog.cardinality(v_where), 0) < 1
  then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'not_open', 'seats', '[]'::jsonb);
  end if;

  if coalesce(v_hidden, false) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'hidden', 'seats', '[]'::jsonb);
  end if;

  return pg_catalog.jsonb_build_object(
    'enabled', true,
    'state', 'ready',
    'seats', coalesce((
      select pg_catalog.jsonb_agg(listed.payload order by listed.reason_count desc, listed.created_at desc)
      from (
        select
          r.created_at,
          pg_catalog.jsonb_array_length(reasons.payload) as reason_count,
          pg_catalog.jsonb_build_object(
            'id', r.id,
            'title', r.title,
            'organisation_name', r.organisation_name,
            'seat_kind', r.seat_kind,
            'sector_tag', coalesce(r.sector_tags[1], ''),
            'region', coalesce(r.regions[1], ''),
            'reasons', reasons.payload
          ) as payload
        from public.re_board_roles r
        cross join lateral (
          select private.seat_match_reasons(
            'seeker',
            r.seat_kind,
            v_types,
            v_where,
            v_expertise,
            coalesce(r.skills_wanted, '{}'::text[]),
            v_sectors,
            coalesce(r.sector_tags, '{}'::text[]),
            v_looking,
            '{}'::text[],
            '{}'::text[]
          ) as payload
        ) reasons
        where r.scope = 'general'
          and r.status = 'published'
          and r.is_demo = false
          and r.posted_by_member_id is distinct from auth.uid()
          and (
            r.posted_by_member_id is null
            or exists (
              select 1
              from public.members poster
              where poster.user_id = r.posted_by_member_id
                and poster.status = 'active'
                and poster.is_demo = false
            )
          )
          and reasons.payload is not null
          and not exists (
            select 1
            from public.re_board_role_intros i
            where i.role_id = r.id
              and i.member_id = auth.uid()
          )
          and not exists (
            select 1
            from public.seat_match_dismissals d
            where d.user_id = auth.uid()
              and d.role_id = r.id
              and d.person_id is null
          )
        order by pg_catalog.jsonb_array_length(reasons.payload) desc, r.created_at desc
        limit 3
      ) listed
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.my_seat_match(p_role_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_types text[];
  v_where text[];
  v_expertise text[];
  v_looking text[];
  v_sectors text[];
  v_hidden boolean;
  v_kind text;
  v_skills text[];
  v_seat_sectors text[];
  v_poster uuid;
  v_reasons jsonb;
begin
  perform private.assert_board_seat_member(false);
  if not private.seat_suggestions_on() then
    return pg_catalog.jsonb_build_object('enabled', false, 'state', 'off', 'reasons', '[]'::jsonb);
  end if;

  select r.seat_kind, coalesce(r.skills_wanted, '{}'::text[]), coalesce(r.sector_tags, '{}'::text[]), r.posted_by_member_id
    into v_kind, v_skills, v_seat_sectors, v_poster
  from public.re_board_roles r
  where r.id = p_role_id
    and r.scope = 'general'
    and r.status = 'published'
    and r.is_demo = false;

  if v_kind is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_poster is not distinct from auth.uid() then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'own', 'reasons', '[]'::jsonb);
  end if;

  if v_poster is not null and not exists (
    select 1
    from public.members poster
    where poster.user_id = v_poster
      and poster.status = 'active'
      and poster.is_demo = false
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'none', 'reasons', '[]'::jsonb);
  end if;

  if not exists (
    select 1
    from public.members caller
    where caller.user_id = auth.uid()
      and caller.status = 'active'
      and caller.is_demo = false
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'ready', 'reasons', '[]'::jsonb);
  end if;

  if exists (
    select 1
    from public.re_board_role_intros i
    where i.role_id = p_role_id
      and i.member_id = auth.uid()
  ) or exists (
    select 1
    from public.seat_match_dismissals d
    where d.user_id = auth.uid()
      and d.role_id = p_role_id
      and d.person_id is null
  ) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'none', 'reasons', '[]'::jsonb);
  end if;

  select
    coalesce(b.open_to_seats, false),
    coalesce(b.seat_types, '{}'::text[]),
    coalesce(b.seat_where, '{}'::text[]),
    coalesce(b.expertise, '{}'::text[]),
    coalesce(p.looking_for, '{}'::text[]),
    coalesce(p.sector_tags, '{}'::text[]),
    coalesce(m.directory_hidden, false)
  into v_open, v_types, v_where, v_expertise, v_looking, v_sectors, v_hidden
  from public.members m
  left join public.profile_boardroom b on b.user_id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.user_id = auth.uid();

  if not coalesce(v_open, false)
     or coalesce(pg_catalog.cardinality(v_types), 0) < 1
     or coalesce(pg_catalog.cardinality(v_where), 0) < 1
  then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'not_open', 'reasons', '[]'::jsonb);
  end if;

  if coalesce(v_hidden, false) then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'hidden', 'reasons', '[]'::jsonb);
  end if;

  v_reasons := private.seat_match_reasons(
    'seeker',
    v_kind,
    v_types,
    v_where,
    v_expertise,
    v_skills,
    v_sectors,
    v_seat_sectors,
    v_looking,
    '{}'::text[],
    '{}'::text[]
  );

  if v_reasons is null then
    return pg_catalog.jsonb_build_object('enabled', true, 'state', 'none', 'reasons', '[]'::jsonb);
  end if;

  return pg_catalog.jsonb_build_object('enabled', true, 'state', 'match', 'reasons', v_reasons);
end;
$$;



revoke all on function public.list_my_seat_suggestions() from public, anon;
grant execute on function public.list_my_seat_suggestions() to authenticated;

revoke all on function public.my_seat_match(uuid) from public, anon;
grant execute on function public.my_seat_match(uuid) to authenticated;

comment on function public.list_people_for_my_seat(uuid) is
  'Up to 10 joined members for a seat the caller posted. Invited members are left out. No contact fields.';

comment on function public.list_my_seat_suggestions() is
  'Top three seats for a joined member. Seats posted by an invited member are left out. No contact fields.';

comment on function public.my_seat_match(uuid) is
  'Reasons for one published seat. Empty for an invited caller, and empty when the poster has not joined.';
