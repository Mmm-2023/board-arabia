# SEC-C handoff: security advisor grants

Base: main `4ab896a` (the 17-policy initplan from #162 is merged). Slot: `supabase/migrations/20261216120000_sec_c_definer_grants.sql`. Checked at start: `20261213120000` was the latest file on main, so `20261216120000` was free. This file was not applied. No `supabase db push`. No Edge deploy. No live auth change.

## What changed

The six RPCs anon must call are no longer security definers in `public`. Each body lives in a private impl with `search_path ''`. The public function is a security invoker wrapper. Anon can still call the same six names. Authenticated still can, because the shared client sends the session on public pages and the dashboard calls four of them while signed in.

`submit_partner_interest` keeps the 20-note daily cap, the same-firm dedupe, and the `{ok:true}` payload. A new per-category cap of 10 in 24 hours raises the same `busy_today` error, with no count and no id.

Every other security definer in `public` and `private` is altered to `search_path ''` when it was not already empty. Public and anon lose execute on the other 113 surface RPCs. Authenticated and service_role keep execute.

No policy is dropped or created. Row level security is not disabled and not unforced. No table grant to anon was added.

## Advisors

### anon_security_definer_function_executable (6 WARN)

Fixed in the repo by making the public functions security invoker:

| Function | Wrapper |
| --- | --- |
| list_partner_categories | `supabase/migrations/20261216120000_sec_c_definer_grants.sql:340` |
| list_trusted_partners | `:353` |
| submit_partner_interest | `:368` |
| list_landing_preview_deals | `:387` |
| landing_platform_totals | `:402` |
| lookup_member_invite | `:415` |

The definers anon executes are the private impls, which are not in the Data API schema:

| Impl | Line |
| --- | --- |
| list_partner_categories_impl | `:25` |
| list_trusted_partners_impl | `:45` |
| submit_partner_interest_impl | `:111` |
| list_landing_preview_deals_impl | `:180` |
| landing_platform_totals_impl | `:224` |
| lookup_member_invite_impl | `:250` |

Sasha should confirm the live advisor after apply. This agent did not apply the file, so the live count is not re-read here.

Returned columns were checked:

- Categories: slug, name, gloss. No email, no user id. `:29`
- Trusted partners: published card fields. `id` is the partner row. `sponsor_user_id` is not returned. No email. `:45`
- Landing preview: mandate id, demo flag, sector, ask, status. No email, no user id. `:180`
- Platform totals: aggregates only. No email, no user id. `:224`
- Invite lookup: `valid`, `state`, `inviter_label` only. The label is the profile display name. The function does not read an email, a member id, a seat, or a tier. `:250`. The apply and register pages show that label next to "Invited by", so it was not replaced with a seat or tier label.
- Partner interest: `{ok:true}` only. Global cap `:157`. Category cap `:164`.

### authenticated_security_definer_function_executable (119 WARN)

Not cleared for the 113 member and staff RPCs. Revoking authenticated execute would break the app. Public and anon are revoked, and authenticated is granted again, in the loop at `supabase/migrations/20261216120000_sec_c_definer_grants.sql:596`. The six wrappers are no longer definers, so they drop off this lint. The rest stay an accepted warning. The closed anon list is in `scripts/sec-c-grants.test.ts` and `scripts/definer-audit.test.ts`.

### function_search_path_mutable

Live count was already 0, because every definer set some search_path. This file pins the empty path at `supabase/migrations/20261216120000_sec_c_definer_grants.sql:616`. Bodies were called under that setting in the local replay. No relation-missing errors.

### security_definer_view

Live count was 0. This file creates no view. The three public views stay `security_invoker`.

### auth_leaked_password_protection

Not this migration. Dashboard only. See `OPS-SEC-C-auth-settings`: turn leaked password protection on. Same item as OPS-E2E-4. Do it once. No email send.

### rls_enabled_no_policy (INFO, 50 live)

No change. These tables are deny-all by design: RLS on, no policy, and the grants stay revoked. A database built from this repo has 47 public tables in that state: admit_li_share, ai_tool_file_purge, apply_rate_limits, blocked_email_domains, consent_log, data_download_requests, demo_thresholds, directory_entries, disposable_email_domains, due_diligence_file_purge, due_diligence_run_windows, intro_quota_settings, invite_lookup_limits, majlis_apply_limits, majlis_region_geotag, majlis_rsvp_limits, mandate_intros, mandates, marketing_stats_cache, member_application_answers, member_intros, membership_rate_limits, partner_categories, partner_interest, re_board_role_intros, re_board_roles, re_club_interest, re_club_rooms, re_opportunities, re_opportunity_intros, re_partner_intros, re_partners, register_rate_limits, retention_posthog_queue, retention_runs, room_document_file_purge, room_document_member_access, sponsor_categories, sponsor_category_seats, sponsor_handovers, sponsor_intro_requests, sponsor_packages, sponsor_seat_packages, sponsor_welcome_dismissals, staff_access_log, staff_display_names, trusted_partners. Live reported 50. The other three names are not in this repo, so they were not identified and were not changed.

## Staff gates

Every `public.staff_*` function in the repo already starts with `if not private.is_staff()` before any insert, update, or delete. None were missing. No staff body was rewritten.

`list_member_rooms` scopes through `private.can_read_member_room()`, which requires `auth.uid()` on an invited or active member, or staff. The other non-staff surface functions use `auth.uid()` or `private.is_staff()`.

## Why authenticated still has the six

`PartnersPage` is a public route, and it is the only caller of `submit_partner_interest`. A signed-in visitor still uses the shared client, which sends the session, so the call runs as authenticated. `lookup_member_invite` is used on `/apply` and `/register`, which a signed-in browser can open. `landing_platform_totals`, `list_landing_preview_deals`, `list_partner_categories`, and `list_trusted_partners` are also called from signed-in dashboard pages. Authenticated execute stays on all six.

## Anon privileges added

No table grant to anon.

New anon privileges, and only these:

- `grant usage on schema private to anon` at `supabase/migrations/20261216120000_sec_c_definer_grants.sql:338`. The invoker wrapper cannot see the impl without it. `20260923120000` had revoked that usage.
- `execute` on the six `private.*_impl` functions.

Public wrapper `execute` for anon is the same six RPCs anon already had. Other private functions that anon could execute are revoked in the loop at `:573`.

## The 17 policies

Untouched. `scripts/sec-c-grants.test.ts` snapshots their names, commands, roles, and expressions before this migration and compares them after, including a second apply. `scripts/rls-initplan.test.ts` no longer requires `20261213120000` to be the last file, because later migrations are expected. The policy text in that test was not edited.

## Apply list for the operator

Do not apply this from the app or from CI.

1. Apply `20261216120000_sec_c_definer_grants.sql` in the SQL editor after `20261213120000_rls_initplan_select_auth_uid.sql`. #162 is already on main.
2. The file is safe to run again.
3. Re-run Security advisors. `anon_security_definer_function_executable` should clear for the six public wrappers. The private impls are outside the Data API schemas.
4. `authenticated_security_definer_function_executable` remains for the member and staff RPCs. That warning is accepted.
5. Turn on leaked password protection in Authentication settings. Do not do it in SQL.
6. Do not add policies for the no-policy tables in this apply.
7. `multiple_permissive_policies` is out of scope.

## Tests

`scripts/sec-c-grants.test.ts` checks that this file exists and sorts after `20261213120000`. It does not require this file to be the newest migration. The Postgres run applies only migrations up through this file, so a later file is ignored. It checks empty search_path on public definers, no anon execute on a public definer, the anon function list, staff gates, security invoker views, unchanged anon table grants, unchanged RLS force flags, the 17 policies, the interest caps, and a second apply.

Also green locally: `scripts/definer-audit.test.ts`, `scripts/rls-initplan.test.ts`, `scripts/migration-hygiene.test.ts`, `scripts/trusted-partners-gallery.test.ts`, `scripts/platform-floors.test.ts`, `scripts/public-names.test.ts`.

## Not done

- No screenshots. This change has no UI.
- Live advisors were not re-queried. The migration was not applied.
- Leaked password protection, email OTP, and MFA stay on the ops note.

## Secrets grade

VERIFIED. The diff adds no mailbox, API key, token, password, service-role key, project ref, or staff name. The Postgres fixture uses example.com only. `.env` is not in the commit.
