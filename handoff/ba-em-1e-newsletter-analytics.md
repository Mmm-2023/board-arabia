# EM-1e handoff: newsletter analytics

Base: `main` at `1541c39`. One migration, `supabase/migrations/20261231120000_newsletter_analytics.sql`. Nothing here is applied, deployed, or scheduled. Sending stays off.

`20261231120000` was free on `origin/main`. `20261229120000` is not used. `20261230120000_staff_aal1_access.sql` is the previous slot.

Account mail stays on `public.email_events`. These functions do not read it. Counts come from `public.newsletter_events`, the send log, and the unsubscribe log.

The Email page redesign and the Contacts import are static mocks. They are not imported by `src/pages/admin/EmailPage.tsx` or `src/App.tsx`. No EM-1g migration, function, or route.

## Apply list

Apply `20261231120000_newsletter_analytics.sql` only, after `20261230120000_staff_aal1_access.sql`. Leave the master switch off. Do not deploy Edge. Do not set secrets. Do not turn sending on.

Open and click measurement on the news domain is a dashboard step at apply time. This change does not call that dashboard.

## Secrets grade

- `RESEND_API_KEY`: UNKNOWN. Not in this diff. Not created here.
- `RESEND_WEBHOOK_SECRET`: UNKNOWN. Not in this diff. Not created here.
- Repo scan of this diff: VERIFIED. No API key, webhook secret, service role key, token, project ref, or mailbox outside example.com. Tests and the mock use example.com only.

## Functions

Every new function sets `search_path` to empty. Table reads are security definer. Staff entry points call `private.is_staff()`. That function, after `20261230120000_staff_aal1_access.sql`, no longer checks a second factor. Execute is revoked from public, then from anon, authenticated, and service_role, then granted to authenticated only.

| Function | Where | What it returns |
| --- | --- | --- |
| `public.staff_newsletter_stats(uuid)` | `supabase/migrations/20261231120000_newsletter_analytics.sql:233` | One letter. Sent, delivered, unique and total opens, open rate, unique and total clicks, click rate, bounces, complaints, unsubscribes, per tier, and the top 10 links. |
| `public.staff_newsletter_trend()` | `:352` | The last 12 sent weekly issues, oldest first. Open rate, click rate, bounces, unsubscribes. |

`opens` is the text `approximate` on both payloads (`:337` and `:412`). A count under 5, including 0, is the text `<5` (`:24`). A rate is `<5` when the numerator or the delivered count is under 5 (`:39`). Links are normalised (`:72`): lower-case host, no fragment, no trailing slash, and `utm_`, `mc_`, `fbclid`, `gclid`, `yclid`, and `ref` dropped. Unsubscribe URLs are left out of click counts and out of the link list (`:57`).

An unsubscribe is counted for the latest live send of that category at or before the consent row (`:183`). Test sends are ignored. The payload has no user id, address, or hash.

`public.newsletter_events` row level security stays enabled and forced (`:12`). No new table. No new table grant. No cron, `pg_net`, or `net.http`.

## Unsubscribe links stay untracked

The body unsubscribe link is a normal link. Domain click tracking is not switched off per link. `List-Unsubscribe` stays the raw https token URL. Unsubscribe URLs are left out of the click counts and out of the top links. A link with fewer than 5 unique clicks is omitted, and displayed URLs have no query string.

`public.newsletter_events_retention()` deletes measurement rows older than 13 months. The existing retention sweep calls it, and a dry run does not. No new schedule was added.

Measurement is off until the member turns on "Measure opens and clicks" in Your privacy. That choice is stored as `measure_opens` and logged with source `privacy_panel`. A live send uses `EMAIL_FROM_NEWS_TRACKED` and `RESEND_API_KEY_NEWS_TRACKED` only when that choice is on and both values are set. Otherwise it uses the untracked news sender and sets open and click tracking off on the message. If the tracked values are missing, everyone gets the untracked sender. Open and click rows are stored only when the send was stamped measured and the member is still opted in. Aggregates include only those sends. `staff_upsert_campaign` now refuses any category whose kind is not bulk, so `measure_opens` cannot be a letter audience.

There is no live results screen. `src` does not call `staff_newsletter_stats`. The sentence "These figures count only members who turned measurement on." is on the Results mock in `scripts/smoke/emailDeskMock.tsx` only. This is consent-only because Resend tracking follows the sending domain, so a separate tracked sender is the way to keep a pixel and rewritten links off the copies people did not agree to.

## LEGAL CHANGE

`src/content/legal/privacy.en.ts` is a locked file. Counsel should review this hunk before apply.

Clause 3.15 (`:153`):

"Newsletter measurement. If you agree to receive our newsletter, we measure whether it is opened and which links are clicked, using a small image and tracked links in the email. We do this only with your consent and only to produce aggregate statistics, such as open and click rates. We do not show staff or other members who opened or clicked. Opens are approximate, because some mail apps download images automatically. You can stop measurement or the newsletter at any time in Your privacy. Unsubscribe clicks are not included in these statistics."

The contact address in the retention row is the `[CONTACT EMAIL]` token. `src/content/legal/resolve.ts` fills that token from `legalField('contactEmail')`. The source has no mailbox literal.

Retention table row:

"Newsletter open and click records" / "Removed on request to [CONTACT EMAIL], and in any case within 13 months"

There is no newsletter-event row in the retention job. The notice uses the fallback period. The contact address stays the `[CONTACT EMAIL]` placeholder.

## Mocks, not wired

`scripts/smoke/emailDeskMock.tsx` is the static screen. Shots are under `/opt/cursor/artifacts/em-1e-email-desk/`, each at 1440 and 390.

Email redesign: `weekly`, `letters`, `results`, `step-1`, `step-3`, `step-5`, `step-6`, `plain`, `details`.

Contacts import, mock only: `contacts-list`, `contacts-upload`, `contacts-map`, `contacts-basis`, `contacts-summary`. The basis step offers Opted in or Known contact, plus a source note and a list, and Import stays blocked until those are set. No EM-1g migration or route. It does not send.

Release on step 6 stays disabled while sending is off. Opens on Results are labelled approximate. Cells under 5 show `<5`.

## Tests

- `scripts/newsletter-analytics.test.ts`: named migration, not assumed newest, forced row level security, staff gate, mask, top 10, no account-mail table name, untracked unsubscribe, privacy lines, mock not wired.
- `scripts/newsletter-analytics-db.test.ts`: local Postgres. Aggregation, mask, tier split, normalised links, unsubscribe URL excluded, later letter does not take an earlier unsubscribe, last 12 issues, staff only, anon and service_role have no execute.
- `scripts/email-desk-mock.test.ts`: the shots above.
- `scripts/security-view-access.test.ts` lists `staff_newsletter_stats` and `staff_newsletter_trend`.
