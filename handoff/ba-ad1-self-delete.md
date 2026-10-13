# AD-1 Members delete their own account

Base: main `143e23e6c553ee850ae430b6e4a7122f87cc0572`
Branch: `cursor/account-deletion-7d18`
Migration: `supabase/migrations/20261225120000_member_self_delete.sql`
Not applied. Edge function not deployed. No merge. No force-push.

## What a member does

Your privacy already links to Delete account. That screen is two steps.

1. What is deleted and what is kept, then a confirmation.
2. A one-time code through the existing code mail (`boardMail` and `sendEmail`, subject "Your Board Arabia code"). The account closes only after the code matches. The session ends.

Leave Board Arabia is the same screen. Admin gets an in-app notice, not a new email. Staff read it with `list_account_closure_notices()`, which calls `private.is_staff()`.

`/account-deletion` explains the in-app steps. The contact line always uses `legalField('contactEmail')`. The Pages build fails when `VITE_LEGAL_CONTACT_EMAIL` is unset. No mailbox literal is stored in the repo.

## Deleted now

- Profile and directory card, including the avatar path
- Directory listing (status suspended, directory hidden, partner card off)
- Introductions
- Notifications (`digest_notices`, `member_notifications`, `member_notification_prefs`)
- Event replies (`majlis_rsvps` and `majlis_rsvp_limits`)
- The member sign-in is anonymised, not deleted. Sessions are cleared when those tables exist.

There is no messages table yet, so this change does not delete messages. A consideration account that is not a member still goes through `prepare_candidate_delete`, which deletes that sign-in. Consent log rows for that account stay, with the user reference cleared by the foreign key.

## Kept

- The member row, anonymised (`anonymised_at`, `left_at`)
- Applications, with personal fields replaced and `member_user_id` cleared
- Consent log rows, with `user_id` cleared
- Staff access log, tier audits, intro audits, and AI tool consent rows, with the user reference cleared
- A legal hold skips that anonymising and keeps the references
- Deal room files you uploaded, until you delete them. Account deletion does not remove them. A 30 day removal after the room closes is defined and the retention sweep does not call it yet.
- AI tool upload rows and due diligence deck rows. Account deletion does not remove them or their storage objects. The retention sweep deletes those rows after the AI retention setting, which defaults to 30 days, and the sweep function removes the stored files.
- The project has no automatic database backup. Supabase documents daily backups for Pro, Team, and Enterprise only.

## Approved exceptions

`scripts/prerender.mjs` adds `/account-deletion` and `/legal`. `/legal` redirects to `/terms/`. Sitemap URLs use the trailing slash, matching the rest of the sitemap. `src/content/legal/privacy.en.ts` states what self-delete removes, that the member sign-in is anonymised, and the existing 13 month and 24 month periods. `.github/workflows/pages.yml` was not edited.

## Secrets

Grade: VERIFIED.

The diff was scanned for private keys, JWTs, service-role keys, and mailbox literals. Product code has none. Tests use `example.com` only. The migration has no address.
