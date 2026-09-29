-- Read path for member deal rooms.
-- Writes stay on the deal-room Edge functions. The client must not select
-- rooms or room_participants. These functions return names and statuses only.

create or replace function public.list_my_deal_rooms()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(listed.room_json order by listed.created_at desc, listed.name)
    from (
      select
        r.created_at,
        r.name,
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'purpose', coalesce(r.purpose, ''),
          'status', r.status,
          'opened_by', r.opened_by,
          'owner_member_id', r.owner_member_id,
          'mandate_id', r.mandate_id,
          're_opportunity_id', r.re_opportunity_id,
          'created_at', r.created_at,
          'my_role', me.role,
          'my_invite_status', me.invite_status,
          'participants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'member_id', p.member_id,
                'role', p.role,
                'invite_status', p.invite_status,
                'full_name', left(coalesce(nullif(trim(pr.full_name), ''), 'Member'), 200)
              )
              order by p.created_at
            )
            from public.room_participants p
            left join public.profiles pr on pr.user_id = p.member_id
            where p.room_id = r.id
          ), '[]'::jsonb)
        ) as room_json
      from public.rooms r
      join public.room_participants me
        on me.room_id = r.id
       and me.member_id = actor
       and me.invite_status in ('invited', 'accepted')
      where r.opened_by = 'member'
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_deal_rooms() from public, anon;
grant execute on function public.list_my_deal_rooms() to authenticated;

create or replace function public.search_deal_room_directory(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text;
begin
  perform private.active_member(auth.uid());
  needle := left(coalesce(p_query, ''), 80);
  needle := regexp_replace(needle, '[%_\\]', '', 'g');
  needle := trim(regexp_replace(needle, '\s+', ' ', 'g'));
  if char_length(needle) < 2 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
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
        left(coalesce(nullif(trim(p.full_name), ''), 'Member'), 200) as full_name,
        left(coalesce(p.headline, ''), 160) as headline,
        left(coalesce(p.company, ''), 200) as company,
        m.seat,
        lower(coalesce(p.full_name, '')) as sort_name
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status = 'active'
        and m.seat in ('ksa', 'intl', 'sponsor')
        and m.user_id is distinct from auth.uid()
        and (
          coalesce(p.full_name, '') ilike '%' || needle || '%'
          or coalesce(p.headline, '') ilike '%' || needle || '%'
          or coalesce(p.company, '') ilike '%' || needle || '%'
        )
      order by lower(coalesce(p.full_name, ''))
      limit 8
    ) found
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.search_deal_room_directory(text) from public, anon;
grant execute on function public.search_deal_room_directory(text) to authenticated;
