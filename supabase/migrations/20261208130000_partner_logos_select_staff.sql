-- Staff at aal2 must be able to see a partner logo object. Storage upsert,
-- replace, and delete read the row before they write it. Anon and members
-- have no select policy, so they still cannot list the bucket. A public
-- bucket URL for a known path is unchanged.

drop policy if exists partner_logos_select_staff on storage.objects;
create policy partner_logos_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'partner-logos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo$'
    and private.is_staff()
  );
