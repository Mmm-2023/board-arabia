-- Staff shortlist for a mandate.
-- Sector tags, Vision 2030 themes, and availability are matched here.
-- Members cannot execute these functions. Nothing is emailed or notified.
-- Sample directory rows are not members, so they never appear.
-- Weights: 3 per shared sector, 2 per shared Vision 2030 theme,
-- 2 when availability is open, 1 when it is selective.
-- Those weights match src/lib/mandateMatch.ts.

create or replace function private.tag_overlap(left_tags text[], right_tags text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    array(
      select listed.item
      from unnest(coalesce(left_tags, '{}'::text[])) with ordinality as listed(item, ord)
      where listed.item is not null
        and listed.item = any (coalesce(right_tags, '{}'::text[]))
      order by listed.ord
    ),
    '{}'::text[]
  );
$$;

revoke all on function private.tag_overlap(text[], text[]) from public, anon, authenticated;

create or replace function private.mandate_effective_tags(
  p_sector text,
  p_sector_tags text[],
  p_vision text[]
)
returns table(sector_tags text[], vision_themes text[])
language sql
stable
set search_path = public
as $$
  select
    case
      when cardinality(cleaned.sector_tags) > 0 then cleaned.sector_tags
      when p_sector = any (private.profile_sector_tags()) then array[p_sector]::text[]
      else '{}'::text[]
    end,
    cleaned.vision_themes
  from (
    select
      private.tag_overlap(p_sector_tags, private.profile_sector_tags()) as sector_tags,
      private.tag_overlap(p_vision, private.profile_vision_themes()) as vision_themes
  ) cleaned;
$$;

revoke all on function private.mandate_effective_tags(text, text[], text[]) from public, anon, authenticated;

alter table public.mandates
  add column if not exists sector_tags text[] not null default '{}',
  add column if not exists vision_themes text[] not null default '{}';

update public.mandates
set sector_tags = array[sector]::text[]
where cardinality(sector_tags) = 0
  and sector = any (private.profile_sector_tags());

update public.mandates
set vision_themes = array['Renewable energy', 'Thriving economy']::text[]
where id = 'a2000001-0000-4000-8000-000000000001'
  and cardinality(vision_themes) = 0;

update public.mandates
set vision_themes = array['Health transformation']::text[]
where id = 'a2000001-0000-4000-8000-000000000002'
  and cardinality(vision_themes) = 0;

update public.mandates
set vision_themes = array['Tourism', 'Quality of life']::text[]
where id = 'a2000001-0000-4000-8000-000000000003'
  and cardinality(vision_themes) = 0;

update public.mandates
set vision_themes = array['Industrial development and logistics']::text[]
where id = 'a2000001-0000-4000-8000-000000000004'
  and cardinality(vision_themes) = 0;

update public.mandates
set vision_themes = array['Thriving economy']::text[]
where id = 'a2000001-0000-4000-8000-000000000005'
  and cardinality(vision_themes) = 0;

update public.mandates
set vision_themes = array['Food security']::text[]
where id = 'a2000001-0000-4000-8000-000000000006'
  and cardinality(vision_themes) = 0;

alter table public.mandates drop constraint if exists mandates_sector_tags_ok;
alter table public.mandates
  add constraint mandates_sector_tags_ok
  check (private.profile_tags_allowed(sector_tags, private.profile_sector_tags(), 3));

alter table public.mandates drop constraint if exists mandates_vision_themes_ok;
alter table public.mandates
  add constraint mandates_vision_themes_ok
  check (private.profile_tags_allowed(vision_themes, private.profile_vision_themes(), 3));

