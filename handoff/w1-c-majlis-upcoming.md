# W1-C majlis-upcoming

Member Majlis page only. The test majlis row is still in the database.

## What members see

- Upcoming gatherings are first, soonest start first. A gathering stays on the list until it ends.
- Past gatherings are hidden.
- A rehearsal title is hidden when it is made only of the words test, tests, the, a, and majlis. "test majlis" and "the test majlis" drop off the feed. "Governance test session" stays. Nothing is deleted.
- The blurred map and the coming-soon block are gone. Region and focus filters remain.
- Host a majlis opens the existing three-step application. That flow already posts to `majlis-apply` and stays pending until staff accept it. No new host flow was built. Sponsors do not see the button.

Staff still see every row, including the test majlis, on the admin Majlis page. The admin map placeholder was left as it is.

## Migration

None.

## Edge functions

None to redeploy. The new helpers live in the shared majlis module and are not called by an Edge function.

## Secrets

VERIFIED. The diff has no mailboxes, keys, tokens, or booking links. No new secret names.

## Tests

- `npx tsc -b` passed.
- `node --experimental-strip-types --test scripts/*.test.ts`: 342 passed, 1 skipped, 0 failed.

Browser check on a member preview, desktop 1280 and phone 390: upcoming order, Makkah filter then clear, host button opens step 1 and an empty Continue asks for a title, past and test rows absent, no horizontal overflow, host button at least 44px.

## Screenshots

- `handoff/w1-c-majlis-upcoming/majlis-upcoming-1280.png`
- `handoff/w1-c-majlis-upcoming/majlis-upcoming-390.png`
- `handoff/w1-c-majlis-upcoming/majlis-host-1280.png`
- `handoff/w1-c-majlis-upcoming/majlis-host-390.png`
- `handoff/w1-c-majlis-upcoming/majlis-empty-1280.png`
- `handoff/w1-c-majlis-upcoming/majlis-empty-390.png`

Same files are in `/opt/cursor/artifacts/`.

## Left undone

- No database flag for test events. Hiding is by title shape.
- Admin map placeholder unchanged.
