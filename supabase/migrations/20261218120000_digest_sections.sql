-- Weekly digest sections. Six fixed sections live on the existing issue payload.
-- Does not send mail. Does not schedule anything. Does not edit earlier migrations.
-- Apply via MCP after 20261214120000_digest_review_tiers.sql.
-- Slot 20261218120000. 20261216120000 and 20261217120000 belong to other open work.
-- Factory does not apply migrations.

create or replace function private.digest_http_url(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_text text;
begin
  v_text := pg_catalog.left(pg_catalog.btrim(coalesce(p_value, '')), 300);
  if v_text !~ '^https?://[^[:space:]@]+$' then
    return '';
  end if;
  return v_text;
end;
$fn$;

revoke all on function private.digest_http_url(text) from public, anon, authenticated;

create or replace function private.digest_linkedin_url(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_text text;
  v_host text;
begin
  v_text := private.digest_http_url(p_value);
  if v_text = '' or v_text !~* '^https://' then
    return '';
  end if;
  v_host := pg_catalog.lower(
    pg_catalog.split_part(pg_catalog.split_part(v_text, '://', 2), '/', 1)
  );
  if v_host = 'linkedin.com' or v_host ~ '\.linkedin\.com$' then
    return v_text;
  end if;
  return '';
end;
$fn$;

revoke all on function private.digest_linkedin_url(text) from public, anon, authenticated;

create or replace function private.digest_hidden_sections(p_rows jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select pg_catalog.jsonb_agg(listed.item order by listed.ord)
    from (
      select raw.item, min(raw.ord) as ord
      from pg_catalog.jsonb_array_elements_text(coalesce(p_rows, '[]'::jsonb))
        with ordinality as raw(item, ord)
      where raw.item in ('boardroom', 'deals', 'platform', 'database', 'majlis', 'partner')
      group by raw.item
    ) listed
  ), '[]'::jsonb);
$fn$;

revoke all on function private.digest_hidden_sections(jsonb) from public, anon, authenticated;

create or replace function private.digest_clean_list(p_rows jsonb, p_kind text)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_text text;
begin
  for v_item in
    select listed.item
    from pg_catalog.jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
      with ordinality as listed(item, ord)
    order by listed.ord
  loop
    if p_kind = 'member' then
      v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', case
          when coalesce(v_item->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then v_item->>'id'
          else null
        end,
        'full_name', coalesce(nullif(private.digest_plain(v_item->>'full_name', 200), ''), 'Member'),
        'headline', nullif(private.digest_plain(v_item->>'headline', 160), ''),
        'company', nullif(private.digest_plain(v_item->>'company', 200), ''),
        'key', case when coalesce(v_item->>'key', '') = 'true' then true else null end
      )));
    elsif p_kind = 'mandate' then
      v_text := private.digest_plain(v_item->>'one_liner', 280);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'sector', private.digest_plain(v_item->>'sector', 120),
          'deal_type', private.digest_plain(v_item->>'deal_type', 80),
          'ticket_band', private.digest_plain(v_item->>'ticket_band', 40),
          'geography', nullif(private.digest_plain(v_item->>'geography', 40), ''),
          'stage', private.digest_plain(v_item->>'stage', 40),
          'one_liner', v_text
        )));
      end if;
    elsif p_kind = 'event' then
      v_text := private.digest_plain(v_item->>'title', 160);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'title', v_text,
          'starts_at', private.digest_plain(v_item->>'starts_at', 40),
          'region', nullif(private.digest_plain(v_item->>'region', 80), ''),
          'host_name', coalesce(nullif(private.digest_plain(v_item->>'host_name', 200), ''), 'Board Arabia'),
          'venue_address', nullif(private.digest_plain(v_item->>'venue_address', 200), '')
        )));
      end if;
    elsif p_kind = 'intro' then
      v_text := private.digest_plain(v_item->>'full_name', 200);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'full_name', v_text,
          'headline', private.digest_plain(v_item->>'headline', 160),
          'company', private.digest_plain(v_item->>'company', 200),
          'reason', private.digest_plain(v_item->>'reason', 200)
        ));
      end if;
    elsif p_kind = 'note' then
      v_text := private.digest_plain(v_item->>'text', 500);
      if v_text <> '' then
        v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('text', v_text));
      end if;
    end if;
  end loop;
  return v_out;
