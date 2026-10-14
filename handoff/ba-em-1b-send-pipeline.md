# EM-1b handoff: send pipeline, webhook, and unsubscribe

Base: `main` after the email core squash. One migration, `supabase/migrations/20261221120000_newsletter_events.sql`, plus three Edge functions. Nothing here is applied, deployed, or scheduled. The master switch is not changed and stays off.

Account mail already uses `public.email_events`. Newsletter events are a different table, `public.newsletter_events`. This migration does not create or alter `public.email_events`.

## Apply list

Apply `20261221120000_newsletter_events.sql` only, after `20261220120000_email_core.sql`. Leave the master switch off.

Only after written approval of the first real send:

- Set these Edge secret names: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `PUBLIC_CONTACT_EMAIL`.
- Deploy `email-send`, `email-webhook`, and `email-unsubscribe`.
- Point the provider webhook at the deployed `email-webhook` URL for delivered, bounced, complained, delivery delayed, opened, and clicked.
- Do not add a schedule. Do not turn the master switch on in this change.

## Secrets grade

- `RESEND_API_KEY`: UNKNOWN. Not in the repo. Not created here.
- `RESEND_WEBHOOK_SECRET`: UNKNOWN. Not in the repo. Created with the webhook after deploy.
- `EMAIL_FROM`: UNKNOWN. Name only. No mailbox literal in this diff.
- `PUBLIC_CONTACT_EMAIL`: UNKNOWN. Name only. No mailbox literal in this diff.
- Repo scan of this diff: VERIFIED. No API key, webhook secret, service role key, token, project ref, or mailbox. Tests use example.com only. The signing fixture is built in the test from a non-secret phrase and is not a `whsec_` literal.

## Foreign key indexes

`20261220120000_email_core.sql` left four foreign keys without a covering index. The live-send unique index already leads with `email_sends.campaign_id`, so that key is covered. This migration adds:

| Index | Column | Constraint |
| --- | --- | --- |
| `email_preferences_category_idx` | `public.email_preferences.category` | `email_preferences_category_fkey` |
| `email_consent_log_category_idx` | `public.email_consent_log.category` | `email_consent_log_category_fkey` |
| `email_campaigns_category_idx` | `public.email_campaigns.category` | `email_campaigns_category_fkey` |
| `email_sends_user_idx` | `public.email_sends.user_id` | `email_sends_user_id_fkey` |

Defined at `supabase/migrations/20261221120000_newsletter_events.sql:29-38`. A plain index on `email_sends.campaign_id` is at `:41`, because the live-send unique index is partial and does not cover test rows.

## Tables

`public.newsletter_events` (`:56`) has `send_id`, `message_id`, `event`, nullable `url`, `occurred_at`, `svix_id`, and `created_at`. Row level security is enabled and forced. Grants are revoked from public, then from anon, authenticated, and service_role. Writes go through `email_record_event`, which is granted to service_role only. A repeated provider delivery with the same `svix_id` is stored once (`:105`), including when the payload has no event time.

`public.email_unsub_limits` (`:114`) holds hashed unsubscribe rate keys. Service role can write it because the Edge rate helper writes the table directly. Anon and authenticated cannot.

`email_sends.status` now also allows `opened` and `clicked`. `delivered` was already allowed (`:10-21`).

## Functions

Every new definer sets `search_path` to empty. Public wrappers exist so the Edge service role can call them. Each one is revoked from public, then from anon and authenticated, then granted to service_role.

