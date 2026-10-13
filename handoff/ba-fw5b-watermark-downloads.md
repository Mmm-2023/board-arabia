# Watermarked deal room downloads

One PR. Member downloads use the same stamp as views. The stored original is not signed and is not returned.

## Secrets grade

VERIFIED. This diff adds no live mailbox, API key, token, password, service-role key, user id, or staff name. Tests use example.com only. `.env` is not in the commit.

## What landed

`deal-room-documents` download now builds the watermarked PDF with `stampDocument` in `supabase/functions/_shared/deal_room_pdf_stamp.ts`. View and download both go through `loadStamped` (`supabase/functions/_shared/deal_room_documents_http.ts:218`). The Edge entry still passes that helper as `deps.stamp` (`supabase/functions/deal-room-documents/index.ts:19`). The stamp line is the caller's own name and email, the Asia/Riyadh time, and the first 8 characters of the room id. The client cannot send a name or email to put on the file.

The response is the stamped PDF as base64 (`deal_room_documents_http.ts:209`). There is no `url` field. The browser saves that PDF locally (`src/pages/dashboard/DealRoomPage.tsx:390`). It does not open a storage URL.

The watermarked copy is generated on request and is not written to the bucket. There is no per-viewer object, so there is nothing for a retention sweep to delete and no schedule was added. Its lifetime is the HTTP response. `DEAL_ROOM_SIGNED_URL_SECONDS` stays 60 (`supabase/functions/_shared/deal_room_documents.ts:8`) and is not used to sign a member download. `createSignedUrl` is gone from `supabase/functions/deal-room-documents/index.ts`. The storage `sign` adapter returns no URL (`index.ts:35`).

Panel copy now says "Views and downloads are watermarked and logged." When download is on, the viewer says "The saved copy carries the same watermark." (`src/pages/dashboard/DealRoomDocuments.tsx:81` and `:157`).

## Types

Downloads use the stamped PDF that a view already builds.

| Mime | Download |
| --- | --- |
| `application/pdf` | Stamped PDF, same stamp as a view |
| `image/png` | Wrapped into that stamped PDF, then downloaded |
| `image/jpeg` | Wrapped into that stamped PDF, then downloaded |
| Any other type, including `image/gif`, `image/webp`, `image/svg+xml`, `text/html`, and `application/octet-stream` | Refused with "This file can be viewed but not downloaded." |

The refusal is `documentStampSupported` (`supabase/functions/_shared/deal_room_pdf_stamp.ts:50`) and the download branch at `deal_room_documents_http.ts:196`. Upload already rejects those other types. The refusal is the guard if a row has another mime. A view of an unsupported mime returns "Not found" and does not send the stored bytes (`deal_room_documents_http.ts:159`).

## Staff reads

Unchanged. A staff storage read of a shared file still calls `private.note_staff_shared_read` from `private.room_document_staff_may_read_path` (`supabase/migrations/20261209140000_deal_room_documents.sql:318`). This PR does not edit that migration.

## Retention

`supabase/functions/retention-sweep/index.ts` matches main. No workflow and no schedule was added. Do not redeploy `retention-sweep`.

## Migration

None. Not needed: no table, policy, or function change. The latest migration on main after merging `af3c4b9` is `20261212120000_weekly_digest.sql`. A new file would have used a slot after that.

## Apply order for the operator

Do not apply this from the app or from CI.

1. Deploy Edge `deal-room-documents` only. It already imports `pdf-lib@1.17.1`.

Do not apply a migration. Do not redeploy `retention-sweep`.

## Smoke for the operator

Use two test members in one open test room. Do not call retention-sweep. Do not call suggest-intros. Do not refill invites. Do not call PostHog. Do not send email.

1. Member A uploads a small PDF.
2. Member B views it. The stamp shows B's own name and email, the Asia/Riyadh time, and the room reference.
3. With download off, B has no download button and the download action is refused. No signed URL and no file bytes are returned.
4. A or B turns download on. B saves a PDF. The saved file contains B's stamp. It is not the stored original, and the response has no storage URL.
5. A PNG or JPEG download is that same stamped PDF.
6. A type other than PDF, PNG, or JPEG is refused with "This file can be viewed but not downloaded."
7. A member of another room, and a person who is not a participant, are still refused. No signed URL is created.
8. After A shares a file with admin, a staff read still writes one `staff_access_log` row through `private.note_staff_shared_read`.

## Checks

`node --experimental-strip-types --test scripts/deal-room-documents.test.ts` passed (13 tests). `scripts/deal-room-documents-rls.test.ts` passed against local Postgres. The partner wording source gate passed. The two partner tests that need a production build and `.env` were not part of this change.

## Claims

| Claim | Grade |
| --- | --- |
| Download bytes are produced by `stampDocument`, not a second stamp implementation. | VERIFIED. `index.ts:19` passes `stampDocument`. `loadStamped` is the only stamp call for view and download. |
| The stored original path is never signed for members. | VERIFIED. `index.ts` has no `createSignedUrl`. The download handler does not call `storage.sign`. Tests at `scripts/deal-room-documents.test.ts:153` assert the signed-path list stays empty and the body has no `url`. |
| An unsupported type is refused with the stated sentence. | VERIFIED at `scripts/deal-room-documents.test.ts:213`. |
| Cross-room and non-participant downloads stay refused. | VERIFIED at `scripts/deal-room-documents.test.ts:234`. Hidden hold is how `room_document_open_for` reports both. `not_participant` is also refused. |
| `retention-sweep/index.ts` matches main. | VERIFIED by diff against `origin/main`. |
| Staff shared reads still call `private.note_staff_shared_read`. | VERIFIED. That migration was not edited. The call remains at `20261209140000_deal_room_documents.sql:318`. |
| A live two-member smoke on the hosted project. | UNKNOWN. Edge functions were not deployed from this PR. |
