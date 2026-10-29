-- PF-5 admin People > Profiles list.
-- Apply after 20270106120000. Not applied from this pull request.
-- No new table. No Edge function. No mail.
-- Staff read names and profile status through this function only.
-- private.is_staff() is the gate. The list is not written to the access log.
-- Opening one member still uses staff_read_member, which records that read.

create or replace function public.staff_list_profiles()
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
    select pg_catalog.jsonb_agg(q.row_json order by q.updated_at desc nulls last, q.display_name asc)
    from (
      select
        pg_catalog.jsonb_build_object(
          'member_id', m.user_id,
          'display_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''::text), 'Name not set'),
          'seat_label', case m.seat
            when 'ksa' then 'Saudi Arabia'
            when 'intl' then 'International'
            when 'sponsor' then 'Partner'
            else 'Unknown seat'
          end,
          'status', m.status,
          'has_photo', coalesce(pg_catalog.btrim(p.avatar_path), ''::text) <> ''::text,
          'title', nullif(pg_catalog.btrim(p.headline), ''::text),
          'organisation', nullif(pg_catalog.btrim(p.company), ''::text),
          'city_key', nullif(pg_catalog.btrim(p.city_key), ''::text),
          'sector_count', coalesce(pg_catalog.cardinality(p.sector_tags), 0),
          'availability_set', coalesce(pg_catalog.btrim(p.availability), ''::text) <> ''::text,
          'theme_count', coalesce(pg_catalog.cardinality(p.vision_themes), 0),
          'profile_updated_at', p.updated_at,
          'open_suggestion', null::text,
          'open_request', null::text,
          'help_with', null::text,
          'looking_for', null::text,
          'board_seat_type', null::text,
          'board_seat_where', null::text
        ) as row_json,
        p.updated_at,
        coalesce(nullif(pg_catalog.btrim(p.full_name), ''::text), 'Name not set') as display_name
      from public.members m
      left join public.profiles p on p.user_id = m.user_id
      where m.status in ('invited', 'active', 'suspended')
        and m.is_demo = false
        and m.anonymised_at is null
        and not private.sample_subject(m.user_id)
        and not exists (
          select 1
          from public.staff_users s
          where s.user_id = m.user_id
        )
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_profiles() from public, anon;
grant execute on function public.staff_list_profiles() to authenticated;

comment on function public.staff_list_profiles() is
  'Admin list of member profile status. Names, seat, and status only. No email, phone, or other contact fields. Closed accounts, staff, and sample rows are left out. The list read is not logged.';