| Function | Where | Role |
| --- | --- | --- |
| `private.email_record_event` | `:132` | Stores the event, including URL, time, and the provider delivery id. Moves status forward only. A hard bounce or complaint suppresses. |
| `public.email_record_event` | `:307` | Service role wrapper. |
| `public.email_is_suppressed` | `:351` | Recheck immediately before a batch. |
| `public.email_recipients` | `:368` | Wrapper for the existing recipient list. |
| `public.email_send_gate` | `:454` | Master switch, batch size, digest flags, and the owner-test stamp. No address. |
| `public.email_log_send` | `:600` | Queue, skip, sent, or failed. A row already sent is not sent again. |
| `public.email_set_campaign_progress` | `:682` | Sending only when the owner test still matches the current hash. |
| `private.email_content_hash` | `:700` | Hash of subject, preheader, body, and tiers. |
| `public.staff_upsert_campaign` | `:740` | An edit clears the owner test and returns the campaign to approved. |
| `private.email_mark_owner_test` | `:860` | A successful owner test writes `test_sent_by`, `test_sent_at`, and `test_content_hash`. An admin test does not. |

A click with a non-http URL is stored with a null URL. The same message, event, time, and URL is stored once.

## Edge

| Function | verify_jwt | Where |
| --- | --- | --- |
| `email-send` | true (`supabase/config.toml:207`) | `supabase/functions/email-send/index.ts:6`, handler `:103` |
| `email-webhook` | false (`:212`) | `supabase/functions/email-webhook/index.ts:8`, signature check `verify.ts:28` |
| `email-unsubscribe` | false (`:217`) | `supabase/functions/email-unsubscribe/index.ts:9`, handler `:27` |

`email-send` accepts `{campaign_id, mode: 'test' | 'live'}`. Test sends one copy to the caller and is allowed while the master switch is off. A successful owner test stamps the campaign (`liveReleaseAllowed` at `supabase/functions/email-send/handle.ts:276`). Live send requires the owner, `master_enabled`, that stamp for the current content, and, for a digest, `digestIssueSendable` in `supabase/functions/_shared/weekly_digest_copy.ts:114`. A missing `RESEND_API_KEY`, `EMAIL_FROM`, or `PUBLIC_CONTACT_EMAIL` fails closed. Batches use `https://api.resend.com/emails/batch`. The idempotency key is the mode plus a hash of that batch's send ids (`supabase/functions/_shared/bulk_mail.ts:69`). A 429 waits on the rate-limit header. Suppression is checked again inside each batch. Nothing calls this function from SQL, a workflow, or a schedule.

`email-webhook` checks `svix-id`, `svix-timestamp`, and `svix-signature` with `RESEND_WEBHOOK_SECRET`. A missing secret, missing header, bad signature, or timestamp older than five minutes returns 401 and writes nothing. Opened, clicked (with URL), delivered, bounced, and complained rows are stored. A hard bounce and a complaint suppress. A soft bounce and a delayed delivery are logged only. IP addresses and user agents are not stored.

`email-unsubscribe` POST with `List-Unsubscribe=One-Click` unsubscribes and returns 200 with an empty body. GET redirects to `/email/unsubscribe` and does not unsubscribe. Good and bad tokens return the same empty 200. POST is rate limited per token only (`supabase/functions/email-unsubscribe/handle.ts:11`). GET keeps the address limit. The list-unsubscribe header is the https link only. There is no mailto.

Letter copy is in `supabase/functions/_shared/bulk_mail_copy.ts:24`. The footer credit is `powered by nammco`. No provider name, price, or mailbox literal is in that file.

## Tests

- `scripts/bulk-mail.test.ts`: master off, missing key, test send, suppression, headers, batch size, pause, idempotency key, 429, copy guards, forced RLS, the four indexes, and no invoke from SQL or workflows.
- `scripts/bulk-mail.test.ts:278`: this migration does not create or alter `public.email_events`.
- `scripts/email-webhook.test.ts`: valid signature stores the five events; tampered body, wrong secret, missing secret, old timestamp, and missing header return 401 with no write.
- `scripts/email-unsubscribe.test.ts`: one-click POST needs no login; GET does not unsubscribe.
- `scripts/email-events-db.test.ts`: local Postgres proof for URL, time, status order, suppression, anon grants, and the account mail log staying unchanged.

No screen changed, so there are no shots.
