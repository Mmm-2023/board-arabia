# FW3 Trusted Partners gallery

Base: main `97d6121d09ad6525147619f1f93b35aed27381ab` (VERIFIED: `git fetch origin main` tip matched before the first commit).

Migration for Sasha, in order, after `20261207120000` (live as recorded `20261006215108`):

1. `supabase/migrations/20261208120000_trusted_partners_gallery.sql` (same file, edited in place; not applied). It now returns `is_partner` and does not return `sponsor_user_id` to anon.
2. No Edge function.

Factory did not apply the migration and did not deploy Edge.

## Public render rule

The public landing renders the Trusted Partners section only when `list_trusted_partners` returns at least one published, non-sample row that already has a logo path. Zero real partners, or real partners without a logo, render nothing: no heading, no sample names, no Partner with us in that section. The prerendered home HTML starts empty and does not include the section. The hard-coded EXAMPLE_PARTNERS list is deleted.

Anon `list_trusted_partners` returns published real rows with a logo only. The JSON has no `is_demo` key. Members see published samples only when the real published count is zero, and those cards are labelled Sample. A real row is never labelled Sample.

## What landed

- Logo column `logo_path`, public-read bucket `partner-logos`, staff-only write, PNG/JPEG/WebP, 512 KB, path `{uuid}/logo`. Client magic-byte check rejects SVG. Alt text is the partner name. Monogram if the image is missing.
- Admin Settings panel: add, edit, hide, reorder, logo, sample flag, optional sponsor link. Staff RPCs check `private.is_staff()` in the body (aal2).
- Members-only Partner showcase at `/dashboard/people/partners` (People, then Partners). Logo, one line, offer, Request an intro. Admin approves or declines. The linked member sees pending and approved counts only. New copy on this page says partner. `SPONSOR_LABEL` and `/dashboard/sponsorship` are unchanged for the later rename.
- Gallery split: a row with `is_partner` true (partner seat) stays in the partners list. A published real row that is not a partner seat renders only under the heading Trusted advisers. The public page stays hidden when there are zero real rows. The logo rule is unchanged.
- Partner categories live in `src/data/partnerCategories.ts` and are seeded into `partner_categories`. The page and filters start from that list and replace it when `list_partner_categories` returns rows, so a later swap is a data change.
- Partner interest is saved by `submit_partner_interest`. The admin home shows a count of new notes and Settings lists them. Email to admin is parked. There is no `ADMIN_NOTIFY_EMAIL` dependency.

## Handoff grades

- Public section absent at zero real logos: VERIFIED (SSR test and prerendered `dist/index.html` contain no partner section and no sample names).
- Anon RPC never returns a sample or an `is_demo` key: VERIFIED (local Postgres replay of the migrations).
- Member samples labelled Sample only when zero real: VERIFIED (same replay, plus the member home render).
- Staff aal1 and members cannot save, publish, reorder, or upload: VERIFIED (replay: `42501`).
- SVG and oversize rejected in the client checker: VERIFIED (unit test). Bucket mime list and 524288 byte limit: VERIFIED in the migration. Hosted Storage enforcing those limits on the API: INFERRED from the bucket row. Magic bytes are not re-checked inside Postgres: UNKNOWN until a later check is added.
- Logo bucket is public and has no select policy, so it cannot be listed: VERIFIED (replay: anon select on `storage.objects` for `partner-logos` returns no rows, including a published logo and a stray file). A signed-out browser can still load a published logo from the public object URL: INFERRED from Supabase public-bucket behaviour. This SQL file cannot serve that HTTP path. An unpublished or sample logo cannot be listed. The same public URL still opens an unpublished logo if someone already knows the exact uuid path. That is a consequence of the public bucket, not a list.
- Partner interest retention: there is no delete path in this migration. How long a note is kept is UNKNOWN. Do not invent a retention period until Sasha decides one.
- Secrets hygiene: VERIFIED. This diff has no live mailbox, key, token, or staff name. Tests use example.com only.
- CSP `img-src` includes the Supabase https origin: VERIFIED (`scripts/csp-policy.mjs`). A live logo request after Sasha applies the migration: UNKNOWN until that apply.
- `private.is_staff()` requires aal2: VERIFIED in the existing function. This migration calls it and does not replace it.
- Staff write log: the Security 3 log accepts `action = 'read'` only. Admin writes are not logged. Follow-up if a write action is added later. INFERRED from `staff_access_log_action_check`.
- Partner interest email: PARKED. Switching it on later must not be assumed from this PR. VERIFIED that this migration and the new UI do not read an admin notify mailbox.
- Category list equals the current site list of 15 finance lanes: VERIFIED (test compares the module and the seed). Michael swapping the live table without a code change: the client replaces the seed after `list_partner_categories` returns. INFERRED that a data-only update will show on the next page load. The prerendered `/partners` HTML still shows the seeded list until the next deploy.
- No new public nammco string. The footer credit allowlist was not edited. VERIFIED by not changing `scripts/public-nammco.mjs` and by the Pages artifact gate.
- Anon execute allowlist gained `list_partner_categories()` and `submit_partner_interest(...)`. That is the SQL allowlist in `scripts/definer-audit.test.ts`, not the nammco allowlist.
- `/apply` route: unchanged. VERIFIED by the route test.
- Real partner rows, logos, and staff names: not in this diff. UNKNOWN until Michael supplies them and admin enters them.
- Live landing after deploy, before the migration is applied: the client drops sample rows and rows without a logo, so the section stays hidden even if the old RPC still returns samples. INFERRED from the client filter. Confirmed on the old RPC only after deploy: UNKNOWN.

## Do not touch

`re_partners` and `RePartnersEditor` were not changed. `/partners` still says there is no directory of partner names. `src/shell/viewCopy.ts` was not given new FW3 strings.
