# Deal room document vault

One PR. Schema, storage, Edge, retention, and the Documents panel ship together.

## Secrets grade

VERIFIED. This diff adds no live mailbox, API key, token, password, service-role key, user id, or staff name. Tests use example.com only. `.env` is not in the commit.

## What landed

Accepted room participants can upload a PDF, PNG, or JPEG (20 MB, 40 pages). The file is stored at `{room_id}/{document_id}/source` in the private bucket `deal-room-documents`. Members have no storage select policy. The Edge function `deal-room-documents` is the only member read path.

A view is stamped on the server with the requesting member's own name and email, the date and time in Asia/Riyadh, and the first 8 characters of the room id. The stamp is read from `room_document_viewer_identity` for that caller. The response does not take a name or email from the client. Copy on the panel: "Viewing is watermarked and logged." The UI does not say screenshots are blocked.

Download defaults off. While it is off the API does not create a signed URL and the panel has no save button. When the owner or the uploader turns it on, download returns a signed URL with a 60 second TTL.

The owner sets a file expiry or a member expiry, and can revoke a member. Expired access returns "Access expired". Invited, declined, removed, and non-participants get no metadata and no file.

Closing or archiving a room sets `rooms.closed_at` and revokes document access. Staff see a document count on the Rooms board and no file names. Staff can read the object only after the uploader shares it, and that read calls `private.note_staff_shared_read`.

Retention waits 30 days after `rooms.closed_at` (closed or archived). It is not 30 days from upload. An uploader delete removes the object in the Edge function at once and queues the path if storage removal fails. Change `private.deal_room_document_retention_interval` to switch the wait.

## CSP

VERIFIED. Security 5 stamps a meta Content-Security-Policy at prerender (`scripts/csp-policy.mjs`). The viewer uses a blob URL in an iframe, not a PDF worker. The only policy change is `blob:` on `frame-src`. `worker-src` stays `'self' blob:`. `object-src` stays `'none'`.

## Checks

VERIFIED on this branch after the production build:

- `node --experimental-strip-types --test scripts/*.test.ts`: 764 tests, 761 passed, 0 failed, 3 skipped.
- `npm run build` (tsc, vite, prerender, CSP stamp) and `scripts/pages-artifact-gate.sh` passed.
- Postgres RLS test `scripts/deal-room-documents-rls.test.ts` passed, including non-participant denial, expiry, download default off, staff aal1 denial, staff aal2 counts without rows, shared storage plus the audit hook, close revoking access, and a retention dry run that lists only a room closed 31 days ago.
- `src/App.tsx` and `/apply` were not edited. Main had not moved at the end of the work.

## Apply order for the operator

Do not apply this from the app or from CI.

1. Migration `supabase/migrations/20261209140000_deal_room_documents.sql` after `20261209120000_application_answers_at_admission.sql`. It adds `rooms.closed_at`, the document tables, RLS, the bucket, the storage policy, the retention function, and the close and archive updates.
2. Deploy Edge `deal-room-documents` (new). It imports `pdf-lib` from esm.sh.
3. Redeploy Edge `retention-sweep`. It calls `deal_room_document_retention` and deletes objects from `deal-room-documents`. Deploy it only after the migration, or a dry run returns an error for the missing function.
4. No other deal-room function needs a redeploy. Close and archive go through the replaced SQL functions. The HTTP wrappers did not change.

Smoke on a test room with two test members: upload, view (stamp shows only the viewer), download off then on, expiry, owner log, staff without share sees the count only. Then `retention-sweep?dry_run=1`.

## File map

| Piece | Where |
| --- | --- |
| Tables, RLS, bucket, close stamp, retention | `supabase/migrations/20261209140000_deal_room_documents.sql` |
| Stamp string, sniff, 60 second TTL, 40 page cap | `supabase/functions/_shared/deal_room_documents.ts` |
| PDF and image stamp | `supabase/functions/_shared/deal_room_pdf_stamp.ts` |
| HTTP actions | `supabase/functions/_shared/deal_room_documents_http.ts` |
| Function entry | `supabase/functions/deal-room-documents/index.ts` |
| Sweep counts and storage delete | `supabase/functions/retention-sweep/index.ts` |
| Documents panel | `src/pages/dashboard/DealRoomDocuments.tsx`, mounted from `DealRoomPanel.tsx` |
| Staff count | `src/pages/admin/StaffRoomsBoard.tsx` |
| CSP `blob:` | `scripts/csp-policy.mjs` |

## Claims

| Claim | Grade |
| --- | --- |
| Slot `20261209140000` was free. Latest file on main at start was `20261209120000`. | VERIFIED |
| Members cannot select `deal-room-documents`. Staff select runs only when `shared_with_admin_at` is set and calls `private.note_staff_shared_read`. | VERIFIED in `scripts/deal-room-documents-rls.test.ts` |
| Watermark bytes for viewer A contain A's example.com address and not another member's. | VERIFIED in `scripts/deal-room-documents.test.ts` |
| Download off creates no signed URL. Download on uses 60 seconds. | VERIFIED in the HTTP test |
| Retention dry run lists a room closed 31 days ago and skips an open room. | VERIFIED in the Postgres test |
| `pdf-lib@1.17.1` resolves on the hosted Edge runtime. | INFERRED from the existing esm.sh import style. UNKNOWN until the function is deployed. |
| A live two-member smoke on the hosted project. | UNKNOWN. Migrations and Edge functions were not applied from this PR. |
