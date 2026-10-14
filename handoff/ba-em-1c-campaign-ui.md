# EM-1c handoff: admin campaign screen and member email choices

Base: `main` after the email consent core. One migration, `supabase/migrations/20261223120000_email_campaign_ui.sql`. No Edge deploy, no cron, no send. The master switch stays off.

The screen calls the `email-send` function by name. That function is not in this change. Tests stub the call. Webhook rows are read from `public.newsletter_events` when that table exists. This change does not read `email_events`.

Secrets grade: VERIFIED for this diff. No API key, webhook secret, service-role key, token, project ref, staff name, mailbox, or booking link is in the diff. Test fixtures use example.com only. `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are not in the diff and are not created yet: UNKNOWN.

Nothing in this change was applied to the live database. No `db push`, no Edge deploy, no secret set, no merge.

## Apply list

Apply `20261223120000_email_campaign_ui.sql` after `20261221120000_newsletter_events.sql`. Leave the master switch off. Do not deploy Edge and do not set secrets.

## Release gate

`public.staff_email_release_gate(p_campaign_id)` is read-only (`supabase/migrations/20261223120000_email_campaign_ui.sql:55`). It is open only when the caller is the owner, the master switch is on, the status is `test_sent` or `sending`, `test_sent_by` is that caller, and `content_hash` equals `test_content_hash`. The screen passes `{ p_campaign_id: draft.id }` (`src/pages/admin/EmailCampaignPanel.tsx:146`). An edit still clears `test_sent_by`, `test_sent_at`, and `test_content_hash`, and refreshes `content_hash`. A live send after that edit is refused.

Saving a letter sends `p_body_html: null` (`src/pages/admin/EmailCampaignPanel.tsx:101`). `staff_upsert_campaign` then builds one escaped paragraph with `private.email_plain_html` and runs `private.email_sanitise_html`. A supplied HTML argument is sanitised as given.

The typed count is on the screen (`src/pages/admin/EmailCampaignView.tsx`). The send call is `src/lib/emailSend.ts`. Test and release are `src/pages/admin/EmailCampaignPanel.tsx`.

## Newsletter events

`private.email_newsletter_event_rows` joins `public.newsletter_events` to `public.email_sends` on `send_id`. It does not read the transactional mail log.

## Member choices

Weekly email stays on for a new member at admit, from the consent core. This migration does not add an application column and does not read one at admit. The sign-up box is waiting on the owner. `src/pages/ApplyPage.tsx` and `supabase/functions/submit-application/index.ts` match main. An existing weekly preference is left as it is.

Your privacy keeps Weekly email and adds News and invitations (`src/components/privacy/PrivacyPanelView.tsx:143`). "Not connected yet" stays while `delivery_connected` is false, which follows the master switch (`src/pages/dashboard/PrivacyPanelPage.tsx:19`).

`/email/unsubscribe` asks for one click and does not call the database until that click (`src/pages/EmailUnsubscribePage.tsx:15`). A failed call shows "Could not unsubscribe. Retry." and keeps the button. "You are unsubscribed" is shown only after the call succeeds. The done line links to Your privacy.

## Shots

`/opt/cursor/artifacts/em-1c-campaign-ui/`

- `release-off-1440.png` and `release-off-390.png`: Release disabled, master switch off
- `release-on-1440.png` and `release-on-390.png`: Release enabled, typed count 12
- `preferences-1440.png` and `preferences-390.png`: Weekly email and News and invitations, not connected yet
- `unsubscribe-1440.png` and `unsubscribe-390.png`: confirm state with the Unsubscribe button
- `unsubscribe-error-1440.png` and `unsubscribe-error-390.png`: retry message, success sentence absent

## Tests

- `scripts/email-campaign-ui.test.ts`: route, copy, release rules, owner-only master switch, `email-send` name, shots
- `scripts/email-campaign-ui-db.test.ts`: existing member stays off, a new admit stays weekly on and news off, owner test and master switch, edit resets the test, account address is resolved at runtime, newsletter events show, the transactional mail log does not