end;
$fn$;

revoke all on function private.digest_clean_list(jsonb, text) from public, anon, authenticated;

create or replace function private.digest_clean_news(p_rows jsonb, p_hidden boolean)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_count integer;
  v_headline text;
  v_sentences jsonb;
  v_sentence text;
  v_sentence_count integer;
  v_sources jsonb;
  v_source jsonb;
  v_source_count integer;
  v_url text;
  v_people jsonb;
  v_person jsonb;
  v_name text;
  v_li text;
  v_lens text;
begin
  if pg_catalog.jsonb_typeof(v_rows) is distinct from 'array' then
    v_rows := '[]'::jsonb;
  end if;
  v_count := pg_catalog.jsonb_array_length(v_rows);
  if v_count > 4 or (not coalesce(p_hidden, false) and v_count = 1) then
    raise exception 'digest_news_count' using errcode = '22023';
  end if;
  if v_count = 0 then
    return '[]'::jsonb;
  end if;

  for v_item in
    select listed.item
    from pg_catalog.jsonb_array_elements(v_rows) with ordinality as listed(item, ord)
    order by listed.ord
  loop
    v_headline := private.digest_plain(v_item->>'headline', 160);
    if v_headline = '' then
      raise exception 'digest_news_invalid' using errcode = '22023';
    end if;

    v_sentences := '[]'::jsonb;
    v_sentence_count := 0;
    if pg_catalog.jsonb_typeof(v_item->'sentences') = 'array' then
      for v_sentence in
        select listed.item #>> '{}'
        from pg_catalog.jsonb_array_elements(v_item->'sentences') with ordinality as listed(item, ord)
        order by listed.ord
      loop
        v_sentence := private.digest_plain(v_sentence, 280);
        if v_sentence <> '' then
          v_sentence_count := v_sentence_count + 1;
          if v_sentence_count > 3 then
            raise exception 'digest_news_invalid' using errcode = '22023';
          end if;
          v_sentences := v_sentences || pg_catalog.jsonb_build_array(v_sentence);
        end if;
      end loop;
    end if;
    if v_sentence_count < 2 then
      raise exception 'digest_news_invalid' using errcode = '22023';
    end if;

    v_sources := '[]'::jsonb;
    v_source_count := 0;
    if pg_catalog.jsonb_typeof(v_item->'sources') = 'array' then
      for v_source in
        select listed.item
        from pg_catalog.jsonb_array_elements(v_item->'sources') with ordinality as listed(item, ord)
        order by listed.ord
      loop
        if pg_catalog.btrim(coalesce(v_source->>'url', '')) <> ''
           and private.digest_http_url(v_source->>'url') = '' then
          raise exception 'digest_link_invalid' using errcode = '22023';
        end if;
        v_url := private.digest_http_url(v_source->>'url');
        if v_url <> '' then
          v_source_count := v_source_count + 1;
          if v_source_count > 6 then
            raise exception 'digest_news_invalid' using errcode = '22023';
          end if;
          v_sources := v_sources || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'label', coalesce(nullif(private.digest_plain(v_source->>'label', 120), ''), 'Source'),
            'url', v_url
          ));
        end if;
      end loop;
    end if;
    if v_source_count < 1 then
      raise exception 'digest_news_invalid' using errcode = '22023';
    end if;

    v_people := '[]'::jsonb;
    if pg_catalog.jsonb_typeof(v_item->'people') = 'array' then
      for v_person in
        select listed.item
        from pg_catalog.jsonb_array_elements(v_item->'people') with ordinality as listed(item, ord)
        order by listed.ord
      loop
        v_name := private.digest_plain(v_person->>'name', 200);
        if v_name = '' then
          continue;
        end if;
        if pg_catalog.btrim(coalesce(v_person->>'linkedin_url', '')) <> ''
           and private.digest_linkedin_url(v_person->>'linkedin_url') = '' then
          raise exception 'digest_link_invalid' using errcode = '22023';
        end if;
        v_li := private.digest_linkedin_url(v_person->>'linkedin_url');
        v_people := v_people || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'name', v_name,
          'linkedin_url', nullif(v_li, '')
        )));
      end loop;
    end if;

    v_lens := nullif(private.digest_plain(v_item->>'board_lens', 280), '');
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'headline', v_headline,
      'sentences', v_sentences,
      'board_lens', v_lens,
      'sources', v_sources,
      'people', v_people
    )));
  end loop;
  return v_out;
