-- Seat matching. Suggestions are computed when a page opens and are not stored.
-- Only Not a fit rows are stored, and they are removed when a seat closes.
-- The admin switch defaults off. Nothing is sent. Nothing is scheduled.
-- Apply after 20270111120000. Do not apply this file from the app, from CI,
-- or against a live database. No Edge function.

create or replace function private.seat_kind_types(p_kind text)
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'company_board' then array[
      'Chair',
      'Independent director',
      'Committee: Audit',
      'Committee: Risk',
      'Committee: Nomination and remuneration'
    ]::text[]
    when 'ned' then array['Non-executive director', 'Independent director']::text[]
    when 'adviser' then array['Adviser']::text[]
    else '{}'::text[]
  end;
$$;

create or replace function private.seat_kind_roles(p_kind text)
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'company_board' then array['Chair', 'Independent director', 'Committee chair']::text[]
    when 'ned' then array['Non-executive director', 'Independent director']::text[]
    when 'adviser' then array['Adviser']::text[]
    else '{}'::text[]
  end;
$$;

create or replace function private.seat_where_match()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array['Saudi Arabia', 'GCC']::text[];
$$;

revoke all on function private.seat_kind_types(text) from public, anon, authenticated, service_role;
revoke all on function private.seat_kind_roles(text) from public, anon, authenticated, service_role;
revoke all on function private.seat_where_match() from public, anon, authenticated, service_role;

comment on function private.seat_kind_types(text) is
  'Company board maps to Chair, Independent director, and the three Committee types. Non-executive maps to Non-executive director and Independent director. Adviser maps to Adviser.';

comment on function private.seat_kind_roles(text) is
  'Held board role titles that count for a seat kind. Committee chair covers a company board. Vice chair does not match.';

comment on function private.seat_where_match() is
  'Saudi seats match Saudi Arabia or GCC. International alone does not.';

create or replace function private.seat_match_reasons(
  p_side text,
  p_kind text,
  p_types text[],
  p_where text[],
  p_expertise text[],
  p_skills text[],
  p_member_sectors text[],
  p_seat_sectors text[],
  p_looking_for text[],
  p_can_help text[],
  p_roles text[]
) returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_reasons jsonb := '[]'::jsonb;
  v_types text[] := private.seat_kind_types(p_kind);
  v_roles text[] := private.seat_kind_roles(p_kind);
  v_where text[] := private.seat_where_match();
  v_item text;
  v_signal boolean := false;
begin
  if p_side not in ('seeker', 'poster') then
    return null;
  end if;
  if coalesce(pg_catalog.cardinality(v_types), 0) = 0 then
    return null;
  end if;
  if not (coalesce(p_types, '{}'::text[]) && v_types) then
    return null;
  end if;
  if not (coalesce(p_where, '{}'::text[]) && v_where) then
    return null;
  end if;

  if 'Board seat' = any (coalesce(p_looking_for, '{}'::text[])) then
    v_signal := true;
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'looking_for', 'value', 'Board seat')
    );
  end if;

  if p_side = 'poster' and 'Board experience' = any (coalesce(p_can_help, '{}'::text[])) then
    v_signal := true;
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'help_with', 'value', 'Board experience')
    );
  end if;

  for v_item in
    select listed.item
    from pg_catalog.unnest(coalesce(p_expertise, '{}'::text[])) with ordinality as listed(item, ord)
    where listed.item = any (coalesce(p_skills, '{}'::text[]))
    order by listed.ord
  loop
    v_signal := true;
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'expertise', 'value', v_item)
    );
  end loop;

  for v_item in
    select listed.item
    from pg_catalog.unnest(coalesce(p_member_sectors, '{}'::text[])) with ordinality as listed(item, ord)
    where listed.item = any (coalesce(p_seat_sectors, '{}'::text[]))
    order by listed.ord
  loop
    v_signal := true;
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'sector', 'value', v_item)
    );
  end loop;

  if p_side = 'poster' then
    for v_item in
      select listed.item
      from pg_catalog.unnest(v_roles) with ordinality as listed(item, ord)
      where listed.item = any (coalesce(p_roles, '{}'::text[]))
      order by listed.ord
    loop
      v_signal := true;
      v_reasons := v_reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('code', 'role', 'value', v_item)
      );
    end loop;
  end if;

  if not v_signal then
    return null;
  end if;

  for v_item in
    select listed.item
    from pg_catalog.unnest(v_types) with ordinality as listed(item, ord)
    where listed.item = any (coalesce(p_types, '{}'::text[]))
    order by listed.ord
  loop
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'seat_type', 'value', v_item)
    );
  end loop;

  for v_item in
    select listed.item
    from pg_catalog.unnest(v_where) with ordinality as listed(item, ord)
    where listed.item = any (coalesce(p_where, '{}'::text[]))
    order by listed.ord
  loop
    v_reasons := v_reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'where', 'value', v_item)
    );
  end loop;

  return v_reasons;
