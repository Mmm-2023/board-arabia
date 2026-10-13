# E2E-3 handoff: RLS initplan for 17 auth uid policies

Re-scoped by Code PM. The original brief named `trusted_partners` and `member_intro_desk_audits`. Live has nothing to rewrite on those tables. This PR wraps the 17 `auth_rls_initplan` policies only.

Base: main `af3c4b9` (FW4 weekly digest, PR #158, is merged). Slot: `supabase/migrations/20261213120000_rls_initplan_select_auth_uid.sql`. `20261212120000` stays with the weekly digest. This file was not applied. No `supabase db push`. No Edge deploy.

## What changed

Each of the 17 policies is dropped and recreated with the same name, command, role, and boolean logic. Every `auth.uid()` in those expressions is now `(select auth.uid())`. No grant, revoke, function, or RLS enable/force change is in the file.

`public.trusted_partners` is untouched. It has no policies. RLS is already enabled and forced in `supabase/migrations/20260929120000_demo_seed_thresholds_redaction.sql:657-659`. Reads go through `list_trusted_partners()`.

`public.member_intro_desk_audits` is untouched. Its only policy is `member_intro_desk_audits_select_staff` at `supabase/migrations/20261116120000_intros_a_contact_desk_limit.sql:87-90`, which calls `private.is_staff()` and does not call auth uid.

`majlis_events_insert_own_pending` is copied from the latest create, `supabase/migrations/20261202120000_majlis_rsvp_calendar.sql:64-81`, including `created_by_staff is null`. The earlier text in `20260926103000_majlis_rsvp.sql` does not have that predicate. Using it would widen inserts.

`staff_users_select_own` is not in an earlier migration. Code PM recorded the live qual as `(user_id = auth.uid())`. This file adopts it as `for select to authenticated` so the repo owns the live policy. Command and role are inferred from the other select-own policies and from the authenticated select grant. The qual text is the one in the brief.

## The 17 policies

| Policy | Table | Command | Role | New text |
| --- | --- | --- | --- | --- |
| members_select_own | members | select | authenticated | `supabase/migrations/20261213120000_rls_initplan_select_auth_uid.sql:21` |
| members_clear_password_flag | members | update | authenticated | `:26` |
| profiles_select_own | profiles | select | authenticated | `:32` |
| profiles_update_own | profiles | update | authenticated | `:37` |
| member_invites_select_own | member_invites | select | authenticated | `:55` |
| candidates_select_own | candidates | select | authenticated | `:60` |
| candidates_update_own | candidates | update | authenticated | `:65` |
| candidate_events_select | candidate_events | select | authenticated | `:71` |
| candidate_notes_staff | candidate_notes | all | authenticated | `:76` |
| intro_suggestions_select_own | intro_suggestions | select | authenticated | `:82` |
| intro_meet_outcomes_select_own | intro_meet_outcomes | select | authenticated | `:88` |
| re_appetite_select | re_appetite | select | authenticated | `:94` |
| re_appetite_insert | re_appetite | insert | authenticated | `:101` |
| re_appetite_update | re_appetite | update | authenticated | `:117` |
| majlis_events_insert_own_pending | majlis_events | insert | authenticated | `:134` |
| majlis_rsvps_select_own | majlis_rsvps | select | authenticated | `:154` |
| staff_users_select_own | staff_users | select | authenticated | `:159` |

## Tests

`scripts/rls-initplan.test.ts` parses the new file. Every `auth.uid()` is inside `(select auth.uid())`. The set of table, policy, command, and role is the 17 above. Normalised using and with-check text matches the source migration after the substitution. The majlis expression is checked against `20261202120000`, and it does not match the older `20260926103000` text.

The Postgres test installs those source expressions, seeds two members (one KSA, one sponsor seat), one staff user, one open candidate, and a closed candidate row. It runs select, update, and insert as each actor, applies the migration, and runs the same probes again. Row sets and denial codes match, including a second apply. Companion staff policies that this migration does not own stay in place. RLS stays forced. Anon has no table grant.

Also green locally: `scripts/migration-hygiene.test.ts`, `scripts/definer-audit.test.ts` (full migration chain, anon allowlist unchanged), `scripts/repo-db-hygiene.test.ts`.

## Apply list for the operator

Do not apply this from the app or from CI.

1. Before apply, save `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;`.
2. Apply `20261213120000_rls_initplan_select_auth_uid.sql` in the SQL editor, after `20261212120000_weekly_digest.sql`.
3. Re-run Advisors, Performance. `auth_rls_initplan` should be 0 for these 17 policies.
4. `multiple_permissive_policies` is out of scope. Do not merge those in this apply.

On a database built only from this repo, `staff_users_select_own` is new. On live it already exists, and this apply only wraps the call. Confirm the saved qual is `user_id = auth.uid()` for select to authenticated before applying. If the live command or role differs, stop and do not apply.

## Not done

- No screenshots. This change has no UI.
- Permissive-policy merges stay in a later PR.
- No Edge function, no mail, no pricing copy.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff name. The Postgres fixture uses example.com only. `.env` is not in the commit.

The staff policy command and role are INFERRED, as noted above. That is not a secret.
