-- Trusted partners gallery, partner interest, and the members-only sponsor showcase.
-- Anon list_trusted_partners returns published real rows that have a logo.
-- It never returns is_demo, and it never returns a sample row.
-- Members see published samples only when no real published row exists.
-- The public landing stays hidden until a real logo exists. That rule is in the client.
-- Partner interest is stored here. An email alert to admin is parked.
-- Staff writes are not copied to staff_access_log. That log accepts action read only.
-- Factory does not apply this file.

create table if not exists public.partner_categories (
  slug text primary key,
  name text not null unique,
  gloss text not null,
  sort_order int not null,
  constraint partner_categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint partner_categories_name_len check (char_length(name) between 1 and 120),
  constraint partner_categories_gloss_len check (char_length(gloss) between 1 and 200)
);

alter table public.partner_categories enable row level security;
alter table public.partner_categories force row level security;
revoke all on table public.partner_categories from public, anon, authenticated;

insert into public.partner_categories (slug, name, gloss, sort_order)
values
  ('investment-banking', 'Investment banking', 'Coverage, mandates, and sell-side work.', 1),
  ('private-equity', 'Private equity', 'Sponsors acquiring or governing companies.', 2),
  ('venture-capital', 'Venture capital', 'Funds backing companies that will need boards.', 3),
  ('family-offices', 'Family offices', 'Principals investing their own capital.', 4),
  ('sovereign-and-development-finance', 'Sovereign and development finance', 'Public and development capital with a Saudi nexus.', 5),
  ('asset-management', 'Asset management', 'Long-only and alternative managers.', 6),
  ('private-credit-and-direct-lending', 'Private credit and direct lending', 'Lenders inside a capital structure.', 7),
  ('mergers-and-acquisitions-advisory', 'Mergers and acquisitions advisory', 'Boutiques running a live process.', 8),
  ('equity-and-debt-capital-markets', 'Equity and debt capital markets', 'Issuance for companies and funds.', 9),
  ('project-and-infrastructure-finance', 'Project and infrastructure finance', 'Capital for long-lived assets.', 10),
  ('custody-escrow-and-fund-administration', 'Custody, escrow, and fund administration', 'The pipes a closing actually uses.', 11),
  ('placement-and-capital-introduction', 'Placement and capital introduction', 'Raising a fund from the right rooms.', 12),
  ('transaction-counsel', 'Transaction counsel', 'Counsel on the transaction itself.', 13),
  ('financial-due-diligence-and-tax', 'Financial due diligence and tax', 'The work that sits under a price.', 14),
  ('corporate-finance-advisory', 'Corporate finance advisory', 'Independent advice to boards and owners.', 15)
on conflict (slug) do nothing;

alter table public.trusted_partners
  add column if not exists logo_path text,
  add column if not exists category_slug text,
  add column if not exists offer text,
  add column if not exists sponsor_user_id uuid;

alter table public.trusted_partners drop constraint if exists trusted_partners_logo_path_check;
alter table public.trusted_partners
  add constraint trusted_partners_logo_path_check
  check (logo_path is null or logo_path = lower(id::text) || '/logo');

alter table public.trusted_partners drop constraint if exists trusted_partners_offer_len;
alter table public.trusted_partners
  add constraint trusted_partners_offer_len
  check (offer is null or char_length(offer) between 1 and 400);

alter table public.trusted_partners drop constraint if exists trusted_partners_category_slug_fkey;
alter table public.trusted_partners
  add constraint trusted_partners_category_slug_fkey
  foreign key (category_slug) references public.partner_categories (slug);

alter table public.trusted_partners drop constraint if exists trusted_partners_sponsor_user_fkey;
alter table public.trusted_partners
  add constraint trusted_partners_sponsor_user_fkey
  foreign key (sponsor_user_id) references public.members (user_id) on delete set null;

create table if not exists public.partner_interest (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_at timestamptz not null default pg_catalog.now(),
  contact_name text not null,
  firm text not null,
  category_slug text not null references public.partner_categories (slug),
  note text,
  status text not null default 'new',
  constraint partner_interest_name_len check (char_length(contact_name) between 1 and 120),
  constraint partner_interest_firm_len check (char_length(firm) between 1 and 160),
  constraint partner_interest_note_len check (note is null or char_length(note) <= 1000),
  constraint partner_interest_status_check check (status in ('new', 'seen'))
);

comment on table public.partner_interest is
  'Partner interest notes. No email column. An admin email alert is parked.';

alter table public.partner_interest enable row level security;
alter table public.partner_interest force row level security;
revoke all on table public.partner_interest from public, anon, authenticated;

create table if not exists public.sponsor_intro_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  partner_id uuid not null references public.trusted_partners (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  constraint sponsor_intro_requests_status_check check (status in ('pending', 'approved', 'declined')),
  constraint sponsor_intro_requests_one unique (partner_id, member_id)
);

alter table public.sponsor_intro_requests enable row level security;
alter table public.sponsor_intro_requests force row level security;
revoke all on table public.sponsor_intro_requests from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-logos',
  'partner-logos',
  true,
  524288,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists partner_logos_select_public on storage.objects;
create policy partner_logos_select_public on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
  );

drop policy if exists partner_logos_insert_staff on storage.objects;
create policy partner_logos_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
    and private.is_staff()
  );

drop policy if exists partner_logos_update_staff on storage.objects;
create policy partner_logos_update_staff on storage.objects
  for update to authenticated
  using (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
    and private.is_staff()
  )
  with check (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
    and private.is_staff()
  );

drop policy if exists partner_logos_delete_staff on storage.objects;
create policy partner_logos_delete_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
    and private.is_staff()
  );

create or replace function public.list_partner_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'name', c.name,
      'gloss', c.gloss
    ) order by c.sort_order, c.name)
    from public.partner_categories c
  ), '[]'::jsonb);
$$;

revoke all on function public.list_partner_categories() from public, anon, authenticated;
grant execute on function public.list_partner_categories() to anon, authenticated;

create or replace function public.list_trusted_partners()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  real_n int;
  member_view boolean;
begin
  select count(*)::int into real_n
  from public.trusted_partners t
  where t.is_demo = false
    and t.published = true;

  member_view := auth.uid() is not null
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
    );

  if member_view then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'is_demo', t.is_demo,
        'name', t.name,
        'blurb', t.blurb,
        'monogram', t.monogram,
        'logo_path', t.logo_path,
        'category_slug', t.category_slug
      ) order by t.sort_order, t.name)
      from public.trusted_partners t
      where t.published
        and (
          (real_n > 0 and t.is_demo = false)
          or (real_n = 0 and t.is_demo = true)
        )
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'blurb', t.blurb,
      'monogram', t.monogram,
      'logo_path', t.logo_path,
      'category_slug', t.category_slug
    ) order by t.sort_order, t.name)
    from public.trusted_partners t
    where t.published
      and t.is_demo = false
      and t.logo_path is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_trusted_partners() from public, anon, authenticated;
grant execute on function public.list_trusted_partners() to anon, authenticated;

create or replace function public.submit_partner_interest(
  p_name text,
  p_firm text,
  p_category text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_firm text;
  v_slug text;
  v_note text;
  v_id uuid;
begin
  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  v_firm := pg_catalog.btrim(coalesce(p_firm, ''));
  v_slug := pg_catalog.btrim(coalesce(p_category, ''));
  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');

  if char_length(v_name) < 1 or char_length(v_name) > 120
     or char_length(v_firm) < 1 or char_length(v_firm) > 160
     or v_note is not null and char_length(v_note) > 1000
     or position('@' in v_name) > 0
     or position('@' in v_firm) > 0
     or (v_note is not null and position('@' in v_note) > 0)
     or not exists (select 1 from public.partner_categories c where c.slug = v_slug)
  then
    raise exception 'invalid_interest' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.partner_interest i
    where lower(i.firm) = lower(v_firm)
      and i.created_at > pg_catalog.now() - interval '1 day'
  ) then
    raise exception 'already_sent' using errcode = '23505';
  end if;

  insert into public.partner_interest (contact_name, firm, category_slug, note)
  values (v_name, v_firm, v_slug, v_note)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.submit_partner_interest(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_partner_interest(text, text, text, text) to anon, authenticated;

create or replace function public.staff_list_trusted_partners()
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
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'is_demo', t.is_demo,
      'published', t.published,
      'name', t.name,
      'blurb', t.blurb,
      'monogram', t.monogram,
      'logo_path', t.logo_path,
      'category_slug', t.category_slug,
      'offer', t.offer,
      'sponsor_user_id', t.sponsor_user_id,
      'sort_order', t.sort_order
    ) order by t.sort_order, t.name)
    from public.trusted_partners t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_trusted_partners() from public, anon, authenticated;
grant execute on function public.staff_list_trusted_partners() to authenticated;

create or replace function public.staff_save_trusted_partner(
  p_id uuid,
  p_name text,
  p_blurb text,
  p_monogram text,
  p_is_demo boolean,
  p_category_slug text,
  p_offer text,
  p_sponsor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_blurb text;
  v_monogram text;
  v_slug text;
  v_offer text;
  v_id uuid;
  v_sort int;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_name := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_blurb := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_blurb, '')), '[[:space:]]+', ' ', 'g');
  v_monogram := upper(pg_catalog.btrim(coalesce(p_monogram, '')));
  v_slug := nullif(pg_catalog.btrim(coalesce(p_category_slug, '')), '');
  v_offer := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_offer, '')), '[[:space:]]+', ' ', 'g'), '');

  if v_monogram = '' then
    v_monogram := upper(substring(v_name from 1 for 1));
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120
     or char_length(v_blurb) < 1 or char_length(v_blurb) > 200
     or v_monogram !~ '^[A-Z0-9]{1,3}$'
     or (v_offer is not null and (char_length(v_offer) < 1 or char_length(v_offer) > 400))
     or position('@' in v_name) > 0
     or position('@' in v_blurb) > 0
     or (v_offer is not null and position('@' in v_offer) > 0)
     or (v_slug is not null and not exists (select 1 from public.partner_categories c where c.slug = v_slug))
     or (p_is_demo and p_sponsor_user_id is not null)
  then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  if p_sponsor_user_id is not null and not exists (
    select 1
    from public.members m
    where m.user_id = p_sponsor_user_id
      and m.is_demo = false
      and m.status in ('invited', 'active')
      and private.is_sponsor(m.user_id)
  ) then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  if p_id is null then
    select coalesce(max(t.sort_order), 0) + 1 into v_sort from public.trusted_partners t;
    insert into public.trusted_partners (
      id, is_demo, published, name, blurb, monogram, sort_order, category_slug, offer, sponsor_user_id
    ) values (
      pg_catalog.gen_random_uuid(),
      coalesce(p_is_demo, false),
      false,
      v_name,
      v_blurb,
      v_monogram,
      v_sort,
      v_slug,
      v_offer,
      p_sponsor_user_id
    )
    returning id into v_id;
  else
    update public.trusted_partners
    set
      is_demo = coalesce(p_is_demo, false),
      name = v_name,
      blurb = v_blurb,
      monogram = v_monogram,
      category_slug = v_slug,
      offer = v_offer,
      sponsor_user_id = p_sponsor_user_id
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invalid_partner' using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.staff_save_trusted_partner(uuid, text, text, text, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.staff_save_trusted_partner(uuid, text, text, text, boolean, text, text, uuid) to authenticated;

create or replace function public.staff_set_trusted_partner_published(
  p_id uuid,
  p_published boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.trusted_partners
  set published = coalesce(p_published, false)
  where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'published', coalesce(p_published, false));
end;
$$;

revoke all on function public.staff_set_trusted_partner_published(uuid, boolean) from public, anon, authenticated;
grant execute on function public.staff_set_trusted_partner_published(uuid, boolean) to authenticated;

create or replace function public.staff_reorder_trusted_partners(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_index int;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) < 1 then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  if (select count(distinct u.id) from unnest(p_ids) as u(id)) <> cardinality(p_ids) then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as u(id)
    where not exists (select 1 from public.trusted_partners t where t.id = u.id)
  ) then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  for v_index in 1 .. cardinality(p_ids) loop
    update public.trusted_partners
    set sort_order = v_index
    where id = p_ids[v_index];
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_reorder_trusted_partners(uuid[]) from public, anon, authenticated;
grant execute on function public.staff_reorder_trusted_partners(uuid[]) to authenticated;

create or replace function public.staff_set_trusted_partner_logo(
  p_id uuid,
  p_logo_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_path := nullif(pg_catalog.btrim(coalesce(p_logo_path, '')), '');
  if v_path is not null and v_path is distinct from lower(p_id::text) || '/logo' then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  update public.trusted_partners
  set logo_path = v_path
  where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'logo_path', v_path);
end;
$$;

revoke all on function public.staff_set_trusted_partner_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_set_trusted_partner_logo(uuid, text) to authenticated;

