-- SM-2 member posting, put yourself forward, and the poster shortlist.
-- A member-posted seat stays off the published list until admin publishes it.
-- The shortlist is only people who put themselves forward.
-- A partner poster also needs the applicant to show their card to partners.
-- In-app only. Nothing is sent. Nothing is scheduled. No payment columns.
-- Apply later. This file does not run against a live database and does not deploy.
-- Order: after 20261226120000_home_partner_examples.sql.

create index if not exists re_board_roles_posted_by_member_id_idx
  on public.re_board_roles (posted_by_member_id);

create or replace function private.assert_board_seat_member(p_allow_sponsor boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.sample_subject(auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.is_demo = false
      and m.status in ('invited', 'active')
      and (
        m.seat in ('ksa', 'intl')
        or (p_allow_sponsor and private.is_sponsor(m.user_id))
      )
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_board_seat_member(boolean) from public, anon, authenticated;

create or replace function private.prepare_member_board_seat(
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
  p_narrative text
) returns jsonb
language plpgsql
stable
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
     or (pg_catalog.cardinality(v_tags) = 0 and pg_catalog.cardinality(v_regions) = 0)
  then
    raise exception 'invalid_tags' using errcode = '22023';
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
    'narrative', v_narrative
  );
end;
$$;

revoke all on function private.prepare_member_board_seat(
  text, text, text, text, text[], text[], text, text, text
) from public, anon, authenticated;

create or replace function public.submit_member_board_seat(
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
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
  perform private.assert_board_seat_member(true);

  v_clean := private.prepare_member_board_seat(
    p_seat_kind,
    p_title,
    p_sector,
    p_capacity,
    p_sector_tags,
    p_regions,
    p_organisation_name,
    p_terms,
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
    'pending_review',
    v_clean->>'seat_kind',
    v_clean->>'title',
    v_clean->>'sector',
    v_clean->>'capacity',
    null,
    null,
    private.board_seat_text_array(v_clean->'sector_tags'),
    private.board_seat_text_array(v_clean->'regions'),
    auth.uid(),
    v_clean->>'organisation_name',
    v_clean->>'terms',
    null,
    null,
    null,
    v_clean->>'narrative',
    0
  )
  returning id into v_id;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending_review');
end;
$$;

revoke all on function public.submit_member_board_seat(
  text, text, text, text, text[], text[], text, text, text
) from public, anon;
grant execute on function public.submit_member_board_seat(
  text, text, text, text, text[], text[], text, text, text
) to authenticated;

create or replace function public.list_published_board_seats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_board_seat_member(true);

  return coalesce((
    select pg_catalog.jsonb_agg(listed.payload order by listed.created_at desc)
    from (
      select
        r.created_at,
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'seat_kind', r.seat_kind,
          'status', r.status,
          'title', r.title,
          'sector', r.sector,
          'capacity', r.capacity,
          'sector_tags', r.sector_tags,
          'regions', r.regions,
          'organisation_name', r.organisation_name,
          'terms', r.terms,
          'narrative', r.narrative,
          'is_demo', r.is_demo,
          'poster_is_partner', case
            when r.posted_by_member_id is null then false
            else private.is_sponsor(r.posted_by_member_id)
          end
        ) as payload
      from public.re_board_roles r
      where r.scope = 'general'
        and r.status = 'published'
        and r.is_demo = false
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_published_board_seats() from public, anon;
grant execute on function public.list_published_board_seats() to authenticated;

create or replace function public.get_board_seat(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.re_board_roles%rowtype;
  v_applied boolean;
  v_application text;
  v_show boolean;
begin
  perform private.assert_board_seat_member(true);

  select * into v_row
  from public.re_board_roles r
  where r.id = p_id
    and r.scope = 'general'
    and r.is_demo = false;

  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_applied := exists (
    select 1
    from public.re_board_role_intros i
    where i.role_id = p_id
      and i.member_id = auth.uid()
  );

  if v_row.status <> 'published'
     and v_row.posted_by_member_id is distinct from auth.uid()
     and not v_applied
  then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select i.status into v_application
  from public.re_board_role_intros i
  where i.role_id = p_id
    and i.member_id = auth.uid();

  select coalesce(m.show_card_to_sponsors, false) into v_show
  from public.members m
  where m.user_id = auth.uid();

  return pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'seat_kind', v_row.seat_kind,
    'status', v_row.status,
    'title', v_row.title,
    'sector', v_row.sector,
    'capacity', v_row.capacity,
    'sector_tags', v_row.sector_tags,
    'regions', v_row.regions,
    'organisation_name', v_row.organisation_name,
    'terms', v_row.terms,
    'narrative', v_row.narrative,
    'is_demo', v_row.is_demo,
    'poster_is_partner', case
      when v_row.posted_by_member_id is null then false
      else private.is_sponsor(v_row.posted_by_member_id)
    end,
    'mine', v_row.posted_by_member_id is not distinct from auth.uid(),
    'application_status', v_application,
    'show_card_to_partners', coalesce(v_show, false)
  );
end;
$$;

revoke all on function public.get_board_seat(uuid) from public, anon;
grant execute on function public.get_board_seat(uuid) to authenticated;

create or replace function public.apply_to_board_seat(p_role_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_poster uuid;
  v_status text;
  v_partner boolean;
  v_show boolean;
begin
  perform private.assert_board_seat_member(false);

  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  if v_note is not null and (
    pg_catalog.char_length(v_note) > 400
    or pg_catalog.strpos(v_note, '@') > 0
    or private.board_seat_has_phone(v_note)
  ) then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  select r.posted_by_member_id
    into v_poster
  from public.re_board_roles r
  where r.id = p_role_id
    and r.scope = 'general'
    and r.status = 'published'
    and r.is_demo = false;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_partner := private.is_sponsor(v_poster);

  if private.sample_subject(p_role_id) or v_poster is not distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.re_board_role_intros (role_id, member_id, status, note)
  values (p_role_id, auth.uid(), 'pending', v_note)
  on conflict (role_id, member_id) do nothing;

  select i.status into v_status
  from public.re_board_role_intros i
  where i.role_id = p_role_id
    and i.member_id = auth.uid();

  select coalesce(m.show_card_to_sponsors, false) into v_show
  from public.members m
  where m.user_id = auth.uid();

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'poster_is_partner', coalesce(v_partner, false),
    'show_card_to_partners', coalesce(v_show, false)
  );
end;
$$;

revoke all on function public.apply_to_board_seat(uuid, text) from public, anon;
grant execute on function public.apply_to_board_seat(uuid, text) to authenticated;

create or replace function public.my_board_seat_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_board_seat_member(true);

  return coalesce((
    select pg_catalog.jsonb_agg(listed.payload order by listed.requested_at desc)
    from (
      select
        i.requested_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'role_id', r.id,
          'title', r.title,
          'organisation_name', r.organisation_name,
          'seat_kind', r.seat_kind,
          'seat_status', r.status,
          'status', i.status,
          'note', coalesce(i.note, '')
        ) as payload
      from public.re_board_role_intros i
      join public.re_board_roles r on r.id = i.role_id
      where i.member_id = auth.uid()
        and r.scope = 'general'
        and r.is_demo = false
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_board_seat_applications() from public, anon;
grant execute on function public.my_board_seat_applications() to authenticated;

create or replace function public.my_posted_board_seats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_board_seat_member(true);

  return coalesce((
    select pg_catalog.jsonb_agg(listed.payload order by listed.created_at desc)
    from (
      select
        r.created_at,
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'organisation_name', r.organisation_name,
          'seat_kind', r.seat_kind,
          'status', r.status,
          'sector', r.sector,
          'capacity', r.capacity,
          'applicant_count', (
            select count(*)::int
            from public.re_board_role_intros i
            join public.members m on m.user_id = i.member_id
            where i.role_id = r.id
              and m.is_demo = false
              and not private.sample_subject(i.member_id)
              and (
                not private.is_sponsor(auth.uid())
                or private.caller_sees_member_card(i.member_id)
              )
          )
        ) as payload
      from public.re_board_roles r
      where r.scope = 'general'
        and r.posted_by_member_id = auth.uid()
        and r.is_demo = false
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_posted_board_seats() from public, anon;
grant execute on function public.my_posted_board_seats() to authenticated;

create or replace function public.list_my_board_seat_shortlist(p_role_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_partner boolean;
begin
  perform private.assert_board_seat_member(true);

  if not exists (
    select 1
    from public.re_board_roles r
    where r.id = p_role_id
      and r.scope = 'general'
      and r.posted_by_member_id = auth.uid()
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_partner := private.is_sponsor(auth.uid());

  return coalesce((
    select pg_catalog.jsonb_agg(listed.payload order by listed.requested_at)
    from (
      select
        i.requested_at,
        pg_catalog.jsonb_build_object(
          'id', i.id,
          'member_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'note', coalesce(i.note, ''),
          'status', i.status
        ) as payload
      from public.re_board_role_intros i
      join public.members m on m.user_id = i.member_id
      left join public.profiles p on p.user_id = i.member_id
      where i.role_id = p_role_id
        and m.is_demo = false
        and not private.sample_subject(i.member_id)
        and (
          not v_partner
          or private.caller_sees_member_card(i.member_id)
        )
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_board_seat_shortlist(uuid) from public, anon;
grant execute on function public.list_my_board_seat_shortlist(uuid) to authenticated;

create or replace function public.open_board_seat_introduction(p_intro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_role uuid;
  v_intro uuid;
  v_status text;
begin
  perform private.assert_board_seat_member(true);

  select i.member_id, i.role_id
    into v_member, v_role
  from public.re_board_role_intros i
  join public.re_board_roles r on r.id = i.role_id
  where i.id = p_intro_id
    and r.scope = 'general'
    and r.posted_by_member_id = auth.uid()
    and r.is_demo = false;

  if v_member is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if private.is_sponsor(auth.uid()) and not private.caller_sees_member_card(v_member) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if private.sample_subject(v_member) or not exists (
    select 1
    from public.members m
    where m.user_id = v_member
      and m.is_demo = false
      and m.status in ('invited', 'active')
      and m.seat in ('ksa', 'intl')
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select i.id, i.status
    into v_intro, v_status
  from public.member_intros i
  where (i.requester_id = auth.uid() and i.target_id = v_member)
     or (i.requester_id = v_member and i.target_id = auth.uid())
  order by case i.status when 'accepted' then 0 when 'pending' then 1 else 2 end, i.requested_at
  limit 1;

  if v_intro is null then
    insert into public.member_intros (requester_id, target_id, reason, status, decided_at, ask_desk)
    values (auth.uid(), v_member, 'Board seat introduction', 'accepted', pg_catalog.now(), false)
    returning id into v_intro;
  elsif v_status is distinct from 'accepted' then
    update public.member_intros
    set status = 'accepted',
        decided_at = pg_catalog.now()
    where id = v_intro;
  end if;

  update public.re_board_role_intros
  set status = 'approved',
      decided_at = pg_catalog.now(),
      decided_by = auth.uid(),
      decided_by_role = 'poster'
  where id = p_intro_id
    and role_id = v_role;

  return pg_catalog.jsonb_build_object('intro_id', v_intro, 'status', 'accepted');
end;
$$;

revoke all on function public.open_board_seat_introduction(uuid) from public, anon;
grant execute on function public.open_board_seat_introduction(uuid) to authenticated;
