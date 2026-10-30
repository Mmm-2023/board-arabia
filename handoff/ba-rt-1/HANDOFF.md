# RT-1 application retention and an inert daily sweep

Base: `main` at `e68687cb923e98ff04fc9c73e846b17e7ad3a65c`. Slot `20270111120000` was free on that commit. Nothing here is applied, deployed, or merged. The repository variable is not set. The Edge function was not called.

## Operator steps

1. Sasha applies `supabase/migrations/20270111120000_application_withdrawn_closed_retention.sql` only, after `20270110120000_majlis_reminder_windows.sql`. Do not run `supabase db push`. Do not apply it from the app or from CI.
2. Setting the GitHub Actions repository variable `RETENTION_SWEEP_ENABLED` to the exact string `true` needs Michael's OK, and only after that migration is live. This pull request does not set it. While it is unset, the job is skipped.
3. The first run that actually calls the function is a plain POST. It applies the whole retention plan, not only the new statuses. Live row counts are UNKNOWN. The read-only SQL below is how to get them. Do not POST the Edge function to count them.

## Gate

The schedule is `0 3 * * *` (03:00 UTC every day). `workflow_dispatch` stays.

The gate covers manual dispatch as well as the schedule. The `if` is on the job, which is the same place PR #222 puts it in `majlis-reminders.yml`. GitHub evaluates that `if` for every trigger of the job, including a manual run. There is no second condition that lets a manual run skip the variable.

- VERIFIED: `.github/workflows/retention-sweep.yml` lines 12 to 13 and line 20. One cron. Job `sweep` runs only when `vars.RETENTION_SWEEP_ENABLED == 'true'`.
- VERIFIED: PR #222 `majlis-reminders.yml` puts `if: ${{ vars.MAJLIS_REMINDERS_ENABLED == 'true' }}` on the job and also has `workflow_dispatch`. This file copies that shape.
- VERIFIED: an empty `RETENTION_SWEEP_SECRET` or an empty `SUPABASE_URL` prints a no-op line and exits 0 before the call. Lines 28 to 30.
- VERIFIED: the call is POST, header `x-retention-sweep`, body `{}`, URL `${origin}/functions/v1/retention-sweep` with no query string. Lines 33 to 38. `origin` is `secrets.SUPABASE_URL` with one trailing slash removed.
- VERIFIED: `pages.yml` does not mention `RETENTION_SWEEP_ENABLED`. It was not edited.

## What changed in the database file

- VERIFIED: the new check is `pending`, `verified`, `declined`, `accepted`, `rejected`, `admitted`, `withdrawn`, `closed`. Lines 10 to 22. The previous check in `20260922170000_wave1_members_profiles.sql` is the first six of those. None of those six were removed.
- VERIFIED: the only change inside `retention_sweep_plan` is the application filter. Lines 199 to 204:

```sql
where a.status in ('rejected', 'declined', 'withdrawn', 'closed')
  and a.decision_at is not null
  and a.decision_at < now() - interval '12 months'
```

`decision_at` is the decision timestamp the previous plan already used for `rejected` and `declined`. The order, the 12 month interval, the member exclusion, and the 500 row cap are unchanged. The test compares the function body with the copy in `20270103120000_free_account_majlis.sql` and allows only that status list to differ.

- VERIFIED: writes in that function sit inside `if p_apply then` at line 335, through line 436. `retention_sweep_plan(false)` does not enter that block. It still returns the jsonb, including `applications`, at line 438.
- VERIFIED: the function raises `forbidden` unless `auth.role()` is `service_role`. Line 59.
- VERIFIED: `applicationExpired` in `supabase/functions/_shared/retention_plan.ts` lines 84 to 88 now treats `withdrawn` and `closed` the same way as `rejected` and `declined`, still on `decision_at`, still skipping a row that has a member. The sweep entrypoint does not call that helper.

## What the first run will delete

The job does not call the function until `RETENTION_SWEEP_ENABLED` is `true` and both GitHub secrets below are set. When it does call, the URL has no `dry_run=1`, so this is the real sweep.

