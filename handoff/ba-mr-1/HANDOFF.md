# MR-1 majlis reminder schedule

Base: `main` at `9deb3245435103f2eca3088398c45579995e12c9`. One workflow, `.github/workflows/majlis-reminders.yml`. No migration. No Edge function change. No locked file edited. `pages.yml` was not edited.

The GitHub Actions variable `MAJLIS_REMINDERS_ENABLED` is not set by this change. The Edge flag of the same name is not set. Nothing here sends a letter.

## What the job does

- VERIFIED: the job `remind` runs only when `vars.MAJLIS_REMINDERS_ENABLED == 'true'`. `.github/workflows/majlis-reminders.yml` line 20. An unset variable is an empty string, so the job is skipped on merge.
- VERIFIED: the schedule is `*/15 * * * *` (every 15 minutes). Line 12. `workflow_dispatch` is present because `.github/workflows/invite-reminders.yml` has it. The same job `if` covers that dispatch. Line 13 and line 20.
- VERIFIED: the call is `POST` with header `x-majlis-cron`. The header value is `${{ secrets.MAJLIS_CRON_SECRET }}`. The origin is `${{ secrets.SUPABASE_URL }}`, with one trailing slash removed, then `/functions/v1/majlis-reminders`. Lines 25 to 38.
- VERIFIED: an empty `MAJLIS_CRON_SECRET` or an empty `SUPABASE_URL` prints a no-op line and exits 0. The call does not run. Lines 28 to 30.
- VERIFIED: the workflow file contains no `https://` host, no project ref, no mailbox, no JWT, and no service role. Test: `scripts/majlis-reminders-workflow.test.ts`.
- VERIFIED: other workflow files still do not name `majlis-reminders`. `scripts/majlis-reminders.test.ts` skips only this new file. `scripts/email-transactional.test.ts` still requires `invite-reminders.yml` to omit that name.

## What the function already does

No Edge code was changed. These facts are from the current function.

- VERIFIED: auth accepts header `x-majlis-cron` when it matches Edge `MAJLIS_CRON_SECRET`. `supabase/functions/_shared/majlis_reminders.ts` lines 173 to 176. `verify_jwt` is false, so the anon key is not a credential. `supabase/config.toml` lines 28 to 30.
- VERIFIED: Edge `MAJLIS_REMINDERS_ENABLED` sends only when the value is the exact string `true`. `remindersEnabled` at line 39. While it is off, the function does not claim a stamp and does not send. It returns HTTP 200 `{ "enabled": false, "would_send": { "t7": n, "t1": n, "t1h": n, "live": n } }`. Lines 138 to 144.
- VERIFIED: a send whose status is not `sent` releases the claim. Line 159. A missing Gmail credential returns `dry_run`, which is not `sent`. `supabase/functions/_shared/mail.ts` lines 174 to 181.
- VERIFIED: From and Reply-To come from Edge `GMAIL_FROM`. `productFromMailbox` at `supabase/functions/_shared/mail.ts` line 49. This workflow does not set an address.

## What Michael sets to let the job call the function

This pull request does not set any of these. Do not set the GitHub variable until a separate approval.

| Name | Store | Value | Tag |
| --- | --- | --- | --- |
| `MAJLIS_REMINDERS_ENABLED` | GitHub Actions repository variable (`vars`) | Exact string `true`. Any other value, including unset, skips the job. | VERIFIED. The workflow reads this name. UNKNOWN whether the variable already exists. The Actions variables API returned 403 here, so the live list was not read. |
| `MAJLIS_CRON_SECRET` | GitHub Actions secret (`secrets`) | Same string as the Edge secret below. Sent only as the `x-majlis-cron` header. | VERIFIED. The workflow and the function use this name. UNKNOWN whether the GitHub secret already exists. |
| `SUPABASE_URL` | GitHub Actions secret (`secrets`) | Project API origin only. Scheme and host. No path, no query, no key, no mailbox. The workflow appends `/functions/v1/majlis-reminders`. | VERIFIED. The workflow reads `secrets.SUPABASE_URL`. INFERRED: use the same host `.github/workflows/invite-reminders.yml` already calls. UNKNOWN whether a GitHub secret of this name already exists. The Edge runtime injects its own `SUPABASE_URL`. That value is not the Actions secret. |

Edge secret required for the call to pass auth:

| Name | Store | Value | Tag |
| --- | --- | --- | --- |
| `MAJLIS_CRON_SECRET` | Supabase Edge secret | Exact match for the GitHub secret. | VERIFIED. The function compares it to `x-majlis-cron`. UNKNOWN whether it is already set in the hosted project. Live secret values were not read. |

A missing Edge secret makes the function return 401, and the job fails. A missing GitHub secret makes the job exit 0 before the call.

## What must already be true before a letter sends

The job can run and still send nothing. Sending stays behind the Edge flag.

| Name | Store | Value | Tag |
| --- | --- | --- | --- |
| `MAJLIS_REMINDERS_ENABLED` | Supabase Edge environment | Exact string `true`. This is separate from the GitHub variable. | VERIFIED. Line 138. This change does not set it. |
| `GMAIL_FROM` | Supabase Edge environment | The existing From and Reply-To. No address is written in this pull request. | VERIFIED. The sender reads this name. UNKNOWN whether it is already set. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`, or `GMAIL_SERVICE_ACCOUNT_JSON` | Supabase Edge environment | Existing Gmail credentials. | VERIFIED. `gmailCredentialsPresent` at `mail.ts` lines 68 and 408 to 418. A missing set dry-runs and the claim is released. UNKNOWN whether they are already set. |

## Apply

1. Merge this pull request only when the five checks are green. The job stays skipped because the GitHub variable is unset.
2. Do not set GitHub `MAJLIS_REMINDERS_ENABLED`.
3. Do not set Edge `MAJLIS_REMINDERS_ENABLED`.
4. Do not deploy an Edge function for this change. `majlis-reminders` is already the function that accepts `x-majlis-cron`.
5. No migration.

## Checks

- `scripts/majlis-reminders-workflow.test.ts`: gate, 15 minute cron, `workflow_dispatch` paired with invite reminders, secret references, and no literal URL, key, or mailbox.
- `scripts/majlis-reminders.test.ts`: the migration test still rejects the function name in every other workflow.
