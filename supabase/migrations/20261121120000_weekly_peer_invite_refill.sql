-- Weekly peer invite refill.
-- Non-sponsor members (Saudi Arabia and International) return to 2 invites.
-- Unused invites do not stack above 2.
-- The function sets board.invite_release=on for this transaction only, the same
-- gate release_member_invite uses. If that flag is off, the update matches no rows.
-- Sponsors are excluded. service_role only.
-- Sasha deploys the Edge function refill-weekly-invites and sets
-- INVITE_WEEKLY_REFILL_SECRET plus the schedule after this migration is applied.
-- No secret value belongs in this file.
--
-- Directory cards also return membership_status so an invited person is labelled
-- and is not offered Request intro.

create or replace function public.refill_weekly_peer_invites(p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eligible int;
  restored int := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::int into eligible
  from public.members m
  where m.seat in ('ksa', 'intl')
    and m.invites_remaining < least(2, m.invites_granted);

  if p_apply is distinct from true then
    return jsonb_build_object(
      'dry_run', true,
      'eligible', eligible,
      'restored', 0,
      'cap', 2
    );
  end if;

  perform set_config('board.invite_release', 'on', true);

  update public.members m
  set invites_remaining = least(2, m.invites_granted)
  where m.seat in ('ksa', 'intl')
    and m.invites_remaining < least(2, m.invites_granted)
    and coalesce(current_setting('board.invite_release', true), '') = 'on';

  get diagnostics restored = row_count;

  return jsonb_build_object(
    'dry_run', false,
    'eligible', eligible,
    'restored', restored,
    'cap', 2
  );
end;
$$;

revoke all on function public.refill_weekly_peer_invites(boolean) from public, anon, authenticated;
grant execute on function public.refill_weekly_peer_invites(boolean) to service_role;

comment on function public.refill_weekly_peer_invites(boolean) is
  'Restores non-sponsor invite wallets to 2. Sets board.invite_release for this transaction only. Flag off matches no rows. Sponsors are excluded.';

create or replace function public.list_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  real_n int;
  show_demo boolean;
begin
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.members m
  where m.is_demo = false
    and m.status in ('invited', 'active')
    and m.seat in ('ksa', 'intl');

  show_demo := private.demo_rows_visible('directory', real_n);

  return coalesce((
    select jsonb_agg(payload order by demo_flag, sort_order, sort_name)
    from (
      select
        false as demo_flag,
        0 as sort_order,
        lower(coalesce(p.full_name, '')) as sort_name,
        jsonb_build_object(
          'id', m.user_id,
          'is_demo', false,
          'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'location', coalesce(p.location, ''),
          'sector', coalesce(p.sector_tags[1], ''),
          'sectors', coalesce(to_jsonb(p.sector_tags), '[]'::jsonb),
          'vision_themes', coalesce(to_jsonb(p.vision_themes), '[]'::jsonb),
          'availability', p.availability,
          'seat', m.seat,
          'preferred_partner', (m.seat = 'sponsor'),
          'portrait_asset', null,
          'avatar_path', p.avatar_path,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'membership_status', m.status
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
      union all
      select
        true,
        d.sort_order,
        lower(d.full_name),
        jsonb_build_object(
          'id', d.id,
          'is_demo', true,
          'full_name', d.full_name,
          'headline', d.headline,
          'company', d.company,
          'location', d.location,
          'sector', d.sector,
          'sectors', jsonb_build_array(d.sector),
          'vision_themes', coalesce(to_jsonb(d.vision_themes), '[]'::jsonb),
          'availability', d.availability,
          'seat', d.seat,
          'preferred_partner', false,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null,
          'avatar_style', 'male',
          'membership_status', null
        )
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;
