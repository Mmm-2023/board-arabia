-- Private profile photo. One object per member: {user_id}/avatar.
-- Does not change admin authorization or directory peer reads.
-- Apply on Supabase project iirqbizwanyhgkhanntq before photo upload will succeed.
-- Until then the profile page keeps a placeholder and the rest of the dashboard still loads.

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles
  add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path = user_id::text || '/avatar');

grant select (avatar_path) on table public.profiles to authenticated;
grant update (avatar_path) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists member_avatars_select_own on storage.objects;
create policy member_avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-avatars'
    and name = ((select auth.uid())::text || '/avatar')
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists member_avatars_insert_own on storage.objects;
create policy member_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'member-avatars'
    and name = ((select auth.uid())::text || '/avatar')
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists member_avatars_update_own on storage.objects;
create policy member_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'member-avatars'
    and name = ((select auth.uid())::text || '/avatar')
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  )
  with check (
    bucket_id = 'member-avatars'
    and name = ((select auth.uid())::text || '/avatar')
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists member_avatars_delete_own on storage.objects;
create policy member_avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'member-avatars'
    and name = ((select auth.uid())::text || '/avatar')
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );
