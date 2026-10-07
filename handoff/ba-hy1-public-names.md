# BA HY-1 public names

Base: `5b35c45aa965d4369e68593bc47eca20e24c317b` (Rename user-facing sponsor copy to partner, #152). VERIFIED: this branch started from that commit after `git fetch origin main`.

## What changed

- Staff and agent first names are gone from every `handoff/*.md`, from `README.md`, and from line 1 of `.github/workflows/retention-sweep.yml` and `.github/workflows/suggest-intros.yml`. The replacement words are the operator, admin, the owner, Apply list, and server routines. VERIFIED by reading those files and by `scripts/public-names.test.ts`.
- The locked public credit in `src/components/WhoRunsTheDesk.tsx` is unchanged, and the tests that assert it are unchanged. VERIFIED by an empty diff for that component and for those tests.
- The copy string in `scripts/gmail-mail.test.ts` is unchanged. VERIFIED by an empty diff.
- Fixtures named Example are unchanged. VERIFIED by an empty diff for `scripts/review-quickwins.test.ts`.
- `scripts/public-nammco.mjs` is byte-identical, including its comment. VERIFIED by an empty diff.
- `scripts/prerender.mjs` and `scripts/check-pages-artifact.mjs` are unchanged. VERIFIED by an empty diff.
- No file under `supabase/migrations/` is edited. VERIFIED by an empty diff.
- The assertion target at `scripts/profile-avatar-linkedin.test.ts:83` is unchanged. It still matches the comment in `supabase/migrations/20260929203000_member_avatar_peer_read.sql`. VERIFIED by an empty diff. Editing that assertion would require editing the migration, which this PR does not do.
- `src/content/legal/terms.en.ts` and `src/content/legal/privacy.en.ts` were not edited. On this base they already contain no nammco spelling and no registration line `CR 7043252647`. VERIFIED by the new source guard, which passes without a legal edit.

## Known migration comments left on purpose

These applied migrations carry a first name in comments. Live migration history is the record. The files stay byte-matched. Left on purpose. VERIFIED by reading the comment lines and by an empty diff.

- `supabase/migrations/20261121120000_weekly_peer_invite_refill.sql`
- `supabase/migrations/20261122120000_re_appetite.sql`
- `supabase/migrations/20261128120000_retention_privacy_audit.sql`

Other migration files that also mention a first name, or a mailbox, in comments or SQL are likewise unchanged. VERIFIED by an empty diff for `supabase/migrations/`.

## Legal source guard

The entity line and the registration number are not written into the legal page sources. `src/content/legal/resolve.ts` fills `[BA ENTITY]` and `[CR]` from `publishedLegalIdentity()` in `src/config/legalPageIdentity.ts`. VERIFIED by reading `resolve.ts` and `legalPageIdentity.ts`, and by the new test.

A source line that contains a nammco spelling, or the registration line, fails the helper. A placeholder line passes. VERIFIED by the fixture in `scripts/public-names.test.ts`.

## Names left outside this scrub

These hits remain and are not in the scrubbed files. Left on purpose.

- Product mail in `supabase/functions/_shared/transactional_copy.ts` still uses a first name. Changing it would change the letter a person receives. The kept copy string in `scripts/gmail-mail.test.ts` is the same voice. VERIFIED by reading both files and by an empty diff.
- `src/content/legal/terms.en.ts` uses the ordinary English words for honest dealing in the dispute sentence. That is not a person. The legal file was not edited. VERIFIED by the source guard passing and by an empty diff.
- `src/lib/avatarStyle.ts` has a code comment that attributes a mapping. That file is outside the public scrub set. VERIFIED by an empty diff.
- `scripts/public-nammco.mjs` line 1 names who allowed the public credit. The gate file stays byte-identical on purpose. VERIFIED by an empty diff.
- Tests that assert the locked public credit, the Example fixtures, and the migration comment at `scripts/profile-avatar-linkedin.test.ts:83` still contain those strings. VERIFIED by an empty diff.

## Apply list

Apply list: none, merge only.

No migration. No Edge function change. No product behaviour change. VERIFIED by the diff file list: docs, two workflow comments, this handoff, and `scripts/public-names.test.ts` only.

## Secrets grade

Secrets hygiene: VERIFIED. This diff adds no live mailbox, key, token, password, service-role key, user id, booking link, or real member data. It adds no email address. example.com is not newly introduced. This handoff names no staff.
