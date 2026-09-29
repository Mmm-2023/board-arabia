-- FLAG: Michael / Code PM applies this live. This file does not apply it by itself.
-- Peer read for profile photos in the existing private bucket member-avatars.
-- Does not create the bucket, does not change its size or mime list, and does not
-- change insert, update, or delete. Those stay limited to {auth.uid()}/avatar.
-- After apply, an invited or active member may read any object whose name is {uuid}/avatar.
-- Until apply, Directory keeps initials for other members because select is own-only.
-- Own upload and own read keep working through the policies from 20260923120000.

drop policy if exists member_avatars_select_peers on storage.objects;
create policy member_avatars_select_peers on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-avatars'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/avatar$'
    and exists (
      select 1
      from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );
