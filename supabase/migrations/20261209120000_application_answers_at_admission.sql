-- Keep application answers at admission.
-- Apply this file only, and only after 20261207120000.
-- 20261208120000 is left free for the trusted partners migration.
-- Do not apply it from the app, from CI, or against a live database from this PR.
--
-- public.transition_candidate is unchanged. It still inserts the profile inside
-- claim_founding_seat, then inserts the approval event, in one transaction.
-- The AFTER INSERT trigger below can see that profile row.
--
-- Sectors and Vision 2030 themes are copied onto the profile only when that
-- list is still empty. Order is kept. Values outside the profile lists are
-- dropped. At most 3 of each are kept.
-- Region, board seats, statement and company website stay off the live profile.
-- They are stored for the member only. The website is text. Nothing requests the site.
-- An empty set of those four values does not create a row.
-- The row leaves when the member row is deleted, when the member is anonymised
-- (anonymised_at changes from null to a time), or when every stored field is reviewed.
-- Members are anonymised in place, so the delete cascade does not run then.
-- This file does not add a time limit.

create table if not exists public.member_application_answers (
  member_id uuid primary key references public.members(user_id) on delete cascade,
  region text,
  board_seats text,
  statement text,
  company_website text,
  copied_at timestamptz not null default pg_catalog.now(),
  reviewed_fields text[] not null default '{}',
  constraint member_application_answers_region_check check (
    region is null or region in ('ksa_gcc', 'intl')
  ),
  constraint member_application_answers_board_seats_len check (
    board_seats is null or char_length(board_seats) <= 1000
  ),
  constraint member_application_answers_statement_len check (
    statement is null or char_length(statement) <= 600
  ),
  constraint member_application_answers_company_website_len check (
    company_website is null
    or (char_length(company_website) <= 500 and company_website ~ '^https://')
  ),
  constraint member_application_answers_reviewed_fields_check check (
    reviewed_fields <@ array['region', 'board_seats', 'statement', 'company_website']::text[]
  )
);

comment on table public.member_application_answers is
  'Private copy of region, board seats, statement and company website at admission. The member reads and dismisses it. Staff already see the application in Review.';

alter table public.member_application_answers enable row level security;
alter table public.member_application_answers force row level security;

revoke all on table public.member_application_answers from public, anon, authenticated, service_role;

create or replace function private.carry_application_answers(p_user_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_region pg_catalog.text;
  v_board pg_catalog.text;
  v_statement pg_catalog.text;
  v_website pg_catalog.text;
  v_sectors pg_catalog.text[];
  v_themes pg_catalog.text[];
  v_raw_sectors pg_catalog.text[];
  v_raw_themes pg_catalog.text[];
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.members m
    where m.user_id = p_user_id
  ) then
    return;
  end if;

  select c.region, c.board_seats, c.statement, c.company_website, c.sector_tags, c.vision_tags
    into v_region, v_board, v_statement, v_website, v_raw_sectors, v_raw_themes
  from public.candidates c
  where c.user_id = p_user_id;

  if not found then
    return;
  end if;

  select coalesce(pg_catalog.array_agg(picked.item order by picked.first_ord), '{}'::pg_catalog.text[])
    into v_sectors
  from (
    select u.item, pg_catalog.min(u.ord) as first_ord
    from pg_catalog.unnest(coalesce(v_raw_sectors, '{}'::pg_catalog.text[])) with ordinality as u(item, ord)
    where u.item = any (private.profile_sector_tags())
    group by u.item
    order by pg_catalog.min(u.ord)
    limit 3
  ) picked;

  select coalesce(pg_catalog.array_agg(picked.item order by picked.first_ord), '{}'::pg_catalog.text[])
    into v_themes
  from (
    select u.item, pg_catalog.min(u.ord) as first_ord
    from pg_catalog.unnest(coalesce(v_raw_themes, '{}'::pg_catalog.text[])) with ordinality as u(item, ord)
    where u.item = any (private.profile_vision_themes())
    group by u.item
    order by pg_catalog.min(u.ord)
    limit 3
  ) picked;

  if coalesce(pg_catalog.cardinality(v_sectors), 0) > 0 then
    update public.profiles p
    set sector_tags = v_sectors
    where p.user_id = p_user_id
      and coalesce(pg_catalog.cardinality(p.sector_tags), 0) = 0;
  end if;

  if coalesce(pg_catalog.cardinality(v_themes), 0) > 0 then
    update public.profiles p
    set vision_themes = v_themes
    where p.user_id = p_user_id
      and coalesce(pg_catalog.cardinality(p.vision_themes), 0) = 0;
  end if;

  if v_region is null or v_region not in ('ksa_gcc', 'intl') then
    v_region := null;
  end if;

  v_board := pg_catalog.btrim(coalesce(v_board, ''));
  if v_board = '' or pg_catalog.char_length(v_board) > 1000 then
    v_board := null;
  end if;

  v_statement := pg_catalog.btrim(coalesce(v_statement, ''));
  if v_statement = '' or pg_catalog.char_length(v_statement) > 600 then
    v_statement := null;
  end if;

  v_website := pg_catalog.btrim(coalesce(v_website, ''));
  if v_website = ''
     or v_website !~ '^https://'
     or pg_catalog.char_length(v_website) > 500
  then
    v_website := null;
  end if;

  if v_region is null and v_board is null and v_statement is null and v_website is null then
    return;
  end if;

  insert into public.member_application_answers (
    member_id, region, board_seats, statement, company_website, copied_at
  ) values (
    p_user_id, v_region, v_board, v_statement, v_website, pg_catalog.now()
  )
  on conflict (member_id) do update
  set region = coalesce(excluded.region, public.member_application_answers.region),
      board_seats = coalesce(excluded.board_seats, public.member_application_answers.board_seats),
      statement = coalesce(excluded.statement, public.member_application_answers.statement),
      company_website = coalesce(excluded.company_website, public.member_application_answers.company_website),
      copied_at = excluded.copied_at;
end;
$$;

revoke all on function private.carry_application_answers(uuid) from public, anon, authenticated;

comment on function private.carry_application_answers(uuid) is
  'Copies allowed sectors and themes onto an empty profile list, and stores region, board seats, statement and website for that member. Does not request the website.';

create or replace function private.tg_carry_application_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'state_change' and (new.detail ->> 'to') = 'approved' then
    perform private.carry_application_answers(new.candidate_user_id);
  end if;
  return new;
end;
$$;

revoke all on function private.tg_carry_application_answers() from public, anon, authenticated;

drop trigger if exists carry_application_answers_on_approval on public.candidate_events;
create trigger carry_application_answers_on_approval
  after insert on public.candidate_events
  for each row
  when (new.kind = 'state_change' and (new.detail ->> 'to') = 'approved')
  execute function private.tg_carry_application_answers();

create or replace function private.purge_application_answers_on_anonymise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.anonymised_at is null and new.anonymised_at is not null then
    delete from public.member_application_answers
    where member_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.purge_application_answers_on_anonymise() from public, anon, authenticated;

comment on function private.purge_application_answers_on_anonymise() is
  'Deletes the member application answers when anonymised_at changes from null to a time. Not callable by anon.';

drop trigger if exists purge_application_answers_on_anonymise on public.members;
create trigger purge_application_answers_on_anonymise
  after update of anonymised_at on public.members
  for each row
  when (old.anonymised_at is null and new.anonymised_at is not null)
  execute function private.purge_application_answers_on_anonymise();

create or replace function public.get_my_application_answers()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region pg_catalog.text;
  v_board pg_catalog.text;
  v_statement pg_catalog.text;
  v_website pg_catalog.text;
  v_reviewed pg_catalog.text[];
  v_copied pg_catalog.timestamptz;
  v_out pg_catalog.jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select a.region, a.board_seats, a.statement, a.company_website, a.reviewed_fields, a.copied_at
    into v_region, v_board, v_statement, v_website, v_reviewed, v_copied
  from public.member_application_answers a
  where a.member_id = auth.uid();

  if not found then
    return null;
  end if;

  v_reviewed := coalesce(v_reviewed, '{}'::pg_catalog.text[]);
  v_out := pg_catalog.jsonb_build_object('copied_at', v_copied);

  if v_region is not null and not ('region' = any (v_reviewed)) then
    v_out := v_out || pg_catalog.jsonb_build_object('region', v_region);
  end if;
  if v_board is not null and not ('board_seats' = any (v_reviewed)) then
    v_out := v_out || pg_catalog.jsonb_build_object('board_seats', v_board);
  end if;
  if v_statement is not null and not ('statement' = any (v_reviewed)) then
    v_out := v_out || pg_catalog.jsonb_build_object('statement', v_statement);
  end if;
  if v_website is not null and not ('company_website' = any (v_reviewed)) then
    v_out := v_out || pg_catalog.jsonb_build_object('company_website', v_website);
  end if;

  return v_out;
end;
$$;

revoke all on function public.get_my_application_answers() from public, anon;
grant execute on function public.get_my_application_answers() to authenticated;

comment on function public.get_my_application_answers() is
  'Returns the caller application answers, without fields already reviewed. Authenticated member. Not anon.';

create or replace function public.dismiss_my_application_answer(p_field pg_catalog.text)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or p_field is null
     or p_field not in ('region', 'board_seats', 'statement', 'company_website')
  then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.member_application_answers a
  set reviewed_fields = case
    when p_field = any (coalesce(a.reviewed_fields, '{}'::pg_catalog.text[])) then coalesce(a.reviewed_fields, '{}'::pg_catalog.text[])
    else coalesce(a.reviewed_fields, '{}'::pg_catalog.text[]) || array[p_field]::pg_catalog.text[]
  end
  where a.member_id = auth.uid();

  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.member_application_answers a
  where a.member_id = auth.uid()
    and (a.region is null or 'region' = any (a.reviewed_fields))
    and (a.board_seats is null or 'board_seats' = any (a.reviewed_fields))
    and (a.statement is null or 'statement' = any (a.reviewed_fields))
    and (a.company_website is null or 'company_website' = any (a.reviewed_fields));

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dismiss_my_application_answer(text) from public, anon;
grant execute on function public.dismiss_my_application_answer(text) to authenticated;

comment on function public.dismiss_my_application_answer(text) is
  'Marks one of the caller answers reviewed. Deletes the row when every stored field is reviewed. Not anon.';
