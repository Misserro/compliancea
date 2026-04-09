# Task 1 Plan: Fix process route — storage-aware file reading

## Current State

`src/app/api/documents/[id]/process/route.ts` uses direct filesystem calls:
- **Line 3:** `import fs from "fs/promises"`
- **Line 64:** `await fs.access(document.path)` — existence check (fails for S3-backed documents)
- **Line 70:** `await extractTextFromPath(document.path)` — wraps `fs.readFile` internally
- **Line 81:** `await fs.readFile(document.path)` — second read for file hash
- **Line 401:** `await fs.readFile(document.path)` — third read for PDF page-aware chunking

## Target State

Replace all `fs` calls with `getFile()` from `@/lib/storage-imports`, matching the pattern in `download/route.ts`.

## Changes

### 1. Update imports (top of file)

- **Remove:** `import fs from "fs/promises"`
- **Add:** `import { getFile } from "@/lib/storage-imports"`
- **Change:** Replace `extractTextFromPath` with `extractTextFromBuffer` in the server-utils import

### 2. Replace fs.access + extractTextFromPath (lines 62-73)

Replace the separate existence check + text extraction with a single `getFile` call wrapped in try/catch:

```typescript
// Read file via storage backend (handles S3 and local)
let fileBuffer: Buffer;
try {
  fileBuffer = await getFile(
    orgId,
    document.storage_backend || "local",
    document.storage_key,
    document.path
  );
} catch {
  return NextResponse.json({ error: "Document file not accessible" }, { status: 404 });
}

// Extract text
const kind = guessType(document.name) || guessType(document.path) || "";
const text = await extractTextFromBuffer(fileBuffer, kind);
```

### 3. Replace fs.readFile for file hash (lines 79-85)

Reuse `fileBuffer` already read above — no second file read needed:

```typescript
let fileHash = null;
try {
  fileHash = computeFileHash(fileBuffer);
} catch {
  // File hash is optional
}
```

### 4. Replace fs.readFile for PDF page-aware chunking (line 401)

Reuse `fileBuffer` instead of `await fs.readFile(document.path)`:

```typescript
// was: const fileBuffer = await fs.readFile(document.path);
// now: reuse fileBuffer from the getFile call above
```

Since `fileBuffer` is already declared in the outer scope, the PDF branch at line 401 just uses it directly. Remove the `const fileBuffer = await fs.readFile(document.path)` line.

## Verification

- `npm run build` must pass
- No remaining `fs` import or usage in the file
- `getFile` call signature matches download route exactly
