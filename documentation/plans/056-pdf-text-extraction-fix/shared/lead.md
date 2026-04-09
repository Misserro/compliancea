# Lead Notes — Plan 056: PDF Text Extraction Fix

## Plan Overview

Fix two issues in `src/app/api/documents/[id]/process/route.ts` exposed by the Plan 055 Shared Drive fix, and add OCR as a fallback for scanned PDFs:

1. **S3 storage-backend blind spot** — process route uses `fs.access`/`fs.readFile` directly, bypassing storage-backend routing. Fix: use `getFile(orgId, storage_backend, storage_key, path)`.
2. **OCR fallback for scanned PDFs** — when `pdf-parse` returns empty text, fall back to Tesseract.js OCR via pdfjs-dist + @napi-rs/canvas for page rendering.

## Concurrency Decision

2 tasks, both independent (no shared files). Running both in parallel as 2 concurrent task-teams.

## Task Dependency Graph

- Task 1: no dependencies (process/route.ts only)
- Task 2: no dependencies (server-utils.ts + package.json only)

Both tasks are safe to run fully in parallel.

## Key Architectural Constraints

- All file reads in route handlers MUST use `getFile(orgId, backend, storageKey, localPath)` from `@/lib/storage-imports` — never `fs.readFile(document.path)` directly
- `extractTextFromBuffer(buffer, kind)` is the correct low-level API — `extractTextFromPath` wraps it with `fs.readFile` internally (avoid in routes)
- Use pdfjs-dist `legacy/build` entry point for Node.js compatibility (no browser worker)
- Tesseract worker must always be terminated via try/finally to prevent worker leaks
- OCR uses Polish + English language packs (`pol` + `eng`) — target market requirement
- Scale 2.0 for pdfjs-dist viewport — better OCR resolution

## Decisions Made During Execution

(populated during execution)

## Execution Status

In progress.
