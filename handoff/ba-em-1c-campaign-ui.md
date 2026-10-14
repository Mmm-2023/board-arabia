# EM-1c handoff: admin campaign screen and member email choices

Base: `main` after the email consent core. One migration, `supabase/migrations/20261223120000_email_campaign_ui.sql`. No Edge deploy, no cron, no send. The master switch stays off.

The screen calls the `email-send` function by name. That function is not in this change. Tests stub the call. Webhook rows are read from `public.newsletter_events` when that table exists. This change does not read `email_events`.

Secrets grade: VERIFIED for this diff. No API key, webhook secret, service-role key, token, project ref, staff name, mailbox, or booking link is in the diff. Test fixtures use example.com only. `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are not in the diff and are not created yet: UNKNOWN.

Nothing in this change was applied to the live database. No `db push`, no Edge deploy, no secret set, no merge.

## Apply list

Apply `20261223120000_email_campaign_ui.sql` only, after `20261220120000_email_core.sql`. `20261222120000` is already used and is not this change. Leave the master switch off.

Apply that migration before any later deploy of `submit-application`. This change does not deploy the function. Do not set Edge secrets. Do not turn sending on.

## Release gate

Release is owner-only. It stays closed until all of these are true:

- The letter is approved (`approved_at` is set and the stored status is `test_sent`).
- The master switch is on.
- A test of this exact stored version was recorded by the owner, and the stored hash matches the address on the owner's account at the moment of release.
- There is at least one eligible member.

Any edit that changes the stored version returns the letter to `approved` and clears the test. A new test is required. The owner address is read from `auth.users` at runtime. It is not written into the screen payload and it is not a literal in code.

| Piece | Where |
| --- | --- |
| Version hash | `supabase/migrations/20261223120000_email_campaign_ui.sql:30` |
| Edit resets `test_sent` to `approved` | `:189` (`staff_upsert_campaign`) |
| Release gate, account hash | `:311`, account read `:368` |
| Owner test record | `:407`, account read `:450` |
| Screen payload, no address | `:600` |
| Typed count | `src/pages/admin/EmailCampaignView.tsx:23` |
| `email-send` call | `src/lib/emailSend.ts:9` |
| Test then live | `src/pages/admin/EmailCampaignPanel.tsx:134` and `:163` |

## Newsletter events

`private.email_newsletter_event_rows` (`:494`) reads `public.newsletter_events` when the table is present. It looks for `campaign_id`, `event` or `event_type`, `created_at` or `occurred_at`, and optional `url` or `clicked_url`. If the table is absent, the send log still shows counts from `email_sends` and an empty event list. It does not read the transactional mail log.

## Member choices

Weekly email stays on for a new member at admit. The consent source is `admit_default` (`:70`). A ticked apply-form box becomes `news_invitations` opted in, with source `apply_form` (`:98`). Unticked stays off and does not write `apply_form`. An existing weekly preference is left as it is.

The apply box is unticked by default (`src/pages/ApplyPage.tsx:372`). The sentence is a placeholder: "Send me news and invitations from Board Arabia. You can turn this off at any time." (`src/lib/emailCampaign.ts:267`). The `/apply` route line is unchanged.

Your privacy keeps Weekly email and adds News and invitations (`src/components/privacy/PrivacyPanelView.tsx:143`). "Not connected yet" stays while `delivery_connected` is false, which follows the master switch (`src/pages/dashboard/PrivacyPanelPage.tsx:19`).

`/email/unsubscribe` asks for one click and does not call the database until that click (`src/pages/EmailUnsubscribePage.tsx:7`). The confirm and done sentences are placeholders. The done line links to Your privacy.

## Shots

`/opt/cursor/artifacts/em-1c-campaign-ui/`

- `release-off-1440.png` and `release-off-390.png`: Release disabled, master switch off
- `release-on-1440.png` and `release-on-390.png`: Release enabled, typed count 12
- `preferences-1440.png` and `preferences-390.png`: Weekly email and News and invitations, not connected yet
- `unsubscribe-1440.png` and `unsubscribe-390.png`: confirm page before the click

## Tests

- `scripts/email-campaign-ui.test.ts`: route, copy, release rules, owner-only master switch, `email-send` name, shots
- `scripts/email-campaign-ui-db.test.ts`: existing member stays off, ticked box logs `apply_form`, owner test and master switch, edit resets the test, account address is resolved at runtime, newsletter events show, the transactional mail log does not
