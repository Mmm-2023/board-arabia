# BA P1b: majlis LinkedIn self posts

Member majlis: share a LinkedIn draft.

Skills applied: `board-arabia-ux-ui` and `dashboard-ux-desktop-and-mobile`.

The cards are small controls on the existing member majlis page (`/dashboard/majlis` and `/dashboard/majlis/past`). No new screen. No redesign of that page.

## DRAFT post text

Status: DRAFT. Waiting for the owner to approve the wording before `MAJLIS_SHARE_CARDS_ENABLED` is turned on.

The member posts it. Nothing in this PR posts, sends, or schedules.

Attending, fixture title "Capital evening", 20 Nov 2026, 150 characters:

```
I'm attending Capital evening on 20 Nov 2026, hosted by Board Arabia.
https://boardarabia.com/majlis/00000000-0000-4000-8000-0000000000a1
#BoardArabia
```

Attended, same fixture after the end, 1 Oct 2026, 144 characters:

```
I joined Capital evening on 1 Oct 2026, hosted by Board Arabia.
https://boardarabia.com/majlis/00000000-0000-4000-8000-0000000000a1
#BoardArabia
```

The fixture id is not a live event. VERIFIED by `scripts/majlis-share.test.ts`.

Wording rules in the builder (`src/lib/majlisShare.ts`):

- Lead lines are `I'm attending` and `I joined`. The attended line is the member's own words. The product does not record attendance.
- Host line is always `hosted by Board Arabia`. Member names are not copied into the post.
- One hashtag, `#BoardArabia`. The cap is two.
- Title, date, host line, and the public URL stay at or under 300 characters. A long title is cut and ends with `...`.
- The public URL is included only for a published virtual majlis. An in person event gets the card without that URL.
- Emails, phone numbers, Meet links, the venue address, prices, and partner wording that user copy must not use are stripped from the title if they appear there. Those fields are never copied on their own.

## Flag

`MAJLIS_SHARE_CARDS_ENABLED = false` at `src/lib/majlisShare.ts:8`.

Production `<MajlisPage />` does not pass a preview, so the constant stays in force. VERIFIED: `src/App.tsx` still mounts `<MajlisPage />` with no props. A preview prop `shareCards` exists only so tests and the smoke page can render the card. It is not read from the URL.

## What the member sees when the flag is on

Active RSVP means `my_rsvp_status === 'registered'` on a published event that is not cancelled.

- Before the end: heading "Share that you are attending".
- After the end, RSVP still registered: heading "Share that you attended", plus "Saying you joined is your choice. We do not record who attended."
- Waitlist, cancelled, maybe, declined, and no RSVP: no card.
- Buttons: "Open LinkedIn" (new tab, `rel="noopener noreferrer"`), "Copy post text", "Dismiss".
- If LinkedIn opens empty, the card says to paste the post text. Copy writes the same text the composer URL carries.
- Dismiss hides that event only, in local state. No new table.

## States

| State | What the member sees | Shot |
| --- | --- | --- |
| Populated, before the end | Share card on the upcoming event | `attending-390.png`, `attending-1440.png` |
| Populated, after the end | Share card on the past event | `attended-390.png`, `attended-1440.png` |
| Copied | "Post text copied." | `copied-390.png`, `copied-1440.png` |
| Dismissed | That event loses the card. A second registered event keeps its card. | `dismissed-390.png`, `dismissed-1440.png` |
| Hidden, flag off | Registered event, no card. This is production. | `hidden-390.png`, `hidden-1440.png` |
| Hidden, waitlist | Flag forced on in the smoke page. No card. | `waitlist-390.png`, `waitlist-1440.png` |
| Empty | Existing line "No upcoming majlis." | `empty-390.png`, `empty-1440.png` |
| Loading | Existing majlis skeleton | `loading-390.png`, `loading-1440.png` |
| Error, copy | "Could not copy the post text. Select the post above and copy it yourself." The post stays on screen. | `error-390.png`, `error-1440.png` |
| Error, page | Existing "Couldn't refresh" banner and Retry | `page-error-390.png`, `page-error-1440.png` |

Phone layout at 390px stacks the three buttons to full width. Desktop at 1440px keeps them in one row. VERIFIED by the shots and by the Playwright box check (height and width at least 44px, body text at least 15px) in `scripts/majlis-share.test.ts`.

