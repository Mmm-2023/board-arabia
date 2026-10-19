# MJ-3a Free account tier

Base: main. Branch: `cursor/mj-3a-free-account-b9d4`.
Migration: `supabase/migrations/20270103120000_free_account_majlis.sql`.
Not applied. No Edge deploy. No merge. No schedule. No send.

This PR does not edit the virtual majlis files. The Join lookup reads `google_meet_url` only when that column is already present, so it can be applied after `20270102120000`.

## What a free account is

A free account is an existing candidate row (`request_state` open). There is no new tier and no insert into `members` or `profiles`.

Surface: free account Majlis. Job: see your own requests, and join when one is accepted.

Destinations stay Home, Deals, People, Majlis, AI tools, in that order, on the sidebar and the phone tabs. Majlis is no longer a locked hub because that page is now your own requests. Deals, People, and AI tools stay locked. The member gathering list on the same page stays locked.

## Five checks

1. Directory. `list_directory` still requires `private.can_read_member_room()`. The card helper now also requires a live member row, or staff.
2. Deals. `list_my_deal_rooms` still requires `private.can_read_member_room()`. `search_deal_room_directory` still requires `private.active_member`.
3. Member majlis list. `private.majlis_events_member_rows` still requires a member row. A free account uses `my_majlis_applications` and does not read that view.
4. Digest. `my_weekly_digest` still requires an invited or active member. The free account page does not call it. Newsletter recipients stay on `public.members`.
5. Partner showcase. The partner showcase RPC still requires an invited or active member. It is not on the free account allowlist.

Reviewed callers of `private.caller_sees_member_card`: partner directory opt-in, sectors and city, weekly digest, digest review tiers, digest sections, and board seat counts. A new caller fails `scripts/free-account.test.ts` until it is added to that list.

## Email code before review

A request is stored as `received` until `candidates.email_verified_at` is set by the Board Arabia code. It becomes `pending` only then. `review_majlis_application` raises `email_unverified` until that column is set. `auth.users.email_confirmed_at` is not read.

Signup and resend return `{ ok: true, error_code: '' }` for a new address and for an address that already has an account. An existing account is emailed a sign-in link. The HTTP body does not say which one happened.

Turnstile runs only when `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY` are set. Otherwise the honeypot and the existing rate limit remain.

## Retention and deletion

LEGAL CHANGE. A free account with a majlis request is not deleted at 120 days. It is deleted 12 months after the last accepted majlis, or 12 months after rejection when none was accepted. A request still in review is kept.

`prepare_candidate_delete` deletes majlis applications and clears `seat_held`. The same release runs when a member row is anonymised.

## LEGAL CHANGE

Legal clears these before merge:

- Terms clause 3.6 in `src/content/legal/terms.en.ts`
- Privacy section 9 paragraph and the retention row in `src/content/legal/privacy.en.ts`
- The consent sentence on the consideration form in `src/pages/apply/RegisterScreen.tsx`
- The 12 month rule in the migration and in `classifyCandidate`

## Secrets

Grade: VERIFIED.

The diff was scanned for private keys, service-role keys, and mailbox literals. New fixtures use `example.com` only. No address, token, or project ref was added.

## Env names

- `TURNSTILE_SECRET_KEY` optional. When unset, signup does not call Turnstile.
- `VITE_TURNSTILE_SITE_KEY` optional. When unset, the widget is not shown.
- `CANDIDATE_CODE_PEPPER` still required for the email code.
- Live smoke only, not stored in the repo: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Edge

Redeploy `register-candidate` and `verify-candidate` after merge. They bundle the shared signup module. Do not deploy from this PR. No new function. `delete-candidate-account` is unchanged. The delete behavior is the SQL function.

## Shots

- `handoff/ba-mj-3a-free-account/free-majlis-1440.png`
- `handoff/ba-mj-3a-free-account/free-majlis-390.png`
- `handoff/ba-mj-3a-free-account/free-majlis-empty-1440.png`
- `handoff/ba-mj-3a-free-account/free-majlis-empty-390.png`

## Smoke

In-process, no send:

`node --experimental-strip-types scripts/smoke/free-account-signup.ts`

Live, operator only:

`node --experimental-strip-types scripts/smoke/free-account-signup.ts --live`