end;
$$;

revoke all on function private.seat_match_reasons(text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[])
  from public, anon, authenticated, service_role;

comment on function private.seat_match_reasons(text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[]) is
  'Fixed lists only. Returns null unless every type and place gate passes and at least one signal is true. Free text is not an argument.';

create or replace function private.seat_public_line(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_text is null or pg_catalog.btrim(p_text) = '' then ''
    when pg_catalog.strpos(p_text, '@') > 0 then ''
    when private.board_seat_has_phone(p_text) then ''
    else pg_catalog.btrim(p_text)
  end;
$$;

revoke all on function private.seat_public_line(text) from public, anon, authenticated, service_role;

alter table public.re_board_roles
  add column if not exists skills_wanted text[] not null default '{}'::text[];

alter table public.re_board_roles drop constraint if exists re_board_roles_skills_wanted_ok;
alter table public.re_board_roles
  add constraint re_board_roles_skills_wanted_ok
  check (private.text_list_ok(skills_wanted, private.board_expertise(), 3));

comment on column public.re_board_roles.skills_wanted is
  'Optional. Up to 3 values from private.board_expertise(). Not free text.';

create table if not exists public.seat_suggestion_settings (
  id smallint primary key default 1,
  enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint seat_suggestion_settings_one_row check (id = 1)
);

alter table public.seat_suggestion_settings enable row level security;
alter table public.seat_suggestion_settings force row level security;
revoke all on table public.seat_suggestion_settings from public, anon, authenticated, service_role;

comment on table public.seat_suggestion_settings is
  'One row. Seat suggestions stay off until admin turns the switch on.';

insert into public.seat_suggestion_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;

create table if not exists public.seat_match_dismissals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role_id uuid not null references public.re_board_roles (id) on delete cascade,
  person_id uuid references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint seat_match_dismissals_person_check check (person_id is null or person_id <> user_id)
);

create unique index if not exists seat_match_dismissals_seeker_idx
  on public.seat_match_dismissals (user_id, role_id)
  where person_id is null;

create unique index if not exists seat_match_dismissals_poster_idx
  on public.seat_match_dismissals (user_id, role_id, person_id)
  where person_id is not null;

alter table public.seat_match_dismissals enable row level security;
alter table public.seat_match_dismissals force row level security;
revoke all on table public.seat_match_dismissals from public, anon, authenticated, service_role;

comment on table public.seat_match_dismissals is
  'Not a fit choices. A null person is a seeker hiding a seat. A person id is a poster hiding that member. Deleted when the seat closes. No contact fields.';

create or replace function private.seat_match_clear_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from 'closed') then
    delete from public.seat_match_dismissals where role_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.seat_match_clear_on_close() from public, anon, authenticated, service_role;

drop trigger if exists seat_match_clear_on_close on public.re_board_roles;
create trigger seat_match_clear_on_close
  after update of status on public.re_board_roles
  for each row
  execute function private.seat_match_clear_on_close();

create or replace function private.seat_suggestions_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.enabled
    from public.seat_suggestion_settings s
    where s.id = 1
  ), false);
$$;

revoke all on function private.seat_suggestions_on() from public, anon, authenticated, service_role;

drop function if exists public.submit_member_board_seat(text, text, text, text, text[], text[], text, text, text);

