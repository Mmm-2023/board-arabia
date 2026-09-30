-- Eight default pictures. Legacy male becomes man-shemagh.
-- Legacy female becomes woman-hijab-black.
-- Drop the old check first so the backfill can write the new keys.
-- Running the updates again changes no rows.

alter table public.profiles drop constraint if exists profiles_avatar_style_check;

update public.profiles
set avatar_style = 'man-shemagh'
where avatar_style = 'male';

update public.profiles
set avatar_style = 'woman-hijab-black'
where avatar_style = 'female';

alter table public.profiles
  alter column avatar_style set default 'man-shemagh';

alter table public.profiles
  add constraint profiles_avatar_style_check
  check (avatar_style in (
    'man-shemagh',
    'man-ghutra',
    'man-suit-beard',
    'man-suit',
    'woman-hijab-black',
    'woman-abaya-black',
    'woman-hijab-navy',
    'woman-shayla'
  ));

create or replace function public.staff_set_avatar_style(p_user_id uuid, p_style text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_style is null or p_style not in (
    'man-shemagh',
    'man-ghutra',
    'man-suit-beard',
    'man-suit',
    'woman-hijab-black',
    'woman-abaya-black',
    'woman-hijab-navy',
    'woman-shayla'
  ) then
    raise exception 'invalid_style' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.members m where m.user_id = p_user_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set avatar_style = p_style
  where user_id = p_user_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_avatar_style(uuid, text) from public, anon;
grant execute on function public.staff_set_avatar_style(uuid, text) to authenticated;
