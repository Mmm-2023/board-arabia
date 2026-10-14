# EM-1f handoff: deliverability

Base: `main` after the newsletter analytics pull request. One migration, `supabase/migrations/20270101120000_email_deliverability.sql`. Sending stays off. The master switch default is unchanged. No cron, no `pg_net`, and no workflow schedule was added. No second-factor check was added.

The tracked news sender names and `20261231120000_newsletter_analytics.sql` stay as they landed on main. This change does not add a second copy. A tracked From that is the apex, or any other domain, falls back to the untracked news stream. Untracked newsletter copies still turn measurement off. The batch sender still groups by key.

Nothing here was applied to the live database. No `db push`, no Edge deploy, no secret set, no merge.

## Apply list

1. Apply `20270101120000_email_deliverability.sql` only. It sorts after `20261230120000_staff_aal1_access.sql`. Slot `20261231120000` is not used here.
2. Redeploy the Edge functions that bundle the shared sender:
   - `email-send`
   - `email-webhook`
   - `email-unsubscribe`
   - `member-notice-send`
   - `email-streams` (new, read-only From addresses, staff JWT)
3. No new secret values. Names only, set in the Edge secret store when sending is approved. The original `RESEND_API_KEY` and `EMAIL_FROM` remain a fallback for news only. `EMAIL_UNSUB_MAILTO` stays unset, so the mailto header stays off. Reply-To on the news and mail streams is `EMAIL_REPLY_TO`. The newsletter footer contact line uses that same address. `EMAIL_SENDING_PARENT` is the parent domain for the From guard. If it is unset, every From is refused. Workspace invites still send from `GMAIL_FROM`, and that path already sets Reply-To.

New env names read by this change:

- `EMAIL_FROM_NEWS`
- `RESEND_API_KEY_NEWS`
- `EMAIL_FROM_MAIL`
- `RESEND_API_KEY_MAIL`
- `EMAIL_REPLY_TO`
- `EMAIL_SENDING_PARENT`
- `EMAIL_UNSUB_MAILTO`

Already on main, and still read here: `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_FROM_NEWS_TRACKED`, `RESEND_API_KEY_NEWS_TRACKED`, `GMAIL_FROM`, `PUBLIC_CONTACT_EMAIL`.

Leave the master switch off.

## Secrets grade

VERIFIED for this diff. No API key value, webhook secret, service-role key, token, project ref, or staff mailbox is committed. Test addresses use example.com or boardarabia.test. Provider secret values are UNKNOWN because they are not created here.

- `RESEND_API_KEY`, `RESEND_API_KEY_NEWS`, `RESEND_API_KEY_MAIL`: UNKNOWN. Names only.
- `RESEND_WEBHOOK_SECRET`: UNKNOWN. Not changed here.
- `EMAIL_FROM`, `EMAIL_FROM_NEWS`, `EMAIL_FROM_MAIL`, `EMAIL_FROM_NEWS_TRACKED`, `EMAIL_REPLY_TO`, `EMAIL_SENDING_PARENT`, `EMAIL_UNSUB_MAILTO`, `PUBLIC_CONTACT_EMAIL`, `GMAIL_FROM`: UNKNOWN. Read from the Edge environment at send time. No mailbox literal was added.

## What changed

Two streams, set from config in `resolveMailStream` at `supabase/functions/_shared/bulk_mail.ts:22`. News reads `EMAIL_FROM_NEWS` and `RESEND_API_KEY_NEWS`, then the original names. Mail reads `EMAIL_FROM_MAIL` and `RESEND_API_KEY_MAIL` only. A missing stream returns 503 and does not call the provider. `email-send` passes that env from `supabase/functions/email-send/index.ts`. Account mail in `supabase/functions/_shared/mail.ts` is unchanged.

The From guard is `sendingFromAllowed`. The parent domain is `EMAIL_SENDING_PARENT`. A From must be a subdomain of that parent. The apex is refused, and so is any other domain. If the parent is unset, the sender refuses every From. `deliverBatches` refuses before the provider call.

The newsletter footer contact line is `Questions:` plus the reply address, which is `EMAIL_REPLY_TO`. It is not a hard-coded mailbox.

Newsletter messages keep RFC 8058 headers from `listUnsubscribeValue` at `supabase/functions/_shared/bulk_mail.ts:125`: the https token URL, plus a mailto only when `EMAIL_UNSUB_MAILTO` is set. `List-Unsubscribe-Post` is `List-Unsubscribe=One-Click`. The body still has a visible unsubscribe link. Transactional and security posts omit those headers and set open and click tracking off. Newsletter posts do not set tracking flags, so the domain setting stands.

A hard bounce or complaint still writes `email_suppressions` once and does not replace that row. The same hash blocks later newsletter sends and non-essential transactional mail. Essential mail stays limited to an invalid address, as before. The sender checks suppression again inside each batch.

Auto-pause uses `pauseDecision` and `private.email_pause_reason`. Rates count only once delivered is at least 100. Complaints at or above 0.1 percent, or bounces at or above 4 percent, stop further batches, set the campaign to `paused`, set the master switch off, and write `email_pause_log`. The check runs in the sender between batches and from the newsletter event trigger. If the rate check itself errors, the unsent rows are counted as failed and the campaign stays `sending`, so a later run can continue. Only the owner can resume. Resume clears the pause and leaves the master switch off. No second factor is required.

Admin Email shows the two From addresses read-only from `email-streams`, and a pause banner with the reason, in `src/pages/admin/EmailCampaignView.tsx:102` and `:275`. Addresses are not inputs. A staff session sees the banner without Resume.

Shots, viewport 1440 and 390:

- `/opt/cursor/artifacts/em-1f-deliverability/pause-1440.png`
- `/opt/cursor/artifacts/em-1f-deliverability/pause-390.png`

## Locked files

No hunks in the locked files.