end;
$fn$;

revoke all on function private.digest_clean_news(jsonb, boolean) from public, anon, authenticated;

create or replace function private.digest_clean_bullets(p_rows jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_out jsonb := '[]'::jsonb;
  v_text text;
  v_count integer := 0;
begin
  if pg_catalog.jsonb_typeof(v_rows) is distinct from 'array' then
    return '[]'::jsonb;
  end if;
  for v_text in
    select listed.item #>> '{}'
    from pg_catalog.jsonb_array_elements(v_rows) with ordinality as listed(item, ord)
    order by listed.ord
  loop
    v_text := private.digest_plain(v_text, 200);
    if v_text <> '' then
      v_count := v_count + 1;
      if v_count > 3 then
        raise exception 'digest_platform_count' using errcode = '22023';
      end if;
      v_out := v_out || pg_catalog.jsonb_build_array(v_text);
    end if;
  end loop;
  return v_out;
end;
$fn$;

revoke all on function private.digest_clean_bullets(jsonb) from public, anon, authenticated;

create or replace function private.digest_clean_diary(p_rows jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_count integer := 0;
  v_title text;
  v_when text;
  v_sources jsonb;
  v_source jsonb;
  v_url text;
  v_source_count integer;
begin
  if pg_catalog.jsonb_typeof(v_rows) is distinct from 'array' then
    return '[]'::jsonb;
  end if;
  for v_item in
    select listed.item
    from pg_catalog.jsonb_array_elements(v_rows) with ordinality as listed(item, ord)
    order by listed.ord
  loop
    v_count := v_count + 1;
    if v_count > 4 then
      raise exception 'digest_diary_count' using errcode = '22023';
    end if;
    v_title := private.digest_plain(v_item->>'title', 160);
    v_when := private.digest_plain(v_item->>'when', 40);
    if v_title = '' or v_when = '' then
      raise exception 'digest_diary_invalid' using errcode = '22023';
    end if;
    v_sources := '[]'::jsonb;
    v_source_count := 0;
    if pg_catalog.jsonb_typeof(v_item->'sources') = 'array' then
      for v_source in
        select listed.item
        from pg_catalog.jsonb_array_elements(v_item->'sources') with ordinality as listed(item, ord)
        order by listed.ord
      loop
        if pg_catalog.btrim(coalesce(v_source->>'url', '')) <> ''
           and private.digest_http_url(v_source->>'url') = '' then
          raise exception 'digest_link_invalid' using errcode = '22023';
        end if;
        v_url := private.digest_http_url(v_source->>'url');
        if v_url <> '' then
          v_source_count := v_source_count + 1;
          v_sources := v_sources || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'label', coalesce(nullif(private.digest_plain(v_source->>'label', 120), ''), 'Source'),
            'url', v_url
          ));
        end if;
      end loop;
    end if;
    if v_source_count < 1 then
      raise exception 'digest_diary_invalid' using errcode = '22023';
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'title', v_title,
      'when', v_when,
      'sources', v_sources
    ));
  end loop;
  return v_out;