- VERIFIED: a plain POST sets `dry` false and calls `retention_sweep_plan` with `p_apply` true. `supabase/functions/retention-sweep/index.ts` lines 45 to 47 and line 66.
- VERIFIED: the same call does not pass `purge_orphans=1`. Orphan storage is listed and not deleted. `retention_storage.ts` lines 19 to 21. `retention-sweep/index.ts` lines 256 to 261.
- UNKNOWN: how many live rows match. This environment has no production database access, and the Edge function was not called.

`p_apply` true does all of the following. Caps are per run. A larger backlog continues on a later run. Counts from `retention_sweep_plan(false)` are the rows the next apply would take, except where noted.

| What | Rule | Cap | Tag |
| --- | --- | --- | --- |
| Unverified candidate accounts | Open, email never verified, created more than 7 days ago, not a member, not staff. The auth user is deleted. | 500 | VERIFIED. Migration lines 73 and the delete at 397. |
| Confirmed accounts that never submit | Open, email verified, created more than 120 days ago, no majlis request, not a member, not staff. The auth user is deleted. | 500 | VERIFIED. Lines 87 and 397. |
| Declined or closed candidate requests | `request_state` `declined` or `closed`, `decided_at` older than 12 months, not a member, not staff. The auth user is deleted. | 500 | VERIFIED. Lines 100 and 397. This is candidates, not the applications table. |
| Free accounts with a majlis request | The existing 12 month majlis rules. Unchanged. The auth user is deleted. | 500 | VERIFIED. The majlis block is byte-for-byte the previous function. Line 192. |
| Applications | Status `rejected`, `declined`, `withdrawn`, or `closed`, `decision_at` older than 12 months, and no `members.application_id` for that row. The application row is deleted. | 500 | VERIFIED. Lines 199 to 204 and the delete at 402. |
| Exited members | `left_at` older than 24 months, no legal hold, not already anonymised. The row is anonymised, not deleted. | 500 | VERIFIED. Lines 207 to 216 and the updates at 405. |
| Consent log | `purge_expired_consent_log()` deletes every consent row older than 13 months. The id list in the plan json is capped at 2000 and is not what the delete uses. | No cap on the delete | VERIFIED. Line 428 calls the function. The function body is `20261102120000_consent_log.sql` lines 163 to 164. The 2000 cap is only the report list at line 225. |
| Staff access log | Rows older than 13 months. | 2000 | VERIFIED. Line 363. |
| AI tool jobs and their files | Older than the configured retention days, default 30. SQL deletes the job rows. The Edge function then deletes the storage objects named in the plan. | 500 jobs | VERIFIED. SQL lines 336 to 345. Edge `purgeAiToolFiles` runs only when `dry` is false. |
| Due diligence decks, jobs, reports, and files | Older than the same retention days. SQL deletes the rows. The Edge function deletes the named storage objects. | 500 each | VERIFIED. SQL lines 347 to 360. |
| Marketing stats cache | Rows older than 24 hours, if that table exists. | None in the delete | VERIFIED. Lines 430 to 434. |
| Candidate events and notes | Rows for the auth users deleted above. | The doomed id list | VERIFIED. Lines 385 to 386. |

The new statuses do not add rows by themselves. The check this file replaces does not allow `withdrawn` or `closed`, so a database that already has that check cannot contain those statuses. VERIFIED from `20260922170000_wave1_members_profiles.sql`. UNKNOWN whether production still has that check. After this migration, a withdrawn or closed application is deleted only once `decision_at` is at least 12 months old.

The same plain POST also does work that is not a table delete:

- VERIFIED: before the apply, it enqueues a `security_deletion` notice for each unverified, never-submitted, and decided user id. `retention-sweep/index.ts` lines 50 to 62. It does not enqueue that notice for the application ids.
- VERIFIED: it sends the idle-account reminder for the reminder ids (open, verified, never reminded, age 90 days up to 120 days, no majlis request). SQL only lists them, cap 200, lines 103 to 115. The Edge function sends when `dry` is false. Lines 71 to 79.
- VERIFIED: it calls `newsletter_events_retention` when `dry` is false. Lines 91 and 208 to 211. That count is not in `retention_sweep_plan`.
- VERIFIED: it posts `$delete_person` for queued analytics ids when the PostHog key is set. Lines 169 to 201.
- VERIFIED: it inserts one `retention_runs` row. Line 116.

