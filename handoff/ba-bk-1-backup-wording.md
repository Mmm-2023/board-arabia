# BK-1 backup wording

LEGAL CHANGE. Branch: `cursor/bk-1-backup-wording-a727`. Merged current `origin/main` with a normal merge. No rebase. No force-push. No migration. No Edge change. Do not merge this PR from this handoff.

Approved wording replaces the earlier backup sentence in all four product strings. The day-count placeholder is gone.

The sentence is:

When we delete your records, they are removed from our live systems straight away. Our hosting provider may keep short-term technical copies for a limited period as part of running its service. We do not access or use those copies, and they expire under the provider's own processes.

## Locations

| File | Line | Where | Grade |
| --- | --- | --- | --- |
| `src/content/legal/privacy.en.ts` | 432 | Retention table row for member data | VERIFIED |
| `src/content/legal/privacy.en.ts` | 474 | Clause `c-9-2` | VERIFIED |
| `src/content/privacyNotice.ts` | 86 | Section How long we keep it | VERIFIED |
| `src/content/privacyNotice.ts` | 94 | Section Your rights | VERIFIED |

Line grades are VERIFIED by reading those lines after the merge of `426d4b8`. The privacy notice source escapes the apostrophe in `provider's` so the string value matches the approved sentence.

`scripts/legal-pages.test.ts` requires that sentence twice in the privacy plain text. The extra bracket allowlist entry is removed, and the bracket scan matches main again.

`handoff/ba-pv-1-privacy-tbc/HANDOFF.md` had one note that named the old day-count token. That token is removed from the note. The rest of that handoff is unchanged.

A search for the day-count token across the repo is empty after this handoff is saved.

## Head and checks

Head SHA: filled after this commit is pushed. Grade until then: UNKNOWN.

CI run link: UNKNOWN until the five checks finish on that SHA.

## Secrets

Grade: VERIFIED.

The wording diff adds no mailbox, API key, token, password, service-role key, project ref, or staff allowlist. No migration and no Edge function is in the wording diff.
