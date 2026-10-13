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

`/account-deletion` explains the in-app steps. The contact line uses `legalField('contactEmail')`. Nothing is rendered when that value is blank or still "To be confirmed".

## Deleted now

- Profile and directory card, including the avatar path
- Directory listing (status suspended, directory hidden, partner card off)
- Introductions
- Notifications (`digest_notices`)
- Messages, when a `public.messages` table exists
- Sign-in address is replaced and sessions are cleared when those tables exist

A consideration account that is not a member still goes through `prepare_candidate_delete`, which removes the sign-in.

## Kept

- The member row, anonymised (`anonymised_at`, `left_at`)
- Applications, with personal fields replaced and `member_user_id` cleared
- Consent log rows, with `user_id` cleared
- Staff access log, tier audits, intro audits, and AI tool consent rows, with the user reference cleared
- A legal hold skips that anonymising and keeps the references

## Locked files

Not edited: `src/content/legal/*`, `scripts/prerender.mjs`, `.github/workflows/pages.yml`.

`src/content/legal/privacy.en.ts` still says a full member record is not removed from Account. That file is locked, so the public Privacy Notice was not rewritten. The new page is linked under the notice.

`/account-deletion` is a real route and is in the marketing SEO map. It is not in the prerender route list, because that list lives in the locked `scripts/prerender.mjs`. A direct visit uses the existing GitHub Pages fallback. It is not a static prerender and it is not in the sitemap.

## Secrets

Grade: VERIFIED.

The diff was scanned for private keys, JWTs, service-role keys, and mailbox literals. Product code has none. Tests use `example.com` only. The migration has no address.