## Read-only counts

There is a plan-only path. It was not used against production.

- VERIFIED: `dry_run=1` on the Edge function sets `dry` true, so line 66 passes `p_apply: false`. Lines 45 to 47. That skips the delete block.
- VERIFIED: that query is still not read-only at the Edge layer. Line 116 inserts `retention_runs` even when `dry` is true, and the function lists storage. Do not POST it, with or without `dry_run=1`.
- VERIFIED: `select public.retention_sweep_plan(false)` does not enter the write block at line 335. That is the read-only path.

Live counts: UNKNOWN.

Sasha can run this in one session after the migration is live. `p_apply` stays false. Do not change it to true.

```sql
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'service_role')::text,
  true
);

select key,
  case when jsonb_typeof(value) = 'array' then jsonb_array_length(value) end as count,
  case when jsonb_typeof(value) = 'number' then value end as number
from jsonb_each(public.retention_sweep_plan(false)) as item(key, value);
```

- VERIFIED: the guard requires `auth.role()` = `service_role`. Line 59. Repo tests stub `auth.role()` from `request.jwt.claims`. `scripts/sponsor-directory-opt-in.test.ts` lines 189 to 194.
- INFERRED: the hosted `auth.role()` reads that same claim. Its body is not in this repo. If the statement raises `forbidden`, the session is not `service_role`. Stop. Do not call the function with true.
- VERIFIED: `applications` is one id list for rejected, declined, withdrawn, and closed together. It does not split by status. `invites_returned` stays 0 on this call. Use the `invites` array length for that count. `consent` is the capped report list, not the full delete. Newsletter events are absent.
- UNKNOWN: the numbers, until that SQL is run on the live database after the migration.

## Secrets and deploy

This pull request does not set the variable or any secret.

| Name | Where | Tag |
| --- | --- | --- |
| `RETENTION_SWEEP_ENABLED` | GitHub Actions variable. Exact string `true`, and only after the migration is live, with Michael's OK. | VERIFIED the workflow reads this name. UNKNOWN whether the variable already exists. |
| `RETENTION_SWEEP_SECRET` | GitHub secret, sent as `x-retention-sweep`. Must match the Edge secret of the same name. | VERIFIED the workflow and `authorized` in the Edge function use this name. UNKNOWN whether either copy is already set. |
| `SUPABASE_URL` | GitHub secret. Project origin only. Scheme and host. No path, no query, no key. The workflow appends `/functions/v1/retention-sweep`. | VERIFIED the workflow reads `secrets.SUPABASE_URL`. The previous file had the origin written out. This file does not. UNKNOWN whether a GitHub secret of this name already exists. The Edge runtime has its own `SUPABASE_URL`. That is not this Actions secret. |

Edge redeploy: none.

- VERIFIED: `supabase/functions/retention-sweep/index.ts` is not edited. It already calls `retention_sweep_plan`. The status list lives in SQL.
- VERIFIED: `applicationExpired` changed in `supabase/functions/_shared/retention_plan.ts`. The sweep entrypoint does not call it. Deploying the function would not change which rows the plan deletes.

## Secrets scan

Scanned the migration, the workflow, and this handoff for a JWT prefix, a private-key block, a URL scheme, a hosted project name, an access-key prefix, and a mailbox.

Result: no hits in those three files. The workflow has two secrets references and one vars.RETENTION_SWEEP_ENABLED reference. The copied plan still builds the anonymised address from the previous function. That host is example.com, and it is split across a concatenation, so it is not a literal mailbox.

Two tests name the forbidden strings only to assert that the workflow does not contain them. `scripts/newsletter-analytics.test.ts` asserts the workflow has no URL scheme. `scripts/application-withdrawn-closed-retention.test.ts` asserts the workflow has no project ref and no JWT prefix. Those lines are checks, not credentials.