create or replace function public.submit_member_board_seat(
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_sector_tags text[],
  p_regions text[],
  p_organisation_name text,
  p_terms text,
  p_narrative text,
  p_skills_wanted text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_id uuid;
  v_skills text[] := coalesce(p_skills_wanted, '{}'::text[]);
begin
  perform private.assert_board_seat_member(false);

  if not private.text_list_ok(v_skills, private.board_expertise(), 3) then
    raise exception 'invalid_tags' using errcode = '22023';
  end if;

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
    sort_order,
    skills_wanted
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
    0,
    v_skills
  )
  returning id into v_id;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending_review');
end;
$$;

revoke all on function public.submit_member_board_seat(text, text, text, text, text[], text[], text, text, text, text[]) from public, anon;
grant execute on function public.submit_member_board_seat(text, text, text, text, text[], text[], text, text, text, text[]) to authenticated;

comment on function public.submit_member_board_seat(text, text, text, text, text[], text[], text, text, text, text[]) is
  'A member posts a general seat for review. Partners cannot post. Skills wanted is optional, at most 3 expertise chips.';

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
          'skills_wanted', coalesce(r.skills_wanted, '{}'::text[]),
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
    'skills_wanted', coalesce(v_row.skills_wanted, '{}'::text[]),
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
    select pg_catalog.jsonb_agg(payload order by created_at desc)
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
          'skills_wanted', coalesce(r.skills_wanted, '{}'::text[]),
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

create or replace function public.set_board_seat_skills(p_id uuid, p_skills text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_skills text[] := coalesce(p_skills, '{}'::text[]);
begin
  if not private.text_list_ok(v_skills, private.board_expertise(), 3) then
    raise exception 'invalid_tags' using errcode = '22023';
  end if;

  if private.is_staff() then
    update public.re_board_roles
    set skills_wanted = v_skills
    where id = p_id
      and scope = 'general'
      and status <> 'closed';
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'id', p_id);
  end if;

  perform private.assert_board_seat_member(false);

  update public.re_board_roles
  set skills_wanted = v_skills
  where id = p_id
    and scope = 'general'
    and posted_by_member_id = auth.uid()
    and status in ('draft', 'pending_review', 'published')
    and is_demo = false;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.set_board_seat_skills(uuid, text[]) from public, anon;
grant execute on function public.set_board_seat_skills(uuid, text[]) to authenticated;

comment on function public.set_board_seat_skills(uuid, text[]) is
  'Admin, or the member who posted the seat, sets up to 3 expertise chips. Partners cannot post, so they cannot set this.';

