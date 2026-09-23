# Board Arabia public secrets scrub (23 Sep 2026)

Michael lock. One PR. Not merged.

PR: https://github.com/Mmm-2023/board-arabia/pull/15

Branch: `cursor/secrets-scrub-env-mail-2480`

The audit file named in the task (`github-public-secrets-audit-2026-09-23.md`) was not in this checkout. The scrub follows the verified findings in the task.

## What changed

- `supabase/functions/decide-application/mail.ts` reads `PRIVATE_BOOKING_LINK` only. There is no booking URL fallback in source.
- `decide-application` returns an error and does not send Accept mail when `PRIVATE_BOOKING_LINK` is missing or blank. The application row is not marked accepted on that path.
- `supabase/functions/_shared/mail.ts` no longer contains ops mailbox literals. From and Reply-To come from `GMAIL_FROM`. Staff notify comes from `ADMIN_NOTIFY_EMAIL`. A live send (Gmail credentials present) fails closed when `GMAIL_FROM` is missing or is the parked noreply address. Dry-run still applies when Gmail credentials are absent.
- `submit-application` and `notify-application` do not send the staff notice when `ADMIN_NOTIFY_EMAIL` is missing. They record an error and do not substitute an address.
- `invite-master` uses `ADMIN_NOTIFY_EMAIL` when the request omits an email, and fails closed when that env is unset. The admin button **Invite / promote Michael** depends on that secret.
- README ops docs use `ops@example.com` and `staff@example.com`. Secret names stay.
- `scripts/gmail-mail.test.ts` and `scripts/peer-invite.test.ts` assert those placeholders.

## SECURITY checklist

| Check | Result |
| --- | --- |
| Booking URL fallback removed from `decide-application` | PASS. Accept fails closed when `PRIVATE_BOOKING_LINK` is unset and does not send. |
| Ops mailbox literals removed from `_shared/mail.ts` | PASS. From, Reply-To, and staff notify are env only. |
| `invite-master` source default removed | PASS. Same PR. Uses `ADMIN_NOTIFY_EMAIL`. |
| README ops docs are placeholders | PASS. `ops@example.com`, `staff@example.com`. Names kept: `GMAIL_*`, `ADMIN_NOTIFY_EMAIL`, `PRIVATE_BOOKING_LINK`. |
| Mail tests assert placeholders | PASS. |
| Client bundle (`src/`) | PASS. No ops mailbox literals and no booking URL in this pass. |
| Anon key in `.env.example` and Pages workflow | UNCHANGED. Public by design. |
| Service-role key | NOT ADDED. |
| Diff scan of added lines | VERIFIED. No ops-domain emails, no booking URL, no JWT, no private-key block, no `service_role` literal. |
| Parked product address `noreply@boardarabia.com` | Still a code rule and a doc note. Not used as a From fallback. |
| Migration `supabase/migrations/20260922190000_staff_master_admin_read.sql` | NOT REWRITTEN. It still hardcodes the master mailbox in old SQL. Leave history. A later migration can replace the guard if Michael wants the address out of git. |
| Marketing-signature fixture in `scripts/gmail-mail.test.ts` | UNCHANGED. A synthetic mailbox on the filtered domain remains so the site-vs-mailbox check still runs. It is not a send default. |
| Older task handoff | Updated in this PR so it no longer names the ops mailbox. It now points at `GMAIL_FROM`. |

## Edge secrets Michael must set before live mail

Set these on the Supabase Edge Function secrets. Do not commit the values.

| Secret | Role |
| --- | --- |
| `GMAIL_CLIENT_ID` | OAuth client |
| `GMAIL_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Refresh token for the `GMAIL_FROM` mailbox, Gmail send scope |
| `GMAIL_FROM` | Visible From and Reply-To. Required for a live send. Example shape: `"Board Arabia" <ops@example.com>` |
| `ADMIN_NOTIFY_EMAIL` | Staff notify recipient and master-invite default |
| `PRIVATE_BOOKING_LINK` | Accept mail only. Required. Never put the value on a public page |
| `GMAIL_IMPERSONATE` | Only if domain-wide delegation is used. Same mailbox as `GMAIL_FROM` |
| `GMAIL_SERVICE_ACCOUNT_JSON` | Only if domain-wide delegation is used |

Until `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` (or the service-account JSON) are set, sends stay dry-run. Once those credentials exist, a missing `GMAIL_FROM` is an error and the message is not sent.

## Proof

`node --experimental-strip-types --test scripts/gmail-mail.test.ts scripts/peer-invite.test.ts scripts/recovery-location.test.ts scripts/capacity-guardrails.test.ts`

29 passed.

`npx oxlint` completed with existing warnings only (pre-existing regex and dashboard effect). No new errors.

## Merge

Michael merges https://github.com/Mmm-2023/board-arabia/pull/15. This agent does not merge.
