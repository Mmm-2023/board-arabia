# Board Arabia admin request alerts (29 Sep 2026)

Staff email when a request lands in an admin queue. Not merged.

Branch: `cursor/admin-queue-alerts-236c`

Base: `main`

## Design

Shared `notifyAdmin` helper in `supabase/functions/_shared/notify_admin.ts`, called from each request path that lands work for staff. A database trigger plus an Edge function was the other option. This repo does not use `pg_net`, and a trigger that calls the network can slow or roll back the member's transaction.

The helper is fire-and-forget (`EdgeRuntime.waitUntil` when present), times out at 2 seconds, and never throws. The requester's action still succeeds.

The letter includes the requester name (member, sponsor, or applicant), what they requested, which item, the time in Riyadh (AST, UTC+3), and a link to the admin page for that queue.

The mandate intro write stays the existing `request_mandate_intro` RPC. The member UI calls `request-mandate-intro`, which runs that RPC with the member JWT and alerts only when a new pending row lands.

The real estate intro write stays `request_re_opportunity_intro`. `request-re-intro` runs that RPC with the member JWT and alerts only when a new pending row lands. The applied migration is unchanged. `private.note_re_intro_admin_alert` still sends no mail. `requestReOpportunityIntro` in `src/lib/demoFetch.ts` calls the wrapper. No page calls that function yet. There is no real estate approve screen, so the link is `/admin`. Staff still decide the row with `staff_decide_re_opportunity_intro`.

## Secrets

Names only. Values are not in this file. No new secret.

| Secret | State for a live alert |
| --- | --- |
| `ADMIN_NOTIFY_EMAIL` | Existing recipient. Unset: warning, no send, request still succeeds. |
| `GMAIL_CLIENT_ID` | Existing OAuth client. Unset: warning, no send. |
| `GMAIL_CLIENT_SECRET` | Existing OAuth client secret. Unset: warning, no send. |
| `GMAIL_REFRESH_TOKEN` | Existing refresh token. Unset: warning, no send. |
| `GMAIL_FROM` | Existing From and Reply-To on the shared Gmail sender. Not a new secret. |

Live send uses the shared `sendEmail` helper. A service-account JSON does not replace the OAuth trio for these alerts. A Gmail failure is a warning and does not fail the request.

## Migration

None. Do not apply a migration for this change.

## Edge redeploy

Deploy these before the frontend that calls `request-mandate-intro` is live. `mail.ts` is unchanged, so other functions do not need a redeploy for this work. Not deployed from this change.

| Function | Why |
| --- | --- |
| `submit-application` | Alerts on a new pending application |
| `majlis-apply` | Alerts on a new Majlis host application |
| `due-diligence-start` | Alerts when an AI Due Diligence run is queued |
| `request-mandate-intro` | New function. `verify_jwt = true`. Wraps `request_mandate_intro` and alerts |
| `request-re-intro` | New function. `verify_jwt = true`. Wraps `request_re_opportunity_intro` and alerts |

## Coverage inventory

| Path or queue | Covered | Reason |
| --- | --- | --- |
| `submit-application` (new application, status pending) | Covered | Alert after insert. Link `/admin/applications`. The existing staff notice to `ADMIN_NOTIFY_EMAIL` stays. |
| `request-mandate-intro` wrapping `request_mandate_intro` (mandate access and unlock) | Covered | Same RPC. Alert only for a new pending intro. Link `/admin#mandate-intro-queue`. A sponsor seat is labeled sponsor. |
| `majlis-apply` (Majlis apply, `pending_approval`) | Covered | Link `/admin/majlis#admin-majlis-pending`. |
| `due-diligence-start` (AI Due Diligence run started) | Covered | No approve screen exists. Link `/admin`. |
| `request-re-intro` wrapping `request_re_opportunity_intro` | Covered | New pending row in `re_opportunity_intros`. Link `/admin`. No approve screen yet. |
| Applications queue (`/admin/applications`, staff home pending count) | Covered | Fed by `submit-application`. |
| Mandate intro queue (`MandateIntroQueue` on `/admin`) | Covered | Fed by `request-mandate-intro`. |
| Majlis host queue (`/admin/majlis#admin-majlis-pending`) | Covered | Fed by `majlis-apply`. |
| `majlis-rsvp` (Majlis seat / registration) | Not covered | `majlis_place_rsvp` in `supabase/migrations/20260926103000_majlis_rsvp.sql` writes `registered` or `waitlist` itself and promotes the next waitlist row on cancel. The Promote button in `src/pages/admin/MajlisPage.tsx` is a manual override, not an approval queue. |
| Deal room access (`public.rooms`) | Not covered | `public.rooms` in `supabase/migrations/20260929120000_demo_seed_thresholds_redaction.sql` allows only `open` or `closed`, revokes all from `authenticated`, and the only member RPC is `list_member_rooms`. No request table. |
| `invite-sponsor` and `claim_sponsor_seat` | Not covered | `claim_sponsor_seat` inserts the member immediately. `staff_assign_sponsor_category` and `staff_save_re_partner` in `supabase/migrations/20260929230000_real_estate_inventory.sql` are staff-only. No sponsor submission lands pending. |
| `SponsorInvitePanel` / People | Not covered | Same staff invite UI. |
| `majlis-admin-action` sponsor label | Not covered | Staff edits the presenting label. Not a sponsor request. |
| `majlis_events_sponsor` | Not covered | Sponsors read published events. No submission. |
| Public sponsor application | Not covered | No sponsor request form or table exists. A sponsor who requests mandate access uses the mandate path and is labeled sponsor. |
| `send-member-invite` | Not covered | The member sends the invite. It does not wait for admin approval. |
| `remind-member-invites` | Not covered | Reminder of an existing invite, not a new admin item. |
| `request-password-reset` | Not covered | Not an admin queue. |
| `linkedin-oauth` | Not covered | Saves the member profile. No admin queue. |
| `notify-application` | Not covered | Staff resend for an application that already landed. `submit-application` already alerts. |
| `invite-master` | Not covered | Staff creates an accepted application and admits. Not a pending queue item. |
| `decide-application`, `admit-member`, `set-member-status`, `majlis-approve` | Not covered | These are the admin decisions, not new requests. |
| Staff home failed email | Not covered | Derived from `email_events`. Alerting on it could loop. |
| Staff home capacity near-full | Not covered | Computed from seat counts. No request row. |
| Staff home invites awaiting apply | Not covered | Waiting for the guest to apply. No approve action. |
| `due_diligence_jobs` staff select | Covered as an alert | Staff can read the rows. There is no queue UI, so the link is `/admin`. |

## Secrets scan

VERIFIED for this change. Production source names secrets only. Test fixtures use example.com. No new secret name, no live mailbox, no key, and no refresh token value.
