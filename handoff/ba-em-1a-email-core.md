# EM-1a handoff: email data and consent core

Base: `main`. One migration, `supabase/migrations/20261220120000_email_core.sql`. No Edge function, no UI, no send. The master switch defaults to off.

FW4c #171 was still open when this branch started. This file does not read the digest sections migration. `public.staff_digest_mail_plan` already exists on main. If #171 merges first, merge main with a normal merge commit.

Secrets grade: VERIFIED for this diff. No API key, webhook secret, service-role key, token, project ref, staff name, mailbox, or booking link is in the diff. Test fixtures use example.com only. RESEND_API_KEY and RESEND_WEBHOOK_SECRET are not in the diff and are not created yet: UNKNOWN.

Nothing in this change was applied to the live database. No `db push`, no Edge deploy, no secret set, no merge.

## Apply list

Apply `20261220120000_email_core.sql` only, after `20261217120000_owner_staff_gate.sql`. Nothing else. Leave the master switch off.

## Tables

All have row level security enabled and forced. Grants are revoked from public, anon, authenticated, and service_role. There is no client policy. Definers run as the table owner.

| Table | Where | Role |
| --- | --- | --- |
| `public.email_categories` | `:10` | Seeded. Weekly email does not require opt-in. News and invitations does. |
| `public.email_preferences` | `:32` | One row per member and category. |
| `public.email_consent_log` | `:47` | Append-only. Address hash, not the address. |
| `public.email_suppressions` | `:87` | Hash primary key, so it survives member deletion. |
| `public.email_campaigns` | `:106` | A digest campaign points at an issue. It does not copy the editor. |
| `public.email_sends` | `:145` | Send log. Unique live row per campaign and member. |
| `public.email_settings` | `:180` | One row. `master_enabled` default false. Batch size 50. Pause 1500 ms. |
| `public.email_master_log` | `:203` | Owner changes to the master switch. |
| `private.email_secrets` | `:217` | HMAC key from `gen_random_bytes` at apply. Never returned. |

## Functions

Every definer sets `search_path` to empty. Staff writes call `private.is_staff()`. The master switch also calls `private.is_owner()`.

| Function | Where | Grant |
| --- | --- | --- |
| `private.email_address_hash` | `:237` | No client grant. |
| `private.email_backfill_weekly` | `:255` | No client grant. Run once at apply (`:274`). |
| `private.email_save_preference` | `:276` | No client grant. |
| `private.email_apply_admit_defaults` | `:355` | No client grant. |
| `private.email_on_member_admit` | `:417` | Trigger `members_email_admit_ai` at `:434`. |
| `private.email_unsub_token` | `:438` | No client grant. |
| `private.email_unsub_verify` | `:476` | No client grant. |
| `public.email_unsubscribe` | `:543` | anon and authenticated. |
| `public.my_email_preferences` | `:580` | authenticated. |
| `public.set_email_preference` | `:618` | authenticated. |
| `public.set_digest_email_opt_in` | `:654` | authenticated. Same signature as before. |
| `private.email_member_reason` | `:693` | No client grant. |
| `private.email_audience_counts` | `:744` | No client grant. |
| `private.email_assert_links` | `:770` | http and https only. |
| `private.email_sanitise_html` | `:803` | Strips script and style, then checks links. |
| `private.email_recipients` | `:838` | service_role only. |
| `private.email_record_event` | `:877` | service_role only. |
| `public.staff_email_audience` | `:958` | authenticated, staff check. |
| `public.staff_digest_mail_plan` | `:988` | authenticated, staff check. Same signature. |
| `public.staff_set_email_master` | `:1038` | authenticated, owner check, logged. |
| `public.staff_upsert_campaign` | `:1071` | authenticated, staff check. |
| `public.staff_approve_campaign` | `:1184` | authenticated, staff check. |
| `public.staff_cancel_campaign` | `:1251` | authenticated, staff check. |
| `public.email_consent_retention` | `:1289` | service_role only. Not scheduled. |

`public.email_unsubscribe` is the only new anon grant. The closed anon list in `scripts/definer-audit.test.ts` includes it.

## Admit default and the consent row

Weekly email is on for a new member. News and invitations is off. The column default on `members.digest_email_opt_in` stays false, so a raw insert does not opt anyone in and existing tests that insert members directly stay as they are.

Both seat claims set `invited_by`. The after-insert trigger at `:434` calls `private.email_apply_admit_defaults` (`:355`) only when that inviter is set and the row is not a demo.

The helper reads `email_categories.requires_opt_in` (`:22`). Weekly email is false, so the preference is on, the action is `opt_in`, and the weekly column is set true (`:403`). News and invitations is true, so the preference is off and the action is `opt_out`. Each category gets one `email_consent_log` row with source `admit`, notice version `email-core-1`, and `created_at` defaulting to now (`:390`).

There is no member row at bare sign-up. The consent row is written when the seat claim inserts the member, which is the admit step for a sign-up and for a partner seat.

## Existing members are not flipped

`private.email_backfill_weekly` (`:255`) inserts a weekly preference from the current `digest_email_opt_in` value. It does not update `members` and it does not insert a consent row. `on conflict do nothing` means a second run does not overwrite a preference that already exists.

If a weekly preference row already exists, `private.email_apply_admit_defaults` returns at `:372` before any write. A later admit signal cannot turn an existing member on or off.

Postgres proof in `scripts/email-core-db.test.ts`:

- A member stored off and a member stored on keep those column values after backfill. Preferences match the columns. Consent count for them is 0.
- Changing the off member's column and running backfill again leaves the stored preference off.
- Calling the admit helper on those two members writes nothing and does not change the columns.
- A new insert with an inviter, the partner seat claim, and the founding seat claim each set weekly on, news off, and two consent rows with source `admit` and a timestamp.

## Audience and the master switch

`private.email_member_reason` (`:693`) classifies a member as demo, anonymised, inactive, no address, hidden, suppressed, not opted in, or eligible. `public.staff_digest_mail_plan` (`:988`) uses that helper for `weekly_digest`, so `recipient_count` is the eligible count. `mail_ready` and `sendable` stay false. The digest Postgres test now expects 1 eligible recipient, because only one fixture member has opted in.

`private.email_recipients` returns only eligible rows and checks suppression again. The Postgres test shows opted-out, suppressed, demo, anonymised, hidden, and inactive members are absent. A bad unsubscribe token returns `{ok: true}` and writes nothing. A good token turns the preference off and writes one consent row. A second call does not write another row. The weekly toggle still round-trips through `set_digest_email_opt_in` and `own_digest_preference`.

`public.email_consent_retention` (`:1289`) is the named retention item `email_consent_log`. Rows stay while the member has not left. They are removed 24 months after `left_at`. It does not touch the 13 month cookie `consent_log`. It is not scheduled. The Postgres test deletes a left member's row and keeps a current member's older row.

Campaign copy is passed through `private.digest_plain` and `private.email_sanitise_html`. A non-http link is refused. A campaign kind must use a category that requires opt-in. A digest kind uses Weekly email and must point at an approved issue before approval.

## Tests

- `scripts/email-core.test.ts` checks the file by name, that it sorts after `20261217120000_owner_staff_gate.sql`, forced RLS, empty `search_path`, the single anon grant, master default false, and no cron or `pg_net`.
- `scripts/email-core-db.test.ts` is the local Postgres proof above.

No screen changed, so there are no shots.
