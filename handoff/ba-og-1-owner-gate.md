# OG-1 handoff: owner gate for staff

Base is current main, including `20261213120000_rls_initplan_select_auth_uid.sql`. The reserved slot `20261217120000` was free. This file was not applied. No Edge deploy. No live setting change. No merge.

Secrets grade: VERIFIED. The diff has no API keys, service-role keys, tokens, passwords, staff names, mailbox names, or project refs. Addresses in tests and the smoke fixture use example.com only.

## What an owner can do

| Item | Where | Grade |
| --- | --- | --- |
| Only an owner (stored role master, session aal2) can change or remove staff | `private.is_owner()` at `supabase/migrations/20261217120000_owner_staff_gate.sql:8`. RPCs `public.staff_set_role` at `:79` and `public.staff_remove` at `:156` | VERIFIED |
| New staff join as Admin unless the owner picks Owner | People `src/pages/admin/PeoplePage.tsx:191`. Default option is Admin. Role value stays `staff` or `master` | VERIFIED |
| Invite member is separate and does not write a staff row | `src/pages/admin/PeoplePage.tsx:153`. `planInvite` at `supabase/functions/invite-master/handle.ts:67` | VERIFIED |
| Add staff is owner only and does not admit a member | `src/pages/admin/PeoplePage.tsx:191`. An admin render has neither form | VERIFIED |
| Settings lists staff by name, with role Owner or Admin | `src/pages/admin/StaffRosterPanel.tsx:51`, mounted at `src/pages/admin/SettingsPage.tsx:42` | VERIFIED |
| Last owner cannot be demoted or removed. The pinned root owner stays even when another owner exists | migration `:117` and `:123` for role, `:184` and `:191` for remove. UI lock in `src/pages/admin/StaffRosterPanel.tsx:74` | VERIFIED |
| Changes are logged. Clients cannot read the log. Members are not changed | `public.staff_role_log` at migration `:54` | VERIFIED |
| Home count includes every staff row, owners included | `src/pages/admin/AdminHome.tsx:98` and `:253` | VERIFIED |

No hard-coded person button remains. A scan of `src` for an invite or promote control that names a person is empty.

## Data

- `private.is_owner()` is security definer, `search_path ''`, master role, and aal2. Anon cannot execute it.
- `staff_set_role(p_user, p_role)` and `staff_remove(p_user)` check `private.is_staff()` and then `private.is_owner()`. Both are security definer with `search_path ''`. Anon is revoked. Authenticated can execute.
- Direct writes to `staff_users` from an authenticated session stay blocked. The owner RPCs set a transaction-local flag only after the owner check. The table grants stay revoked.
- `list_staff_directory()` now also returns `user_id` and `display_name`. Email is still returned for the existing People list. Settings shows the display name.
- The access log label maps stored Master to Owner in `src/pages/admin/accessLogLabels.ts`. The stored actor role in SQL is unchanged.

## Checks

- `scripts/owner-gate.test.ts` applies every migration on local Postgres. An admin cannot promote or remove. A member cannot. An aal1 owner cannot. Anon cannot execute. An owner can promote and demote when another owner remains. The last owner cannot be demoted or removed. The pinned owner cannot be demoted or removed. A removed admin leaves the member row unchanged. The role log records the successful changes and authenticated cannot read it.
- `scripts/admin-gate.test.ts` covers the split forms and the member invite plan.
- `scripts/security-view-access.test.ts` includes `staff_set_role` and `staff_remove` in the staff function list.
- `scripts/definer-audit.test.ts`, `scripts/repo-db-hygiene.test.ts`, and `scripts/staff-display-name.test.ts` passed with this migration in the chain.
- `npx tsc -b` passed.

Screenshots are of the admin preview with example staff, not a live signed-in session. The remove dialog was opened and cancelled. Confirm was not sent to a database from the browser.