create or replace function public.save_my_board_focus(
  p_open boolean,
  p_seat_types text[],
  p_seat_where text[],
  p_expertise text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_open boolean;
  v_types text[];
  v_where text[];
  v_expertise text[];
begin
  v_user := private.assert_boardroom_owner();
  v_open := coalesce(p_open, false);
  v_types := coalesce(p_seat_types, '{}'::text[]);
  v_where := coalesce(p_seat_where, '{}'::text[]);
  v_expertise := coalesce(p_expertise, '{}'::text[]);
  if not v_open then
    v_types := '{}'::text[];
    v_where := '{}'::text[];
  end if;
  if coalesce(pg_catalog.cardinality(v_expertise), 0) > 5
     or coalesce(pg_catalog.cardinality(v_types), 0) > 7
     or coalesce(pg_catalog.cardinality(v_where), 0) > 3
  then
    raise exception 'boardroom_limit' using errcode = '22023';
  end if;
  if not private.text_list_ok(v_types, private.board_seat_types(), 7)
     or not private.text_list_ok(v_where, private.board_seat_where(), 3)
     or not private.text_list_ok(v_expertise, private.board_expertise(), 5)
  then
    raise exception 'boardroom_invalid' using errcode = '22023';
  end if;
  if v_open and (
    coalesce(pg_catalog.cardinality(v_types), 0) < 1
    or coalesce(pg_catalog.cardinality(v_where), 0) < 1
  ) then
    raise exception 'boardroom_place' using errcode = '22023';
  end if;

  insert into public.profile_boardroom (
    user_id, open_to_seats, seat_types, seat_where, expertise, updated_at
  ) values (
    v_user, v_open, v_types, v_where, v_expertise, pg_catalog.now()
  )
  on conflict (user_id) do update
  set open_to_seats = excluded.open_to_seats,
      seat_types = excluded.seat_types,
      seat_where = excluded.seat_where,
      expertise = excluded.expertise,
      updated_at = excluded.updated_at;
  perform private.touch_profile_updated(v_user);
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_my_board_focus(boolean, text[], text[], text[]) from public, anon;
grant execute on function public.save_my_board_focus(boolean, text[], text[], text[]) to authenticated;

comment on function public.save_my_board_focus(boolean, text[], text[], text[]) is
  'Saves open to seats. Yes needs one seat type and one place. Not now clears both lists. Earlier Yes rows are left as they are.';

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

revoke all on function public.list_my_seat_suggestions() from public, anon;
grant execute on function public.list_my_seat_suggestions() to authenticated;

comment on function public.list_my_seat_suggestions() is
  'Top three seats for the caller. Empty while the switch is off. No contact fields and no free text keys.';

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

revoke all on function public.my_seat_match(uuid) from public, anon;
grant execute on function public.my_seat_match(uuid) to authenticated;

comment on function public.my_seat_match(uuid) is
  'Every reason for one published seat. Empty while the switch is off. No contact fields.';

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
          and m.status in ('invited', 'active')
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

comment on function public.list_people_for_my_seat(uuid) is
  'Up to 10 members for a seat the caller posted. Directory card fields and reasons only. No contact fields.';

create or replace function public.dismiss_seat_match(p_role_id uuid, p_person_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.seat_suggestions_on() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_person_id is null then
    perform private.assert_board_seat_member(false);
    if not exists (
      select 1
      from public.re_board_roles r
      where r.id = p_role_id
        and r.scope = 'general'
        and r.status = 'published'
        and r.is_demo = false
        and r.posted_by_member_id is distinct from auth.uid()
    ) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    perform private.assert_board_seat_member(true);
    if p_person_id = auth.uid() then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.re_board_roles r
      where r.id = p_role_id
        and r.scope = 'general'
        and r.status = 'published'
        and r.is_demo = false
        and r.posted_by_member_id = auth.uid()
    ) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1
      from public.profiles p
      where p.user_id = p_person_id
    ) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.seat_match_dismissals (user_id, role_id, person_id)
  values (auth.uid(), p_role_id, p_person_id)
  on conflict do nothing;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dismiss_seat_match(uuid, uuid) from public, anon;
grant execute on function public.dismiss_seat_match(uuid, uuid) to authenticated;

create or replace function public.restore_seat_match(p_role_id uuid, p_person_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_person_id is null then
    perform private.assert_board_seat_member(false);
  else
    perform private.assert_board_seat_member(true);
  end if;
  if not private.seat_suggestions_on() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.seat_match_dismissals
  where user_id = auth.uid()
    and role_id = p_role_id
    and person_id is not distinct from p_person_id;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.restore_seat_match(uuid, uuid) from public, anon;
grant execute on function public.restore_seat_match(uuid, uuid) to authenticated;

create or replace function public.staff_get_seat_suggestions()
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
  return pg_catalog.jsonb_build_object('enabled', private.seat_suggestions_on());
end;
$$;

revoke all on function public.staff_get_seat_suggestions() from public, anon;
grant execute on function public.staff_get_seat_suggestions() to authenticated;

create or replace function public.staff_set_seat_suggestions(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.seat_suggestion_settings
  set enabled = coalesce(p_enabled, false),
      updated_at = pg_catalog.now()
  where id = 1;

  if not found then
    insert into public.seat_suggestion_settings (id, enabled)
    values (1, coalesce(p_enabled, false));
  end if;

  return pg_catalog.jsonb_build_object('enabled', private.seat_suggestions_on());
end;
$$;

revoke all on function public.staff_set_seat_suggestions(boolean) from public, anon;
grant execute on function public.staff_set_seat_suggestions(boolean) to authenticated;

comment on function public.staff_set_seat_suggestions(boolean) is
  'Admin switch for seat suggestions. Default is off. Turning it on does not send anything.';
