# OP-1 handoff: clear the operator row and lock owner demotes

Base is main `350de4008a1f80c9fa5418f70b126fe06cedb0c5` (after #167). Branch: `cursor/op1-operator-owner-lock-305c`. Slot `20261219120000` was free. Latest migration on that base is `20261217120000_owner_staff_gate.sql`.

This file was not applied. No Edge deploy. No live setting change. No merge. No email.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, tokens, passwords, staff names, mailbox names, project refs, or staff allowlists. No address was added. The new migration and its test do not contain the previous operator name or registration number. Absence is checked with `publicEntityHits`, which builds its needles from fragments.

## What changed

| Item | Where | Grade |
| --- | --- | --- |
| Live operator entity is Board Arabia and the registration field is empty | `supabase/migrations/20261219120000_operator_row_owner_lock.sql:12` | VERIFIED |
| The not-blank registration check is dropped so the empty value can be stored. The column stays not null | same file, constraint drop at `:10` | VERIFIED |
| Operator table row level security stays forced. Table grants are not changed. Anon is not granted | `:31` | VERIFIED |
| `staff_set_role` locks every owner row, in user id order, before the last-owner count | `:74` | VERIFIED |
| `staff_remove` locks every owner row, in user id order, before the last-owner count | `:152` | VERIFIED |
| Both functions stay security definer with `search_path ''` and still call `private.is_staff()` before any write | `:36` and `:123` | VERIFIED |
| Execute grants stay revoked for anon and granted for authenticated | `:114` and `:191` | VERIFIED |
| The earlier operator seed file is not edited | `supabase/migrations/20261126120000_ai_report_operator.sql` | VERIFIED |

Two owners demoting or removing each other take the same row locks before they count. The second transaction sees the first change and cannot leave zero owners. The pinned owner check is unchanged.

The registration value is the empty string, which the brief allows. The column stays not null so existing readers can trim it. While that field is empty, the current loader omits the "Provided by Board Arabia" sentence. That loader was not edited.

## Checks

- `scripts/op1-operator-owner-lock.test.ts` checks the file exists and sorts after `20261217120000`. It does not require this migration to be the newest file. It pins the `select ... for update` clause before `select count(*) into v_others` in both functions. It runs `publicEntityHits` on the new migration and on the test itself.
- Local Postgres applied every migration, including this one. `scripts/owner-gate.test.ts`, `scripts/repo-db-hygiene.test.ts`, and `scripts/definer-audit.test.ts` passed. The operator clear check inside the migration ran as part of that apply.
- No screen changed, so there is no screenshot.

## Apply

Apply only `supabase/migrations/20261219120000_operator_row_owner_lock.sql`. Do not deploy Edge. Do not change live settings. Do not send email.
