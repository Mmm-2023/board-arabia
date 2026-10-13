# BA FW4b handoff: digest edits, tier audience, in-app delivery

Base is `af3c4b91` (PR #158). This change does not edit `supabase/migrations/20261212120000_weekly_digest.sql` or any earlier migration. The new file is `supabase/migrations/20261214120000_digest_review_tiers.sql`. No Edge deploy. No schedule. No mailbox. Factory does not apply migrations.

Apply `20261214120000_digest_review_tiers.sql` via MCP after `20261212120000_weekly_digest.sql`. On file, `20261212120000` is the digest migration this replaces functions from. `20261210120000` and `20261209140000` are already in the tree. Do not use `20261213120000`.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, live tokens, staff names, or mailbox addresses. Tests use `example.com` only. No test reads live database migration stamps.

## Tier source

The audience ids are the membership catalog, not a new list and not package names.

| Item | Where | Grade |
| --- | --- | --- |
| Catalog `array['founding','member','sponsor']` | `private.membership_tier_catalog()` in `supabase/migrations/20261115120000_member_tiers.sql:22` | VERIFIED |
| Same ids on the client | `MEMBERSHIP_TIER_IDS` in `src/lib/membershipTiers.ts:4` | VERIFIED |
| Picker words for this issue only: Basic, Founding member, Partner | `DIGEST_AUDIENCE_LABELS` in `src/lib/digestAudience.ts:8` | VERIFIED |

`member` is the catalog id. The picker says Basic. `sponsor` stays the stored id. The picker says Partner. Global people-card labels in `MEMBERSHIP_TIER_LABELS` are unchanged. A person's own tier check still bans Founding with Member on one row (`membership_tiers_valid` in the same migration). An issue audience is a set of recipient tiers, so Basic and Founding member can both be selected.

## What changed for members

| Item | Where | Grade |
| --- | --- | --- |
| This week shows the approved issue only when the caller's `members.tiers` overlaps the issue audience. Otherwise the page is empty. | `public.my_weekly_digest()` in `20261214120000_digest_review_tiers.sql` | VERIFIED |
| Home notice "This week's update is ready" links to `/dashboard/digest` | `public.my_digest_notices()`, `src/pages/dashboard/HomeSnapshotView.tsx`, `src/pages/dashboard/DashboardHome.tsx` | VERIFIED |
| Opening This week marks that member's notices read | `public.mark_my_digest_notice_read()`, `src/pages/dashboard/DigestPage.tsx` | VERIFIED |
| Withdraw deletes the notice rows and the page is empty again | `private.deliver_digest_notices()` | VERIFIED |
| There was no notification table. `public.digest_notices` is the new per-member read table. RLS is forced. No grants. | migration `digest_notices` | VERIFIED |

A partner in the audience still receives no Majlis rows. Other members stay behind `private.caller_sees_member_card`, so a partner sees a card only when that member opted in. Grade for that rule staying as it was: VERIFIED in the database test.

## What changed for admin

| Item | Where | Grade |
| --- | --- | --- |
| Draft text, added notes, added picks, and removed fields are saved on the issue with `updated_by`, `updated_at`, and an `edited` audit row | `public.staff_save_digest_draft` | VERIFIED |
| Picks come from members, mandates, and Majlis. A hidden host is still Board Arabia. | `public.staff_digest_sources` | VERIFIED |
| Approve refuses an empty audience | `audience_required` in `public.staff_decide_digest_issue` | VERIFIED |
| The member preview on the Email page uses the draft being edited | `src/pages/admin/DigestIssuePanel.tsx` | VERIFIED |
| Blank company, geography, and region are omitted from the stored JSON, so the member RPC does not return the removed field | `private.digest_clean_list` | VERIFIED |

Staff checks use `private.is_staff()` (aal2) and run before any update. New staff functions use `security definer` and `search_path ''`, and are revoked from anon.

## Email stays off

`mail_ready` is still stored false. `public.staff_digest_mail_plan` returns a recipient count for the selected tiers and forces `mail_ready` and `sendable` to false. It does not return addresses. `public.digest_issue_sendable` is unchanged: it refuses a draft or withdrawn issue, and it returns false while `mail_ready` is false.

To turn email on later, a separate change has to do all of the following. Approve only. Set `mail_ready` only on an approved issue. Turn on `digest_settings.send_enabled` only when a sender exists. Send only to invited or active members in the issue audience who opted in. Keep the partner card filter. Do not send from this migration.

UNKNOWN: which mailbox will send that later letter. This change does not choose one.

## Privacy wording

`src/components/privacy/PrivacyPanelView.tsx` and `src/pages/dashboard/PrivacyPanelPage.tsx` are not edited. The weekly email preference from the previous change stays. No legal text change in this diff.

## Routes

`/apply` and the `/dashboard/ai/:toolSlug` order are not edited.
