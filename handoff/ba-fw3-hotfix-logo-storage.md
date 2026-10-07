# FW3 hotfix: partner logo storage select

Base: latest `main` (`a7c31d2ce74388b84ce967ca495bf813852c94d0` or later). FW3 `20261208120000` is live. This PR does not edit that file.

## Sasha applies

1. Apply `supabase/migrations/20261208130000_partner_logos_select_staff.sql`.
2. No Edge.
3. Merge.
4. Smoke as QA staff at aal2: upload, replace, and remove a logo in admin. Anon list of `partner-logos` returns `[]`. After that, delete the leftover unlinked smoke object as staff at aal2. Storage API delete works once the select policy exists. The admin screen only reaches logos linked to a row.

Factory did not apply the migration and did not deploy.

## What changed

Storage upsert, replace, and delete read `storage.objects` before they write. FW3 dropped `partner_logos_select_public` and did not add a staff select policy, so staff at aal2 received 403 on upload and replace, and delete returned an empty list.

The new policy is `partner_logos_select_staff`: `for select to authenticated`, bucket `partner-logos`, the same path regex as the insert, update, and delete policies, and `private.is_staff()` (aal2). There is no anon grant and no anon policy. Other buckets are unchanged.

Admin remove deletes `{partner id}/logo` and then calls `staff_set_trusted_partner_logo` with a null path. If the storage delete fails, the partner row keeps its logo. Upload, replace, and remove failures say "We could not save that. Please try again."

## Handoff grades

- Staff at aal2 can select, replace, and delete a matching partner logo object: VERIFIED (local Postgres replay).
- Staff at aal1, a member, and anon cannot select or list `partner-logos`, and their deletes remove nothing: VERIFIED (same replay). Anon still cannot list.
- The select policy is `to authenticated` only, uses `private.is_staff()`, and copies the write-policy path regex: VERIFIED (static compare with `partner_logos_delete_staff`, plus `pg_policy` in the replay).
- No anon policy and no new definer function: VERIFIED (the migration creates one policy and no function).
- Admin remove calls storage delete and then clears `logo_path`: VERIFIED (client test). A failed delete does not clear the row: VERIFIED (same test).
- The public bucket still serves a known object URL, including an unpublished logo if the uuid path is already known: INFERRED from the unchanged `public = true` bucket. This change does not add or remove that HTTP path. Listing stays closed for anon and members.
- Hosted Storage returns the deleted object to staff at aal2 after this migration is applied: UNKNOWN until Sasha smokes it. The local replay uses a stub `storage.objects` table, not the Storage HTTP API.
- The leftover unlinked smoke object: UNKNOWN here. It is not deleted by this PR. Sasha deletes it as staff at aal2 after apply.
- Secrets hygiene: VERIFIED. This diff has no live mailbox, key, token, password, service-role key, live user id, live bucket object id, or staff name. Tests use example.com only.

## Not in this PR

Staff delete of `trusted_partners` rows. Partner interest notes. Copy renames. The leftover smoke object.