create or replace function public.staff_list_sponsor_options()
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
    select jsonb_agg(listed.row_json order by listed.label)
    from (
      select
        jsonb_build_object(
          'user_id', m.user_id,
          'label', case
            when p.full_name is null or position('@' in p.full_name) > 0 or pg_catalog.btrim(p.full_name) = ''
              then 'Sponsor'
            else pg_catalog.btrim(p.full_name)
          end
        ) as row_json,
        case
          when p.full_name is null or position('@' in p.full_name) > 0 or pg_catalog.btrim(p.full_name) = ''
            then 'Sponsor'
          else pg_catalog.btrim(p.full_name)
        end as label
      from public.members m
      left join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and private.is_sponsor(m.user_id)
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_sponsor_options() from public, anon, authenticated;
grant execute on function public.staff_list_sponsor_options() to authenticated;

create or replace function public.list_sponsor_showcase()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.members m
    where m.user_id = actor
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'blurb', t.blurb,
      'offer', t.offer,
      'monogram', t.monogram,
      'logo_path', t.logo_path,
      'category_slug', t.category_slug,
      'my_request', (
        select r.status
        from public.sponsor_intro_requests r
        where r.partner_id = t.id
          and r.member_id = actor
      )
    ) order by t.sort_order, t.name)
    from public.trusted_partners t
    join public.members sponsor on sponsor.user_id = t.sponsor_user_id
    where t.published
      and t.is_demo = false
      and sponsor.is_demo = false
      and sponsor.status in ('invited', 'active')
      and private.is_sponsor(sponsor.user_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_sponsor_showcase() from public, anon, authenticated;
grant execute on function public.list_sponsor_showcase() to authenticated;

create or replace function public.request_sponsor_intro(p_partner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_status text;
begin
  if actor is null or not exists (
    select 1
    from public.members m
    where m.user_id = actor
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.trusted_partners t
    join public.members sponsor on sponsor.user_id = t.sponsor_user_id
    where t.id = p_partner_id
      and t.published
      and t.is_demo = false
      and sponsor.is_demo = false
      and sponsor.status in ('invited', 'active')
      and private.is_sponsor(sponsor.user_id)
  ) then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  insert into public.sponsor_intro_requests (partner_id, member_id)
  values (p_partner_id, actor)
  on conflict (partner_id, member_id) do nothing;

  select r.status into v_status
  from public.sponsor_intro_requests r
  where r.partner_id = p_partner_id
    and r.member_id = actor;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.request_sponsor_intro(uuid) from public, anon, authenticated;
grant execute on function public.request_sponsor_intro(uuid) to authenticated;

create or replace function public.sponsor_intro_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_pending int;
  v_approved int;
begin
  if actor is null or not private.is_sponsor(actor) then
    return 'null'::jsonb;
  end if;

  select
    count(*) filter (where r.status = 'pending')::int,
    count(*) filter (where r.status = 'approved')::int
  into v_pending, v_approved
  from public.sponsor_intro_requests r
  join public.trusted_partners t on t.id = r.partner_id
  where t.sponsor_user_id = actor;

  return jsonb_build_object('pending', coalesce(v_pending, 0), 'approved', coalesce(v_approved, 0));
end;
$$;

revoke all on function public.sponsor_intro_counts() from public, anon, authenticated;
grant execute on function public.sponsor_intro_counts() to authenticated;

create or replace function public.staff_list_sponsor_intros()
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
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'partner_name', t.name,
      'member_label', case
        when p.full_name is null or position('@' in p.full_name) > 0 or pg_catalog.btrim(p.full_name) = ''
          then 'Member'
        else pg_catalog.btrim(p.full_name)
      end
    ) order by r.created_at)
    from public.sponsor_intro_requests r
    join public.trusted_partners t on t.id = r.partner_id
    left join public.profiles p on p.user_id = r.member_id
    where r.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_sponsor_intros() from public, anon, authenticated;
grant execute on function public.staff_list_sponsor_intros() to authenticated;

create or replace function public.staff_decide_sponsor_intro(
  p_intro_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision is distinct from 'approved' and p_decision is distinct from 'declined' then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  update public.sponsor_intro_requests
  set status = p_decision,
      decided_at = pg_catalog.now()
  where id = p_intro_id
    and status = 'pending'
  returning id into v_id;

  if v_id is null then
    raise exception 'invalid_partner' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_decision);
end;
$$;

revoke all on function public.staff_decide_sponsor_intro(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_decide_sponsor_intro(uuid, text) to authenticated;

create or replace function public.staff_list_partner_interest()
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
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'contact_name', i.contact_name,
      'firm', i.firm,
      'category_slug', i.category_slug,
      'note', i.note,
      'status', i.status,
      'created_at', i.created_at
    ) order by i.created_at desc)
    from public.partner_interest i
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_partner_interest() from public, anon, authenticated;
grant execute on function public.staff_list_partner_interest() to authenticated;

create or replace function public.staff_mark_partner_interest_seen(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.partner_interest
  set status = 'seen'
  where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'invalid_interest' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.staff_mark_partner_interest_seen(uuid) from public, anon, authenticated;
grant execute on function public.staff_mark_partner_interest_seen(uuid) to authenticated;

revoke all on function public.staff_list_trusted_partners() from public, anon;
revoke all on function public.staff_save_trusted_partner(uuid, text, text, text, boolean, text, text, uuid) from public, anon;
revoke all on function public.staff_set_trusted_partner_published(uuid, boolean) from public, anon;
revoke all on function public.staff_reorder_trusted_partners(uuid[]) from public, anon;
revoke all on function public.staff_set_trusted_partner_logo(uuid, text) from public, anon;
revoke all on function public.staff_list_sponsor_options() from public, anon;
revoke all on function public.staff_list_sponsor_intros() from public, anon;
revoke all on function public.staff_decide_sponsor_intro(uuid, text) from public, anon;
revoke all on function public.staff_list_partner_interest() from public, anon;
revoke all on function public.staff_mark_partner_interest_seen(uuid) from public, anon;
