# Staff QA fixture

Never point this at a real member. The script refuses a member or room row where `is_demo = false`.

This folder is not a migration. Do not apply it with the migration runner, and do not run `supabase db push` for it. Run it only after the current migrations are already applied. It does not send mail, does not call an Edge function, and does not write storage.

The only address in the script is `qa@example.com`, stored on the sample member row. The operator's own inbox stays in the dashboard and is never written here.

## Create the auth user by hand

1. In the Supabase dashboard, open Authentication, then Users, then Add user, then Create new user. Use an inbox the operator controls. Do not write that address in this repo. Set the sign-in secret in the dashboard. Do not send an invite. Tick Auto confirm user.
2. Copy the user id. Paste it into the `\set qa_user` line in `qa-fixture.sql` on the operator machine. Do not commit that edit. The all-zero id is refused.
3. Run the file with psql:

   ```
   psql "$DATABASE_URL" -f supabase/qa/qa-fixture.sql
   ```

   `DATABASE_URL` stays on the operator machine. The dashboard SQL editor cannot run the `\set` line, so use psql. Do not commit the connection string.
4. Sign in as the QA member and open the room named `QA test room (Example)`. To attach the fixed document row, upload a harmless PDF to the storage path the script prints, in bucket `deal-room-documents`, then run the script again. An upload through the app uses a new document id, so the fixed row stays absent until a file is at the printed path. The app upload is still a normal document in the room.
5. To open `/admin`, add a `public.staff_users` row for that user id with role `staff`, by hand, the same way other staff rows are added. `private.is_staff()` also requires an aal2 session, so enrol a second factor before using `/admin`. Remove the `staff_users` row when the check is done. This is not scripted. Do not add an allowlist in the repo.

## What the script writes

- One member for that auth user: `is_demo = true`, status `active`, seat `intl`, tier `member`. Seat `intl` is a non-partner seat and is not the home region. Tier `member` does not take a founding number. The sample address is `qa@example.com`. The display name is `QA Member (Example)` and the company is `Example Co`. Directory listing is hidden, the public aggregate flag is off, the digest preference is off, and the invite wallet remaining is set to 0.
- One room, id `c0ffee00-0000-4000-8000-0000000000a1`, name `QA test room (Example)`, `is_demo = true`, status `open`, opened by the member, owned by the QA member. The participant role is `owner` and the invite status is `accepted`.
- One document row, id `c0ffee00-0000-4000-8000-0000000000a2`, file name `Example document.pdf`, only when `storage.objects` already has `c0ffee00-0000-4000-8000-0000000000a1/c0ffee00-0000-4000-8000-0000000000a2/source` in bucket `deal-room-documents`. Otherwise the script prints that path and continues. Page count is stored as 1 because the script does not open the file.

Running the file again updates only rows that are already samples. It does not update a row where `is_demo = false`.

The last select prints the member, the room, and the document if the storage object was present.

## Teardown

The bottom of `qa-fixture.sql` has a commented teardown. It deletes only the fixed ids, and only when the room or member is still `is_demo = true`. It does not delete the auth user and does not delete storage objects. Remove an uploaded object in the dashboard if one was added. For a teardown run, keep the `\set qa_user` line, comment out the `begin` through `commit` block, and uncomment the delete lines.

## Why other members do not see it

The member rooms list returns open admin rooms only. This room is opened by the member, so it is not in that list. The QA member sees it under their own rooms because they are the accepted owner. Other members are not participants. Counts and digests already skip `is_demo` members. Details are in `handoff/ba-e2e-1-qa-setup.md`.
