# TR-3 reconciliation note (T14)

Date: 30 Sep 2026. Tracking stays dark. `ANALYTICS_ENABLED` and `VITE_ANALYTICS_ENABLED` stay off.

## Weekly check

Compare Supabase registrations with PostHog `email_verified` for the same range.

- Supabase registrations are candidates with `email_verified_at` in range, plus legacy `applications.created_at` on their own line.
- PostHog `email_verified` counts only people who accepted analytics. It should be lower than Supabase by the share who did not accept.
- While the flag is off, PostHog has no live events. The admin page shows Supabase numbers and the not-live line. Do not treat a zero PostHog total as a tracking failure until the go-live gates pass.

Staff, demo members, and test rows (staff email, `is_demo`, a test token in the email, or `@example.com`) are left out of `marketing_funnel_counts`. Counts from 1 to 4 come back as `lt5`. A manual count of 2 accepted legacy applications is the pre-mask total. The RPC returns `lt5` for that bucket. Approved dates use `admitted_at`, then a non-demo member `created_at`, then `decision_at` when status is accepted.

## Code gates

| Gate | Evidence | Status |
| --- | --- | --- |
| Property allowlist drops band, phone, CR, statement, capacity | `scripts/marketing-phase3.test.ts` and `src/lib/tracking/allowlist.ts` | VERIFIED in unit tests |
| Marketing RPC output has none of those columns | `supabase/migrations/20261107120000_marketing_funnel.sql` | VERIFIED by SQL review and the same test |
| marketing-stats response is aggregates only, EU host, no read key in the repo | `supabase/functions/marketing-stats/handle.ts` | VERIFIED in unit tests. Live PostHog match is UNKNOWN until the secret exists |
| Banner, notice, and consent log | Phase 1, already on main | INFERRED from the merged consent migration |
| Pre-consent has no stable id | Phase 1 loader | INFERRED from the merged tracking tests |
| Retention jobs for people | Phase 2 sweep | UNKNOWN here. This migration only adds `purge_marketing_stats_cache` for the 24 hour stats cache |
| Flag still off | `.env.example` and `.github/workflows/pages.yml` | VERIFIED |

No PostHog personal key is stored in git. The Supabase secret name is `POSTHOG_PERSONAL_API_KEY`. `POSTHOG_PROJECT_ID` is the other name the function reads. Neither value is in this note.
