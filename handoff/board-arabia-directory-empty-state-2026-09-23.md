# Directory empty state + profile photo

23 Sep 2026. Implementation note for the member Directory soft-gate. Product copy is the locked brief. This file records the CTA rule and the security check.

## CTA rule

A profile is ready when name, headline, and location are all filled. Photo, company, bio, and LinkedIn do not change the primary button.

| Profile | Invites remaining | Primary | Second control |
| --- | --- | --- | --- |
| Not ready | Greater than 0 | Complete your profile | Invite 2, with "{n} of 2 invites left" |
| Not ready | 0 | Complete your profile | Invite 2 disabled, "No invites left" |
| Ready | Greater than 0 | Invite 2, with "{n} of 2 invites left" | Complete your profile |
| Ready | 0 | Invite 2 disabled, "No invites left" | Complete your profile |

Invite 2 opens `/dashboard/invites`. Complete your profile opens `/dashboard/profile`. Directory stays in the nav.

## Seat count

`{X}` is `platform_stats.founding_admitted_count` only. A missing row, a failed read, or a non-integer shows "Couldn’t refresh the seat count." and Retry. The page does not substitute 0 or any other number.

Ghost cards are four on desktop and three below 1024px. Labels are Sector, City, Role, and a Seat chip "KSA or Intl". The name row is an empty bar. No photos.

Filtered-zero ("No matches. Clear filters.") is not this screen. There is no peer query in this change.

## Profile photo

Bucket `member-avatars` is private. A member may read, insert, update, and delete only `{their user id}/avatar`, and only while their member status is invited or active. `profiles.avatar_path` must equal that same path. The client shows a plain circle until a signed URL loads.

Apply `supabase/migrations/20260923120000_member_avatar_storage.sql` on project `iirqbizwanyhgkhanntq`. The dashboard still loads if that column is missing: the profile read retries without `avatar_path`.

LinkedIn OAuth is not in this change.

## Security: no public PII / no fake names in the Directory empty state

- **VERIFIED** in this repo: ghost cards render only Sector, City, Role, Seat, and "KSA or Intl", plus an empty bar and a circle. No image element. No person names. The seat numeral is parsed from `founding_admitted_count` and a bad value becomes an error, not a fallback count.
- **INFERRED** from the migration, not from a live database check: the bucket is `public = false`; policies are authenticated-only and match `auth.uid()` plus an invited or active member row; anon has no policy; `avatar_path` is added to the existing own-row profile grants.
- **UNKNOWN**: the migration has not been applied to the hosted project from this change, and no signed-in member session was available here to click through production.
