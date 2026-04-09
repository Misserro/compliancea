# Task 1 Implementation Notes: Fix GDrive Shared Drive Download Failures

## Changes Made

**File:** `lib/gdrive.js`

Three parameter additions to the `downloadFile` function — no logic changes:

1. **Line 227** — `files.export` (Google Docs to PDF): added `supportsAllDrives: true`
2. **Line 233** — `files.get` (media download for PDF/DOCX): added `supportsAllDrives: true`
3. **Lines 243-246** — `files.get` (metadata fetch for filename): added `supportsAllDrives: true`

## What Was NOT Changed

- `listFilesRecursive` (lines 164-209): already has `supportsAllDrives: true` and `includeItemsFromAllDrives: true`. No `corpora`/`driveId` added — implicit `allDrives` corpora works correctly for our recursive folder-based listing approach.

## Verification

- `npm run build` passes
- All `files.get` and `files.export` calls in the file now include `supportsAllDrives: true`
