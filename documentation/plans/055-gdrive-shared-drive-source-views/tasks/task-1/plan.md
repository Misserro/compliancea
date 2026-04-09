# Task 1 Plan: Fix GDrive Shared Drive Download Failures

## Problem

In `lib/gdrive.js`, the `downloadFile` function (lines 218-252) makes three Google Drive API calls that are missing `supportsAllDrives: true`. This causes 404 errors when attempting to download files from Shared Drives.

## Changes

**File:** `lib/gdrive.js`

### 1. Add `supportsAllDrives: true` to `files.export` (line 226-229)

```js
// Before
response = await driveClient.files.export(
  { fileId, mimeType: "application/pdf" },
  { responseType: "arraybuffer" }
);

// After
response = await driveClient.files.export(
  { fileId, mimeType: "application/pdf", supportsAllDrives: true },
  { responseType: "arraybuffer" }
);
```

### 2. Add `supportsAllDrives: true` to `files.get` media download (line 232-235)

```js
// Before
response = await driveClient.files.get(
  { fileId, alt: "media" },
  { responseType: "arraybuffer" }
);

// After
response = await driveClient.files.get(
  { fileId, alt: "media", supportsAllDrives: true },
  { responseType: "arraybuffer" }
);
```

### 3. Add `supportsAllDrives: true` to `files.get` metadata fetch (line 242-245)

```js
// Before
const meta = await driveClient.files.get({
  fileId,
  fields: "name",
});

// After
const meta = await driveClient.files.get({
  fileId,
  fields: "name",
  supportsAllDrives: true,
});
```

### 4. `listFilesRecursive` — no changes needed

The `files.list` call (line 171-178) already has both `supportsAllDrives: true` and `includeItemsFromAllDrives: true`. The recursive approach using `'folderId' in parents` query works for Shared Drives when these flags are set. Adding `corpora: 'drive'` + `driveId` is not needed because listing already works — this would be over-engineering.

## Scope

- Only `lib/gdrive.js` is modified
- Three parameter additions, zero logic changes
- No new dependencies

## Verification

- `npm run build` passes
- All `files.get` and `files.export` calls in the file include `supportsAllDrives: true`