create or replace function public.staff_list_mandates()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by published desc, sort_order, created_at)
    from (
      select
        m.published,
        m.sort_order,
        m.created_at,
        jsonb_build_object(
          'id', m.id,
          'is_demo', m.is_demo,
          'published', m.published,
          'sector', m.sector,
          'deal_type', m.deal_type,
          'ticket_band', m.ticket_band,
          'geography', m.geography,
          'stage', m.stage,
          'one_liner', m.one_liner,
          'company_name', m.company_name,
          'sector_tags', coalesce(to_jsonb(tags.sector_tags), '[]'::jsonb),
          'vision_themes', coalesce(to_jsonb(tags.vision_themes), '[]'::jsonb),
          'match_count', (
            select count(*)::int
            from public.members mem
            join public.profiles prof on prof.user_id = mem.user_id
            where mem.is_demo = false
              and mem.status = 'active'
              and prof.availability in ('open', 'selective')
              and cardinality(private.tag_overlap(tags.sector_tags, prof.sector_tags))
                + cardinality(private.tag_overlap(tags.vision_themes, prof.vision_themes)) > 0
          )
        ) as payload
      from public.mandates m
      cross join lateral private.mandate_effective_tags(m.sector, m.sector_tags, m.vision_themes) tags
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_mandates() from public, anon;
grant execute on function public.staff_list_mandates() to authenticated;

create or replace function public.staff_list_mandate_matches(p_mandate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mandate public.mandates%rowtype;
  v_sector text[];
  v_vision text[];
  v_matches jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_mandate
  from public.mandates
  where id = p_mandate_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select tags.sector_tags, tags.vision_themes
    into v_sector, v_vision
  from private.mandate_effective_tags(v_mandate.sector, v_mandate.sector_tags, v_mandate.vision_themes) tags;

  select coalesce(jsonb_agg(payload order by score desc, sector_n desc, vision_n desc, sort_name, user_id), '[]'::jsonb)
    into v_matches
  from (
    select
      score,
      sector_n,
      vision_n,
      sort_name,
      user_id,
      jsonb_build_object(
        'user_id', user_id,
        'full_name', full_name,
        'headline', headline,
        'company', company,
        'seat', seat,
        'availability', availability,
        'sector_overlap', coalesce(to_jsonb(sector_hits), '[]'::jsonb),
        'vision_overlap', coalesce(to_jsonb(vision_hits), '[]'::jsonb),
        'score', score
      ) as payload
    from (
      select
        hit.user_id,
        hit.full_name,
        hit.headline,
        hit.company,
        hit.seat,
        hit.availability,
        hit.sector_hits,
        hit.vision_hits,
        cardinality(hit.sector_hits) as sector_n,
        cardinality(hit.vision_hits) as vision_n,
        lower(hit.full_name) as sort_name,
        (cardinality(hit.sector_hits) * 3)
          + (cardinality(hit.vision_hits) * 2)
          + (case when hit.availability = 'open' then 2 else 1 end) as score
      from (
        select
          mem.user_id,
          coalesce(nullif(trim(prof.full_name), ''), 'Member') as full_name,
          coalesce(prof.headline, '') as headline,
          coalesce(prof.company, '') as company,
          mem.seat,
          prof.availability,
          private.tag_overlap(v_sector, prof.sector_tags) as sector_hits,
          private.tag_overlap(v_vision, prof.vision_themes) as vision_hits
        from public.members mem
        join public.profiles prof on prof.user_id = mem.user_id
        where mem.is_demo = false
          and mem.status = 'active'
          and prof.availability in ('open', 'selective')
      ) hit
      where cardinality(hit.sector_hits) + cardinality(hit.vision_hits) > 0
    ) scored
  ) ranked;

  return jsonb_build_object(
    'id', v_mandate.id,
    'is_demo', v_mandate.is_demo,
    'published', v_mandate.published,
    'sector', v_mandate.sector,
    'deal_type', v_mandate.deal_type,
    'ticket_band', v_mandate.ticket_band,
    'geography', v_mandate.geography,
    'stage', v_mandate.stage,
    'one_liner', v_mandate.one_liner,
    'company_name', v_mandate.company_name,
    'sector_tags', coalesce(to_jsonb(v_sector), '[]'::jsonb),
    'vision_themes', coalesce(to_jsonb(v_vision), '[]'::jsonb),
    'matches', v_matches
  );
end;
$$;

revoke all on function public.staff_list_mandate_matches(uuid) from public, anon;
grant execute on function public.staff_list_mandate_matches(uuid) to authenticated;
