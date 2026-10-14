# EM-1d handoff: transactional member notices

Base: `main` after the email consent core. One migration, `supabase/migrations/20261229120000_email_transactional.sql`. Sending stays off. The master switch is not turned on. No cron, no `pg_net`, and no workflow schedule was added.

`public.email_events` already exists for account mail. This change does not create it and does not alter it.

Nothing here was applied to the live database. No `db push`, no Edge deploy, no secret set, no merge.

## Apply list

1. Apply `20261229120000_email_transactional.sql` only. Slot `20261229120000` was free on main before this commit. Slots 21 and 23 stay unused. Slots 22, 24, 25, 26, 27 and 28 are already used.
2. Deploy the Edge function `member-notice-send`. It runs only when admin or the service role calls it. There is no schedule.
3. No new secrets. Transactional mail reads `RESEND_API_KEY_MAIL` and `EMAIL_FROM_MAIL` when that stream is configured. It does not fall back to the newsletter names. `PUBLIC_CONTACT_EMAIL` is the reply address. None of these are set here.

Leave the master switch off.

## Secrets grade

VERIFIED for this diff. A scan of the branch against main found no API key value, webhook secret, service-role key, token, project ref, staff name, mailbox, or booking link. Fixtures use example.com. The provider host appears only in the new sender module, which the existing account-mail files do not import.

- `RESEND_API_KEY` and `RESEND_API_KEY_MAIL`: UNKNOWN. Not created in this change. Not stored in the repo.
- `RESEND_WEBHOOK_SECRET`: UNKNOWN. Not used by this change.
- `EMAIL_FROM`, `EMAIL_FROM_MAIL`, and `PUBLIC_CONTACT_EMAIL`: UNKNOWN. Read from the Edge environment at send time. No address literal in the new templates.

## What members can turn off

New categories are seeded in `supabase/migrations/20261229120000_email_transactional.sql`. Essential types have `member_can_disable = false`. `public.set_email_preference` rejects them with `22023` (`:903`). `message_new` is seeded and shown as Coming soon. There is no messages table, so there is no hook.

| Type | Hook |
| --- | --- |
| welcome, admit | `supabase/functions/admit-member/index.ts:135` after the seat claim. The existing admit letter stays. |
| welcome, sign-up | `supabase/functions/_shared/candidate_flow.ts:373` after the account-open letter. Wired in `supabase/functions/_shared/candidate_admin.ts:201`. The code letter stays. |
| message_new | No hook. Template in `supabase/functions/_shared/member_notice_copy.ts:27`. Setting in `src/components/privacy/PrivacyPanelView.tsx:182`. |
| intro_suggested | `supabase/functions/suggest-intros/index.ts:135` inside the existing send callback. The existing letter stays. |
| invite, member | `supabase/functions/send-member-invite/index.ts:155` when the recipient is already a member. The existing letter stays. |
| invite, deal room | `supabase/functions/_shared/deal_room.ts:290`. The existing letter stays. |
| invite, partner | Held. `supabase/functions/invite-sponsor/index.ts` matches main. No notice is queued there. Staff owner invite stays on the current sender. |
| event_reminder | `supabase/functions/majlis-reminders/index.ts:41` passes a stable ref into `supabase/functions/_shared/majlis_notify.ts:145`. No schedule was added. The existing reminder workflows were not edited. |
| mandate_update | `public.staff_decide_mandate_intro` redefined at `supabase/migrations/20261229120000_email_transactional.sql:1007`. Same signature `(uuid, text)` and the same authenticated grant. |
| newsletter_ready | `public.staff_decide_digest_issue` redefined at `supabase/migrations/20261229120000_email_transactional.sql:1079` for owners on approve. Same signature `(text)` and the same authenticated grant. The staff switch is `src/pages/admin/NewsletterReadySetting.tsx:44`. |
| security_signin | Type and template only (`supabase/functions/_shared/member_notice_copy.ts:63`). Password reset and magic link stay on the current sender. No cutover. |
| security_two_step | `src/pages/dashboard/TwoStepPage.tsx:60` and `:72` call `record-security-notice` with an empty body. The server mints the reference in `public.service_two_step_notice_ref` and stops after five notices in an hour. The queue call is `supabase/functions/record-security-notice/index.ts:20`. |
| security_deletion, candidate | `public.prepare_candidate_delete` redefined at `supabase/migrations/20261229120000_email_transactional.sql:1201`, after the code matches and before `auth.users` is removed. The outbox row stores `address_snapshot` at that moment. Same signature `(uuid)` and the same service-role grant. The Edge caller is `supabase/functions/delete-candidate-account/index.ts:39`. |
| security_deletion, member close | Trigger `members_notice_close_bu` at `supabase/migrations/20261229120000_email_transactional.sql:1248`, before the address is replaced. The same snapshot is stored. |
| security_deletion, retention | `supabase/functions/retention-sweep/index.ts:56` queues the doomed accounts before `retention_sweep_plan` applies. The existing retention workflow was not edited. |

`private.enqueue_member_notice` is at `:369`. It has no client grant. Edge calls `public.service_enqueue_member_notice`, which is service role only. The queue call times out after 3 seconds and fails open, so the existing letter still goes out. `email_sends.user_id` still references `members` and is set null when that member is removed.

## Settings

Your privacy shows Email notifications at `src/components/privacy/PrivacyPanelView.tsx:166`. Copy says the notices are not connected yet while `email_settings.master_enabled` is false. Essential mail is listed as always on (`:208`). The route is the existing `/dashboard/privacy` path in `src/App.tsx`. The staff newsletter control is on the existing Settings route.

Shots, viewport 1440 and 390:

- `/opt/cursor/artifacts/em-1d-notices/notices-1440.png`
- `/opt/cursor/artifacts/em-1d-notices/notices-390.png`

## Sender

`supabase/functions/member-notice-send/index.ts` drains the outbox only when called, through the shared sender in `supabase/functions/_shared/bulk_mail.ts` with stream `mail`. Open and click tracking are off on that stream. A missing mail-stream key, from address, or contact address fails closed and does not call the provider. Master off skips every pending row and does not call the provider. Batch size and pause come from `email_settings` (50 and 1500). A 429 waits on the rate-limit header. Non-essential mail has a per-type unsubscribe link and the RFC 8058 headers. Essential mail has neither.

The account-mail module and the files checked by the provider tests do not import this sender.
