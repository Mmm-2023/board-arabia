-- Current ISO week suggestions for the signed-in member.
-- Omits a suggested member hidden from the directory.
-- Rank stays between 1 and 3 so a later admin cap up to 3 needs no schema change.
-- Grants stay as they are. Anon cannot execute this function.
-- Safe to run again.

create or replace function public.list_my_intro_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'suggested_id', s.suggested_id,
      'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
      'headline', coalesce(nullif(trim(p.headline), ''), ''),
      'company', coalesce(nullif(trim(p.company), ''), ''),
      'location', coalesce(nullif(trim(p.location), ''), ''),
      'reason', s.reason,
      'rank', s.rank,
      'avatar_style', coalesce(p.avatar_style, 'male'),
      'avatar_path', p.avatar_path
    ) order by s.rank)
    from public.intro_suggestions s
    join public.profiles p on p.user_id = s.suggested_id
    join public.members suggested on suggested.user_id = s.suggested_id
    where s.member_id = auth.uid()
      and s.iso_year = extract(isoyear from timezone('UTC', now()))::integer
      and s.iso_week = extract(week from timezone('UTC', now()))::integer
      and suggested.is_demo = false
      and suggested.status in ('invited', 'active')
      and suggested.directory_hidden = false
      and not private.sample_subject(s.suggested_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_intro_suggestions() from public, anon;
grant execute on function public.list_my_intro_suggestions() to authenticated;

comment on function public.list_my_intro_suggestions() is
  'Current ISO week suggestions for the signed-in member. Omits suggested members hidden from the directory.';
