# Task 1 Implementation Notes

## Changes Made

**File:** `src/app/api/documents/[id]/process/route.ts`

### 1. Import changes (lines 3-5)
- Removed: `import fs from "fs/promises"`
- Changed: `extractTextFromPath` -> `extractTextFromBuffer` in server-utils import
- Added: `import { getFile } from "@/lib/storage-imports"`

### 2. File read + existence check (lines 62-73)
- Replaced `fs.access(document.path)` with `getFile(orgId, document.storage_backend || "local", document.storage_key, document.path)` wrapped in try/catch
- Error message changed from `"Document file not found on disk"` to `"Document file not accessible"` (same 404 status)

### 3. Text extraction (lines 75-77)
- Replaced `extractTextFromPath(document.path)` with `extractTextFromBuffer(fileBuffer, kind)`
- `kind` derived from `guessType(document.name) || guessType(document.path) || ""`

### 4. File hash computation (lines 86-90)
- Removed second `fs.readFile(document.path)` call
- Reuses `fileBuffer` from the `getFile` call above

### 5. PDF page-aware chunking (line ~399)
- Removed `const fileBuffer = await fs.readFile(document.path)`
- Reuses `fileBuffer` from outer scope (already a `Buffer`)

## Verification
- `npm run build` passes
- No remaining `fs` import or usage in file
- `getFile` call signature matches `download/route.ts` pattern exactly
