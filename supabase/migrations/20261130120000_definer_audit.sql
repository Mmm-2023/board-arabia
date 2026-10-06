-- read_dd_retention_copy is a member and staff flag.
-- A signed-in user who is not an invited or active member, and not aal2 staff, is denied.
-- Anon stays revoked. Safe to run again.

create or replace function public.read_dd_retention_copy()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not (
    private.is_staff()
    or exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
    )
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select s.dd_retention_copy
    from public.ai_tool_settings s
    where s.id
  ), false);
end;
$$;

revoke all on function public.read_dd_retention_copy() from public, anon;
grant execute on function public.read_dd_retention_copy() to authenticated;

comment on function public.read_dd_retention_copy() is
  'Boolean deck hint flag. Invited or active members, and aal2 staff, may read it. Anon may not.';