end;
$fn$;

revoke all on function private.digest_clean_diary(jsonb) from public, anon, authenticated;

create or replace function private.digest_clean_partner(p_row jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_sentences jsonb := '[]'::jsonb;
  v_sentence text;
  v_count integer := 0;
  v_url text;
  v_raw text;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) = 'null' then
    return null;
  end if;
  if pg_catalog.jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'digest_partner_invalid' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_row->'sentences') = 'array' then
    for v_sentence in
      select listed.item #>> '{}'
      from pg_catalog.jsonb_array_elements(p_row->'sentences') with ordinality as listed(item, ord)
      order by listed.ord
    loop
      v_sentence := private.digest_plain(v_sentence, 280);
      if v_sentence <> '' then
        v_count := v_count + 1;
        if v_count > 3 then
          raise exception 'digest_partner_invalid' using errcode = '22023';
        end if;
        v_sentences := v_sentences || pg_catalog.jsonb_build_array(v_sentence);
      end if;
    end loop;
  end if;
  v_raw := pg_catalog.btrim(coalesce(p_row->'source'->>'url', ''));
  v_url := private.digest_http_url(v_raw);
  if v_count = 0 and v_raw = '' then
    return null;
  end if;
  if v_raw <> '' and v_url = '' then
    raise exception 'digest_link_invalid' using errcode = '22023';
  end if;
  if v_count < 2 or v_url = '' then
    raise exception 'digest_partner_invalid' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'label', 'Partner content',
    'sentences', v_sentences,
    'source', pg_catalog.jsonb_build_object(
      'label', coalesce(nullif(private.digest_plain(p_row->'source'->>'label', 120), ''), 'Source'),
      'url', v_url
    )
  );
end;
$fn$;

revoke all on function private.digest_clean_partner(jsonb) from public, anon, authenticated;

create or replace function private.digest_store_payload(p_payload jsonb, p_year integer, p_week integer)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_hidden jsonb;
  v_minutes integer := 0;
begin
  if pg_catalog.jsonb_typeof(v_payload) is distinct from 'object' then
    v_payload := '{}'::jsonb;
  end if;
  v_hidden := private.digest_hidden_sections(v_payload->'hidden_sections');
  if coalesce(v_payload->>'read_minutes', '') ~ '^[0-9]+$' then
    v_minutes := least(30, (v_payload->>'read_minutes')::integer);
  end if;
  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', p_year,
    'iso_week', p_week,
    'issue_number', nullif(private.digest_plain(v_payload->>'issue_number', 20), ''),
    'issue_date', nullif(private.digest_plain(v_payload->>'issue_date', 40), ''),
    'read_minutes', v_minutes,
    'opening', nullif(private.digest_plain(v_payload->>'opening', 500), ''),
    'hidden_sections', v_hidden,
    'boardroom', private.digest_clean_news(v_payload->'boardroom', v_hidden ? 'boardroom'),
    'deals', private.digest_clean_news(v_payload->'deals', v_hidden ? 'deals'),
    'platform_bullets', private.digest_clean_bullets(v_payload->'platform_bullets'),
    'feature_tip', nullif(private.digest_plain(v_payload->>'feature_tip', 280), ''),
    'new_members', private.digest_clean_list(v_payload->'new_members', 'member'),
    'key_members', private.digest_clean_list(v_payload->'key_members', 'member'),
    'new_mandates', private.digest_clean_list(v_payload->'new_mandates', 'mandate'),
    'upcoming_events', private.digest_clean_list(v_payload->'upcoming_events', 'event'),
    'diary', private.digest_clean_diary(v_payload->'diary'),
    'partner_insight', private.digest_clean_partner(v_payload->'partner_insight'),
    'introductions', private.digest_clean_list(
      case when v_payload ? 'introductions' then v_payload->'introductions' else v_payload->'preview_intros' end,
      'intro'
    ),
    'notes', private.digest_clean_list(v_payload->'notes', 'note'),
    'preview_intros', private.digest_clean_list(
      case when v_payload ? 'introductions' then v_payload->'introductions' else v_payload->'preview_intros' end,
      'intro'
    )
  );
