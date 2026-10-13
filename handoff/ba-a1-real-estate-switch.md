# A1 handoff: real estate segmented switch

Base at start of this branch: `4ab896a` (main had moved past `af3c4b9` by the RLS initplan and watermark download commits). No overlap with those files. No migration. No Edge. `/apply` is unchanged.

## What changed

The third navigation level on Real estate is no longer a second row of pills. It is one bordered segmented control in the page header, with equal segments. Section tabs under Deals stay the only pill row.

| Item | Where | Test | Grade |
| --- | --- | --- | --- |
| Labels are Opportunities, Firms, Board roles. The partners id is unchanged. | `src/pages/dashboard/RealEstateBoard.tsx:30` | `real estate keeps partners and roles query values and a segmented switch` | VERIFIED |
| One bordered group, three equal columns, 44px targets, no pill radius on the segments. | `src/pages/dashboard/RealEstateBoard.tsx:149` | same test, plus `assertOneRow` in the browser test | VERIFIED |
| Arrow keys still move the selection and move focus. Focus outline is at least 2px. | `src/pages/dashboard/RealEstateBoard.tsx:116` | `each segment sets the real estate view and arrows keep one row at 390` | VERIFIED |
| `?view=partners` and `?view=roles` are unchanged. Absent view is opportunities. `firms` and `board-roles` do not select a segment. | `src/pages/dashboard/RealEstatePage.tsx:52` (not edited) | deep link render test and the browser route test | VERIFIED |
| Clicking Firms sets `?view=partners`. Board roles sets `?view=roles`. Opportunities clears `view`. Path stays `/dashboard/deals/real-estate`. | `src/pages/dashboard/RealEstatePage.tsx:53` | browser route test | VERIFIED |
| Old `/dashboard/real-estate?view=partners` still lands on `/dashboard/deals/real-estate?view=partners` and the firms panel. | `src/shell/redirects.ts:8` (not edited) | browser route test | VERIFIED |
| Deals section tabs and destinations are untouched. | `src/pages/dashboard/DealsLayout.tsx:13`, `src/shell/SectionTabs.tsx`, `src/shell/destinations.ts` | source pins in the switch test | VERIFIED |
| At 390 the segment is one row (box height 46, each target at least 44) and does not clip the labels. Exactly one `[data-section-tabs]` pill row. | browser test `assertOneRow` | same | VERIFIED |
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

Route destinations from the browser test (the real `/dashboard/deals/real-estate` route):

- `re-switch-route-opportunities-1280.png`, `re-switch-route-opportunities-390.png`
- `re-switch-route-partners-1280.png`, `re-switch-route-partners-390.png`
- `re-switch-route-roles-1280.png`, `re-switch-route-roles-390.png`

## Tests run here

`node --experimental-strip-types --test scripts/re-switch.test.ts`: 3 passed, including the Chrome route test.

Also passed: `scripts/re-opportunities-ui.test.ts`, `scripts/re-appetite.test.ts`, `scripts/re-board-roles.test.ts`, `scripts/member-nav-redirects.test.ts`, `scripts/shell-destinations.test.ts`, `scripts/public-names.test.ts`, and the partner wording copy gate. The partner page render passed when the example env file was loaded. The built-asset partner check needs `dist/` from the CI build.

## Not done

No migration. No Edge deploy. No settings change. No mail. Locked files were not opened for edit.

## Apply list

None. Pages deploys on merge. After deploy, open Real estate at 1280 and 390 and compare with the PR shots. Check `?view=partners` and `?view=roles`.

## Secrets grade

VERIFIED. The diff adds no live mailbox, key, token, password, service-role key, project ref, or staff allowlist. Fixture contacts are example.com only. The browser test uses a synthetic unsigned session on example.supabase.co, the same shape as the existing shell route test. No staff names. No new price or package name in copy. Fixture cards reuse an existing ticket band constant so a sample card can render.
