# ENARA — Document Access Report

The owner policy of 2026-11-01 is authoritative. It supersedes the 2026-10-29 policy, which allowed deferred files to be downloaded with a warning.

## 1. Scan states

| Stored `scanStatus` | Shown as | Original downloadable? | Extracted text to AI? |
|---|---|---|---|
| `pending`, `unavailable` | Pending / not scanned | **No** | No (not cleared) |
| `deferred` (no scanner, by policy) | **Not scanned** | **No** | Yes, if rights-attested (bounded extraction) |
| `not_required` (school without the documents gate) | Not scanned | **No** | Existing pre-P2 behaviour |
| `failed` | Scan failed | **No** | No |
| `infected` | Removed | **No** (file deleted) | No |
| `clean` (scanner present; none is configured) | No threat found | Yes, own school | Yes |
| No document record, video | Lesson media | Yes, own school (OD-3) | No |
| No document record, other file | Not scanned | **No** | — |

- Status changes are server-owned (`documentSafety.scanDocument`). No client route sets `clean`.
- No scanner is simulated: `getMalwareScanner()` returns null outside tests.

## 2. Upload and extraction

- **Upload works with no scanner.** The file is stored in R2 with a school-prefixed key, and `scanStatus` goes from `pending` to `deferred`.
- **Rights attestation** is required (`RIGHTS_ATTESTATION_REQUIRED`).
- **Size limits:**
  - multer 50 MB;
  - extraction 30 MB;
  - serverless request body about 4.5 MB for non-direct uploads;
  - video by presigned PUT, 1 GB, with a magic-byte check.
- **Extraction** covers PDF, DOCX and TXT, and keeps source provenance (`CurriculumChunk.uploadId`, page, section).
- **Raw originals are sent to a provider or engine only when `clean`** (`filterClearedFileUrls`).

## 3. Download path (all roles, all routes)

1. Any API JSON response contains plain `/uploads/<name>` paths.
2. `uploadLinkSigning` signs a path only when:
   - the caller is signed in;
   - the file belongs to the caller's school (ENARA Admin: any school);
   - the original is downloadable.
3. The signature covers name, expiry (≤15 min) and owning school.
4. `GET /uploads/:name` re-resolves the owner and eligibility and verifies the signature for that owner:
   - 403 if the link is invalid or expired;
   - 404 `FILE_NOT_AVAILABLE` if the file is not downloadable.
   - Applies to both R2 and local storage.
5. Documents API: `fileUrl` is set only when downloadable; otherwise `originalDownload: 'unavailable'` with a reason. The UI shows "Original not downloadable (not scanned)" and keeps the "Sources" extracted-text view.
6. Course materials list only downloadable originals.

## 4. Ownership and cross-school protection

| Rule | Where |
|---|---|
| New object keys are `<school>~<uuid>-<name>` | `uploadAccess.storedUploadName` (documents, chapter files, videos) |
| Owner of legacy files: document record, or the single school whose curriculum lists the file; otherwise none (no link) | `uploadAccess.resolveUploads` |
| Curriculum create/update keeps only own-school paths | `curriculum.controller`, `ownUploadsOnly` |
| Video completion requires the school's own stored name | `completeChapterVideoUpload` |
| Delete-by-path deletes storage only for own, listed files | `removeChapterUpload` |
| R2 list | No list endpoint exposed |

## 5. Signed links and logging

| Link | Expiry |
|---|---|
| App links | ≤15 min, rounded to the minute |
| R2 PUT | 15 min |
| R2 video playback | 60 min (byte-range playback; issued only after the gate) |

All log lines pass through `redactSignedLinks`, which strips `sig`, `exp`, `token` and `X-Amz-*` values. Request and error paths drop query strings for `/uploads/`.

## 6. BLOCKED — operator backfill of legacy objects (not run)

1. List the school-less keys `uploads/<uuid>-<name>` in each R2 bucket, using a read-only token.
2. For each key, resolve the owner: the `CurriculumFileJob.institutionId` for its `fileUrl`, or else the single curriculum that lists it. Unresolved keys go to a manual review list.
3. Copy each object to `uploads/<school>~<uuid>-<name>`. Update `CurriculumFileJob.fileUrl` and every `Curriculum.chapters.uploads` entry in one transaction per school.
4. Verify downloads, then delete the old keys after a retention hold.
5. Record counts and an audit event.

Run this against a backup first. Do not run it on production without approval.

## 7. Tests (run in this task)

p22 workstream B (7 tests) and p22 "lists only downloadable originals". Existing `p2Documents` and `p2NoScannerPolicy` mock providers and were **NOT RUN**; they encode the superseded 2026-10-29 policy and need updating when run.
