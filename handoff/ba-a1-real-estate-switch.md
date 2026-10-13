# A1 handoff: real estate segmented switch

Base at start of this branch: `4ab896a` (main had moved past `af3c4b9` by the RLS initplan and watermark download commits). No overlap with those files. No migration. No Edge. `/apply` is unchanged.

## What changed

The third navigation level on Real estate is no longer a second row of pills. It is one bordered segmented control in the page header, with equal segments. Section tabs under Deals stay the only pill row.

| Item | Where | Test | Grade |
| --- | --- | --- | --- |
| Labels are Opportunities, Firms, Board roles. The partners id is unchanged. | `src/pages/dashboard/RealEstateBoard.tsx:30` | `real estate keeps partners and roles query values and a segmented switch` | VERIFIED |
| One bordered group, three equal columns, `min-h-11` on each segment, no pill radius. | `src/pages/dashboard/RealEstateBoard.tsx:149` | `deep links open the matching real estate panel` | VERIFIED |
| Each segment's accessible name is Opportunities, Firms, or Board roles, and exactly one has `aria-selected="true"`. | `src/pages/dashboard/RealEstateBoard.tsx:165` | same render test | VERIFIED |
| Arrow keys still call `onTabKey`. | `src/pages/dashboard/RealEstateBoard.tsx:116` | source pin in `real estate keeps partners and roles query values and a segmented switch` | VERIFIED |
| `?view=partners` and `?view=roles` are unchanged. Absent view is opportunities. `firms` and `board-roles` do not select a segment. | `src/pages/dashboard/RealEstatePage.tsx:52` (not edited) | deep link render test | VERIFIED |
| Firms sets `view=partners`. Board roles sets `view=roles`. Opportunities clears `view`. | `src/pages/dashboard/RealEstatePage.tsx:53` (not edited) | source pin in the switch test | VERIFIED |
| Old `/dashboard/real-estate` still maps to `/dashboard/deals/real-estate`. | `src/shell/redirects.ts:8` (not edited) | source pin in the switch test | VERIFIED |
| Deals section tabs and destinations are untouched. | `src/pages/dashboard/DealsLayout.tsx:13`, `src/shell/SectionTabs.tsx`, `src/shell/destinations.ts` | source pins in the switch test | VERIFIED |
| At 390 the segment is one row. Shots are 1440 and 390 of each segment on `/dashboard/deals/real-estate`. The 390 shots are taken after an arrow key move, so the focus ring is on the selected segment. | shots in the PR | VERIFIED by local capture |
| Filter chips are the same component as before. | `src/pages/dashboard/RealEstateBoard.tsx` `Chip` | opportunity markup test still matches the filter labels | VERIFIED |

## Shots

Fixture accounts only. example.com contacts. No live data.

Before, current pills, `scripts/capture-re-switch.mjs before`:

- `re-switch-before-opportunities-1280.png`, `re-switch-before-opportunities-390.png` (390 wraps, box height 96)
- `re-switch-before-partners-1280.png`, `re-switch-before-partners-390.png`
- `re-switch-before-roles-1280.png`, `re-switch-before-roles-390.png`

After, same harness:

- `re-switch-after-opportunities-1280.png`, `re-switch-after-opportunities-390.png` (one line, box height 46)
- `re-switch-after-partners-1280.png`, `re-switch-after-partners-390.png`
- `re-switch-after-roles-1280.png`, `re-switch-after-roles-390.png`

Route shots of `/dashboard/deals/real-estate` at 1440 and 390. The 390 set is after an arrow key move, and the segment box height is 46:

- `re-segment-opportunities-1440.png`, `re-segment-opportunities-390.png`
- `re-segment-partners-1440.png`, `re-segment-partners-390.png`
- `re-segment-roles-1440.png`, `re-segment-roles-390.png`

## Tests run here

`node --experimental-strip-types --test scripts/re-switch.test.ts`: the source pin and the deep link render test. The browser check was removed. The render test checks each segment name, `aria-selected`, and `min-h-11`.

Also passed: `scripts/re-opportunities-ui.test.ts`, `scripts/re-appetite.test.ts`, `scripts/re-board-roles.test.ts`, `scripts/member-nav-redirects.test.ts`, `scripts/shell-destinations.test.ts`, `scripts/public-names.test.ts`, and the partner wording copy gate. The partner page render passed when the example env file was loaded. The built-asset partner check needs `dist/` from the CI build.

## Not done

No migration. No Edge deploy. No settings change. No mail. Locked files were not opened for edit.

## Apply list

None. Pages deploys on merge. After deploy, open Real estate at 1280 and 390 and compare with the PR shots. Check `?view=partners` and `?view=roles`.

## Secrets grade

VERIFIED. The diff adds no live mailbox, key, token, password, service-role key, project ref, or staff allowlist. Fixture contacts are example.com only. The browser test uses a synthetic unsigned session on example.supabase.co, the same shape as the existing shell route test. No staff names. No new price or package name in copy. Fixture cards reuse an existing ticket band constant so a sample card can render.