end;
$fn$;

revoke all on function private.digest_store_payload(jsonb, integer, integer) from public, anon, authenticated;

create or replace function private.digest_with_preview(p_payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', p_payload->'iso_year',
    'iso_week', p_payload->'iso_week',
    'issue_number', to_jsonb(coalesce(p_payload->>'issue_number', p_payload->>'iso_week', '')),
    'issue_date', to_jsonb(coalesce(p_payload->>'issue_date', '')),
    'read_minutes', coalesce(p_payload->'read_minutes', '0'::jsonb),
    'opening', to_jsonb(coalesce(p_payload->>'opening', '')),
    'hidden_sections', coalesce(p_payload->'hidden_sections', '[]'::jsonb),
    'boardroom', coalesce(p_payload->'boardroom', '[]'::jsonb),
    'deals', coalesce(p_payload->'deals', '[]'::jsonb),
    'platform_bullets', coalesce(p_payload->'platform_bullets', '[]'::jsonb),
    'feature_tip', to_jsonb(coalesce(p_payload->>'feature_tip', '')),
    'new_members', coalesce(p_payload->'new_members', '[]'::jsonb),
    'key_members', coalesce(p_payload->'key_members', '[]'::jsonb),
    'new_mandates', private.digest_strip_ids(p_payload->'new_mandates'),
    'upcoming_events', private.digest_strip_ids(p_payload->'upcoming_events'),
    'diary', coalesce(p_payload->'diary', '[]'::jsonb),
    'partner_insight', case
      when p_payload ? 'partner_insight' then p_payload->'partner_insight'
      else 'null'::jsonb
    end,
    'notes', coalesce(p_payload->'notes', '[]'::jsonb),
    'introductions', case
      when p_payload ? 'introductions' then p_payload->'introductions'
      else '[]'::jsonb
    end,
    'preview_intros', case
      when p_payload ? 'preview_intros' then p_payload->'preview_intros'
      else private.digest_preview_intros()
    end
  );
$fn$;

revoke all on function private.digest_with_preview(jsonb) from public, anon, authenticated;

