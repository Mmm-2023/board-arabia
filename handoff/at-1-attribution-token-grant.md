# AT-1 attribution token grant and signup cleanup

Base: main `2a81aac177ca5375c11b820e7e994c8d9a45c61b` (free account majlis). Branch: `cursor/fix-attribution-token-grant-9ebc`. Undrafted PR against main. No force-push. No merge.

No screen changed, so there is no screenshot. The register page and the free-account flow are unchanged for a successful insert.

## Redeploy

- `register-candidate`

The cleanup is in the shared register path that function bundles. `verify-candidate` imports the same module for verify only. Its verify path is unchanged, so it is not on the redeploy list. No other function.

Do not deploy from this agent.

## Migration

File: `supabase/migrations/20270105120000_fix_attribution_token_grant.sql`

The requested stamp was free. Latest file on main at branch time was `20270103120000_free_account_majlis.sql`. `20270105120000` sorts after it.

Live apply name: `fix_attribution_token_grant`. Code PM reconciles the stamp.

Not applied here. No `supabase db push`. No live settings change. No email send. No cron. No aal2 change.

The candidates check constraints call `private.attribution_token(text)`. `20261104120000` revoked execute from public, anon, and authenticated. The function owner kept execute. `service_role` did not, so a new-address free-account insert failed the check. This file grants execute to `service_role` only, inside a `DO` block that skips the grant when the function is missing. `GRANT` is idempotent. A second apply is a no-op. Anon and authenticated stay revoked.

## Signup cleanup

If `createUser` succeeds and the candidates insert then fails, `register-candidate` calls `auth.admin.deleteUser` with that new id, logs an event name plus an error class, and returns the existing generic reply (`400`, "Could not open the account. Try again.", `error_code: server`).

An auth user that already existed is not deleted. A successful insert is unchanged. A failed delete still returns that same generic reply.

The log is `{ event, code }`. `code` is a five-character SQLSTATE or a short class such as `insert_failed` or `delete_failed`. The insert message is not returned and not logged. The log and the reply omit email, phone, name, and tokens.

## File refs

- Grant: `supabase/migrations/20270105120000_fix_attribution_token_grant.sql:11`
- Delete: `supabase/functions/_shared/candidate_admin.ts:69`
- Safe insert class: `supabase/functions/_shared/candidate_admin.ts:96`
- Cleanup call: `supabase/functions/_shared/candidate_flow.ts:320`
- Log class: `supabase/functions/_shared/candidate_flow.ts:142`

## Checks

- `scripts/attribution-token-grant.test.ts` covers the grant text, a local Postgres replay (grant, second apply, missing function), insert failure calling delete with the created id, the generic reply, a log with no personal data, a failed delete, and an existing auth user left in place.
- Local Postgres replay of this file only: VERIFIED. The full suite and the five CI checks are recorded on the PR.

## Secrets

VERIFIED. The diff has no live mailbox, API key, token, password, service-role key, project ref, or staff name. The only address is `ada@example.com` in the test. The auth ids in the test are the existing fixture ids, not live users.
