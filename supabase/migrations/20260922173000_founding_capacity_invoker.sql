-- Counts stay in a private security-definer function.
-- The public wrapper is invoker so signed-in users do not call a public definer.

create or replace function public.founding_capacity()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) and not exists (
    select 1 from public.staff_users s
    where s.user_id = auth.uid()
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.founding_counts();
end;
$$;

revoke all on function public.founding_capacity() from public, anon;
grant execute on function public.founding_capacity() to authenticated;

grant usage on schema private to authenticated;
revoke all on function private.founding_counts() from public, anon;
grant execute on function private.founding_counts() to authenticated;