Same destinations on desktop and phone: Home, Deals, People, Majlis, AI tools. This PR does not change them. VERIFIED by the existing shell. The shots hide the fixed header and tab bar so the feed is readable. The shell itself is unchanged.

Safe area: the card sits in the page flow. The shell already applies `env(safe-area-inset-*)` on the header and tab bar (`src/index.css`). No new fixed bar. INFERRED from that existing CSS. Not retested on a physical phone. UNKNOWN on a notched device.

## Public page

VERIFIED from `public.list_public_majlis` in `supabase/migrations/20270104120000_public_majlis_request.sql`: the public list is published virtual majlis that have not ended, after member RSVP is open and the founding window has passed. The route `/majlis/:eventId` already exists. It does not show a Meet link, names, emails, or a venue address.

The post links to `https://boardarabia.com/majlis/{id}` only when the event is published, virtual, and not cancelled. After the event ends, that route shows the closed state ("This majlis is not open for requests") rather than the event fields. The link still points at that existing public route. In person events omit the URL.

## Claims

| Claim | Grade |
| --- | --- |
| The member posts. There is no LinkedIn API, OAuth, token, cron, or send. | VERIFIED. `src/lib/majlisShare.ts` and the card have no `fetch`. The unit test stubs `fetch` and records no call. No new workflow file. |
| Composer URL is `https://www.linkedin.com/feed/?shareActive=true&text=...` and passes `isLinkedInShareUrl`. | VERIFIED. `majlisShareUrl` calls `linkedInShareUrl` in `supabase/functions/_shared/linkedin_share_url.ts`. |
| The admit share tests stay green and the builder is not a second copy. | VERIFIED. `admit_li_share.ts` exports the same two functions from the shared helper. `scripts/admit-li-share.test.ts` passed locally. |
| Cards stay off in production. | VERIFIED. Constant is `false`. App route does not pass preview. |
| No Meet, Join link, email, phone, venue, or other member in the post. | VERIFIED. Fixture carries those strings. Output tests reject them. |
| No migration. | VERIFIED. No file under `supabase/migrations` in this diff. Main already has `20270110120000` from the merged reminder PR. Open PR 209 still holds `20270109120000`. The next free slot would be `20270111120000`. This PR does not take it. |
| No Edge deploy required. | VERIFIED for this feature: no new function and no behavior change. The composer helper moved. These functions import `admit_li_share.ts` and would pick up the move on a later deploy, with the same URL: `admit-member`, `review-membership`, `admit-li-share-card`, `admit-li-share-go`, `admit-li-share-dry-run`, `remind-admit-li-share`. A redeploy is not required for this PR. |
| Public routes and the prerender allowlist are unchanged. | VERIFIED. `src/App.tsx` routes and `scripts/prerender.mjs` are not in this diff. |
| Secrets grade | VERIFIED. Diff, fixtures, and shots use `example.com` and fixture ids only. No mailbox, token, phone of a real person, or staff name. |
| LinkedIn composer URL keeps working. | UNKNOWN. The card also offers copy, and tells the member to paste if LinkedIn opens empty. |
| Which events the owner wants a card on. | UNKNOWN. v1 shows a card for every active RSVP. The public URL is only on published virtual events. |
| Whether "I joined" should wait for attendance capture. | UNKNOWN. v1 is self asserted. |
| Click tracking. | UNKNOWN as a product choice. v1 does not track. No tokenised redirect. |

## Apply list

None. No migration. No Edge deploy. No cron. Nothing sends.

## Open questions for the owner

1. Approve the DRAFT post text above, and when to flip `MAJLIS_SHARE_CARDS_ENABLED`.
2. "I joined" is self asserted because attendance is not captured yet. Approve that, or wait.
3. Cards show for every active RSVP. The public URL is added only for a published virtual event, because that is the public page that exists today. In person events get the card with no link. Confirm or narrow that.
4. A branded image is a separate row. It needs a static page and a prerender change. Not in this PR.
5. No click tracking in v1. Confirm that should stay.

## Files

- `src/lib/majlisShare.ts`
- `src/pages/dashboard/MajlisShareCard.tsx`
- `src/pages/dashboard/MajlisPage.tsx` (card mounted on the existing event cards)
- `supabase/functions/_shared/linkedin_share_url.ts`
- `supabase/functions/_shared/admit_li_share.ts` (exports the shared helper)
- `scripts/majlis-share.test.ts`
- `scripts/smoke/majlis-share.html`
- `scripts/smoke/majlis-share-main.tsx`
