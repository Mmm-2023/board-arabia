-- Staff create one mandate.
-- private.is_staff() requires aal2. This function does not change an existing row.
-- is_demo is always false, so a new mandate is not an Example.
-- published is always false. Publishing stays a separate step.
-- Existing Example rows are left as they are.
-- The old contact and deck checks only allowed the sample host, so a real
-- mandate could not be saved. The shape checks below still accept those rows.

alter table public.mandates drop constraint if exists mandates_contact_email_test;
alter table public.mandates drop constraint if exists mandates_contact_email_shape;
alter table public.mandates
  add constraint mandates_contact_email_shape check (
    char_length(btrim(contact_email)) between 3 and 200
    and lower(btrim(contact_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

alter table public.mandates drop constraint if exists mandates_deck_test;
alter table public.mandates drop constraint if exists mandates_deck_url_shape;
alter table public.mandates
  add constraint mandates_deck_url_shape check (
    deck_url is null
    or (
      char_length(btrim(deck_url)) between 12 and 300
      and position('@' in deck_url) = 0
      and deck_url ~ '^https://[a-z0-9.-]+/'
    )
  );

create or replace function public.staff_create_mandate(
  p_sector text,
  p_deal_type text,
  p_ticket_band text,
  p_geography text,
  p_stage text,
  p_one_liner text,
  p_company_name text,
  p_exact_amount text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_deck_url text,
  p_narrative text,
  p_sector_tags text[],
  p_vision_themes text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sector text;
  v_deal_type text;
  v_ticket text;
  v_geography text;
  v_stage text;
  v_one_liner text;
  v_company text;
  v_amount text;
  v_terms text;
  v_contact_name text;
  v_email text;
  v_phone text;
  v_deck text;
  v_narrative text;
  v_sectors text[];
  v_themes text[];
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_sector := btrim(coalesce(p_sector, ''));
  v_deal_type := btrim(coalesce(p_deal_type, ''));
  v_ticket := btrim(coalesce(p_ticket_band, ''));
  v_geography := btrim(coalesce(p_geography, ''));
  v_stage := btrim(coalesce(p_stage, ''));
  v_one_liner := btrim(coalesce(p_one_liner, ''));
  v_company := btrim(coalesce(p_company_name, ''));
  v_amount := btrim(coalesce(p_exact_amount, ''));
  v_terms := btrim(coalesce(p_terms, ''));
  v_contact_name := btrim(coalesce(p_contact_name, ''));
  v_email := lower(btrim(coalesce(p_contact_email, '')));
  v_phone := btrim(coalesce(p_contact_phone, ''));
  v_deck := nullif(btrim(coalesce(p_deck_url, '')), '');
  v_narrative := btrim(coalesce(p_narrative, ''));
  v_sectors := coalesce(p_sector_tags, '{}'::text[]);
  v_themes := coalesce(p_vision_themes, '{}'::text[]);

  if char_length(v_sector) < 1 or char_length(v_sector) > 120
     or char_length(v_deal_type) < 1 or char_length(v_deal_type) > 80
     or char_length(v_ticket) < 1 or char_length(v_ticket) > 40
     or char_length(v_geography) < 1 or char_length(v_geography) > 80
     or char_length(v_stage) < 1 or char_length(v_stage) > 80
     or char_length(v_one_liner) < 1 or char_length(v_one_liner) > 280
     or char_length(v_company) < 1 or char_length(v_company) > 200
     or char_length(v_amount) < 1 or char_length(v_amount) > 120
     or char_length(v_terms) < 1 or char_length(v_terms) > 400
     or char_length(v_contact_name) < 1 or char_length(v_contact_name) > 120
     or char_length(v_email) < 3 or char_length(v_email) > 200
     or char_length(v_phone) < 1 or char_length(v_phone) > 40
     or char_length(v_narrative) < 1 or char_length(v_narrative) > 2000
     or (v_deck is not null and (char_length(v_deck) < 12 or char_length(v_deck) > 300))
     or position('@' in v_sector) > 0
     or position('@' in v_deal_type) > 0
     or position('@' in v_ticket) > 0
     or position('@' in v_geography) > 0
     or position('@' in v_stage) > 0
     or position('@' in v_one_liner) > 0
     or position('@' in v_company) > 0
     or position('@' in v_amount) > 0
     or position('@' in v_terms) > 0
     or position('@' in v_contact_name) > 0
     or position('@' in v_phone) > 0
     or position('@' in v_narrative) > 0
     or (v_deck is not null and position('@' in v_deck) > 0)
     or position(lower(v_company) in lower(v_one_liner)) > 0
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or (v_deck is not null and v_deck !~ '^https://[a-z0-9.-]+/')
     or not private.profile_tags_allowed(v_sectors, private.profile_sector_tags(), 3)
     or not private.profile_tags_allowed(v_themes, private.profile_vision_themes(), 3)
  then
    raise exception 'invalid_mandate' using errcode = '22023';
  end if;

  insert into public.mandates (
    id,
    is_demo,
    published,
    sector,
    deal_type,
    ticket_band,
    geography,
    stage,
    one_liner,
    company_name,
    exact_amount,
    terms,
    contact_name,
    contact_email,
    contact_phone,
    deck_url,
    narrative,
    sector_tags,
    vision_themes,
    sort_order
  ) values (
    pg_catalog.gen_random_uuid(),
    false,
    false,
    v_sector,
    v_deal_type,
    v_ticket,
    v_geography,
    v_stage,
    v_one_liner,
    v_company,
    v_amount,
    v_terms,
    v_contact_name,
    v_email,
    v_phone,
    v_deck,
    v_narrative,
    v_sectors,
    v_themes,
    0
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'is_demo', false,
    'published', false,
    'sector', v_sector,
    'deal_type', v_deal_type,
    'ticket_band', v_ticket,
    'geography', v_geography,
    'stage', v_stage,
    'one_liner', v_one_liner,
    'company_name', v_company
  );
end;
$$;

revoke all on function public.staff_create_mandate(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text[], text[]
) from public, anon, authenticated;

revoke all on function public.staff_create_mandate(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text[], text[]
) from public, anon;

grant execute on function public.staff_create_mandate(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text[], text[]
) to authenticated;