create or replace function public.my_weekly_digest()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_payload jsonb;
  v_hidden jsonb;
  v_members jsonb;
  v_key_members jsonb;
  v_events jsonb;
  v_sponsor boolean;
  v_platform boolean;
  v_database boolean;
  v_majlis boolean;
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

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.payload
    into v_payload
  from public.digest_issues i
  join public.members me on me.user_id = auth.uid()
  where i.iso_year = v_year
    and i.iso_week = v_week
    and i.status = 'approved'
    and me.tiers && i.audience;

  if v_payload is null then
    return pg_catalog.jsonb_build_object(
      'mail_ready', false,
      'iso_year', v_year,
      'iso_week', v_week,
      'issue_number', v_week::text,
      'issue_date', '',
      'read_minutes', 0,
      'opening', '',
      'hidden_sections', '[]'::jsonb,
      'boardroom', '[]'::jsonb,
      'deals', '[]'::jsonb,
      'platform_bullets', '[]'::jsonb,
      'feature_tip', '',
      'new_members', '[]'::jsonb,
      'key_members', '[]'::jsonb,
      'new_mandates', '[]'::jsonb,
      'upcoming_events', '[]'::jsonb,
      'diary', '[]'::jsonb,
      'partner_insight', 'null'::jsonb,
      'introductions', '[]'::jsonb,
      'suggestions', '[]'::jsonb,
      'notes', '[]'::jsonb
    );
  end if;

  v_hidden := coalesce(v_payload->'hidden_sections', '[]'::jsonb);
  v_platform := v_hidden ? 'platform';
  v_database := v_hidden ? 'database';
  v_majlis := v_hidden ? 'majlis';
  v_sponsor := private.is_sponsor(auth.uid()) and not private.is_staff();

  select coalesce(pg_catalog.jsonb_agg((item - 'id') order by item->>'full_name'), '[]'::jsonb)
    into v_members
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'new_members', '[]'::jsonb)) item
  where coalesce(item->>'full_name', '') <> ''
    and (
      coalesce(item->>'id', '') !~ '^[0-9a-fA-F-]{36}$'
      or (
        private.digest_member_visible((item->>'id')::uuid)
        and private.caller_sees_member_card((item->>'id')::uuid)
      )
    );

  select coalesce(pg_catalog.jsonb_agg((item - 'id') order by item->>'full_name'), '[]'::jsonb)
    into v_key_members
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'key_members', '[]'::jsonb)) item
  where coalesce(item->>'full_name', '') <> ''
    and (
      coalesce(item->>'id', '') !~ '^[0-9a-fA-F-]{36}$'
      or (
        private.digest_member_visible((item->>'id')::uuid)
        and private.caller_sees_member_card((item->>'id')::uuid)
      )
    );

  if v_sponsor or v_majlis then
    v_events := '[]'::jsonb;
  else
    v_events := coalesce(v_payload->'upcoming_events', '[]'::jsonb);
  end if;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', v_year,
    'iso_week', v_week,
    'issue_number', coalesce(v_payload->>'issue_number', v_week::text),
    'issue_date', coalesce(v_payload->>'issue_date', ''),
    'read_minutes', coalesce(v_payload->'read_minutes', '0'::jsonb),
    'opening', coalesce(v_payload->>'opening', ''),
    'hidden_sections', v_hidden,
    'boardroom', case when v_hidden ? 'boardroom' then '[]'::jsonb else coalesce(v_payload->'boardroom', '[]'::jsonb) end,
    'deals', case when v_hidden ? 'deals' then '[]'::jsonb else coalesce(v_payload->'deals', '[]'::jsonb) end,
    'platform_bullets', case when v_platform then '[]'::jsonb else coalesce(v_payload->'platform_bullets', '[]'::jsonb) end,
    'feature_tip', case when v_platform then '' else coalesce(v_payload->>'feature_tip', '') end,
    'new_members', case when v_database then '[]'::jsonb else coalesce(v_members, '[]'::jsonb) end,
    'key_members', case when v_database then '[]'::jsonb else coalesce(v_key_members, '[]'::jsonb) end,
    'new_mandates', case when v_database then '[]'::jsonb else coalesce(v_payload->'new_mandates', '[]'::jsonb) end,
    'upcoming_events', v_events,
    'diary', case when v_majlis then '[]'::jsonb else coalesce(v_payload->'diary', '[]'::jsonb) end,
    'partner_insight', case when v_hidden ? 'partner' then 'null'::jsonb else coalesce(v_payload->'partner_insight', 'null'::jsonb) end,
    'introductions', case when v_platform then '[]'::jsonb else coalesce(v_payload->'introductions', '[]'::jsonb) end,
    'suggestions', case when v_platform then '[]'::jsonb else coalesce(v_payload->'introductions', '[]'::jsonb) end,
    'notes', case when v_platform then '[]'::jsonb else coalesce(v_payload->'notes', '[]'::jsonb) end
  );
end;
$fn$;

revoke all on function public.my_weekly_digest() from public, anon;
grant execute on function public.my_weekly_digest() to authenticated;

comment on function public.my_weekly_digest() is
  'Approved issue for the signed-in member when their tier is selected. Section 4 drops hidden, demo, and sample members, and a partner only sees members who opted in. mail_ready is false. Does not send mail.';
