# BA Q29 W1 handoff: demo seed, mandate redaction, Trusted Partners

- Date: 29 Sep 2026
- Branch: `cursor/ba-demo-seed`
- Base: `main` at `6447c363cbd88ac09784aff2ba6ef9e90218c863`
- PR: https://github.com/Mmm-2023/board-arabia/pull/38
- Agent does not merge. The owner merges.

## What shipped

- Durable demo rows with `is_demo` (default false on `members`, true on the seeded content).
- Directory: 8 fictional people, illustrated portraits, `@boardarabia.test` only, `include_in_public_aggregates = false`. They are content rows, not Auth users, so they cannot sign in and do not take founding or sponsor seats.
- Mandates: 6 fictional briefs. Clear fields always. Sensitive fields only after that member requests an intro and staff approves it.
- Rooms: 4 fictional rooms tied to demo directory rows.
- Landing Trusted Partners: 3 fictional monogram cards. Hero was not edited.
- One server config table: `public.demo_thresholds`. Demos are returned while the real count is below the threshold. At the threshold, real rows only.

## Proposed thresholds (the owner confirms)

| Surface | Real count that hides demos | What counts as real |
| --- | --- | --- |
| Directory | 12 | Founding members, status invited or active, `is_demo = false`. Sponsors excluded. |
| Mandates | 6 | Published mandates with `is_demo = false` |
| Rooms | 4 | Open rooms with `is_demo = false` |
| Trusted Partners | 3 | Published partners with `is_demo = false` |

## Migration and Edge

- Migration file: `supabase/migrations/20260929120000_demo_seed_thresholds_redaction.sql`
- Edge functions to redeploy: none
- Who applies it on live Supabase: the owner, or the operator of the live project. Not this agent. The migration was not applied here and no Edge deploy was run.

## Redaction proof

- `public.mandates` and `public.mandate_intros` have RLS forced and no grants to `anon` or `authenticated`.
- Locked JSON is built only by `private.mandate_locked_json`, which has no sensitive columns.
- The client allowlist drops sensitive keys unless `unlocked` is true and `intro_status` is `approved`.
- Tests: `scripts/mandate-redaction.test.ts` and `scripts/mandate-dom.test.ts` (rendered markup has no company, amount, contact, or deck).
- Threshold tests: `scripts/demo-threshold.test.ts`.

## Unlock

Member taps Request intro. That inserts `mandate_intros.status = pending` for that member only. Staff home shows pending intros. Approve intro writes `approved` for that pair. Decline keeps the brief locked. No auto-unblur.

## Empty states

If the server returns no rows (demos hidden and no real rows, or the migration is not applied yet), Directory keeps the founding empty state, Mandates keeps "No mandates yet...", Rooms keeps "No room is open", and Trusted Partners says no partners are listed yet.

## Secrets scan

VERIFIED on the branch diff and new files: no em dashes, no API keys or JWTs, no booking links, no staff allowlists. The only email addresses are fictional `@boardarabia.test`. `service_role` appears only as the existing Postgres grant target, not as a key.

## UX checklists

- Board Arabia UX UI: member job is to see who and what is inside without leaking a brief. Marketing job for Trusted Partners is to show the finance rails. Same primary destinations. Example label on sample cards. No fake seat count (demos are excluded from founding totals). No public booking link.
- Dashboard UX desktop and mobile: sidebar and bottom tabs unchanged (Home, Directory, Mandates, Network, Profile). Rooms stays under More. Loading skeletons, error plus retry, and the empty states above. Cards on a 390px width. Safe area and tab clearance stay on the existing shell. Mobile inner scroll keeps the Request intro button above the tab bar.
