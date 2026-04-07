# Task 3 Implementation Plan — Documents Hub route migration + /documents dashboard

## Overview

Move the existing documents library from `/documents` to `/documents/library`, move AI Tools from `/document-tools` to `/documents/ai-tools`, and create a new Documents hub dashboard at `/documents`. Add permanent redirects for old URLs.

## Files to Create/Modify

### 1. `src/app/(app)/documents/library/page.tsx` (NEW)
- Copy the current `src/app/(app)/documents/page.tsx` content here verbatim
- This preserves the existing documents library with all filter chips, upload, search, etc.
- One change: update `router.push("/obligations")` in the ContractActionDialog callback to `/contracts/obligations` (this reference will be stale after the contracts migration; however Task 5 is responsible for link sweep -- I will note this but leave it for now unless the reviewer flags it as blocking)

### 2. `src/app/(app)/documents/page.tsx` (REWRITE)
- Replace the documents library with a new hub dashboard
- Client component fetching from `/api/dashboard`, extracting `data.docs` (total, processed, byType)
- Follow the exact KpiCard pattern from `src/app/(app)/dashboard/page.tsx`:
  - `KpiCard` component (icon, label, value, sub, href) rendered in a responsive grid
  - Permission gating via `canView('documents')` using session permissions
  - Same outer layout: `p-6 max-w-6xl mx-auto space-y-8`
- KPI cards:
  - Total Documents (FileText icon) -> links to `/documents/library`
  - Processed Documents (FileCheck icon) -> links to `/documents/library`
  - By-type breakdown rendered as a panel listing each doc type with count
- Quick-action links panel: "Document Library" -> `/documents/library`, "AI Tools" -> `/documents/ai-tools`
- i18n: use `useTranslations("DocumentsHub")` namespace (new keys needed in messages files)

### 3. `src/app/(app)/documents/ai-tools/page.tsx` (NEW)
- Copy the current `src/app/(app)/document-tools/page.tsx` content here verbatim
- No internal route references to update -- the page is self-contained

### 4. `next.config.mjs` (MODIFY)
- Add `redirects()` async function to nextConfig:
  ```js
  async redirects() {
    return [
      { source: '/document-tools', destination: '/documents/ai-tools', permanent: true },
      { source: '/ask', destination: '/documents/ai-tools', permanent: true },
    ];
  },
  ```
- Note: Tasks 1 and 2 may also add redirects here. These are additive and non-conflicting.

### 5. `messages/en.json` (MODIFY)
- Add `"DocumentsHub"` namespace with keys for the new dashboard:
  - title, subtitle, totalDocuments, processedDocuments, processedSub, byType, library, aiTools, quickActions, noDocuments

### 6. `messages/pl.json` (MODIFY)
- Add Polish equivalents for the `"DocumentsHub"` namespace

### 7. Old files cleanup
- `src/app/(app)/document-tools/page.tsx` -- DELETE (content moved to documents/ai-tools)
- `src/app/(app)/ask/page.tsx` -- DELETE (redirect now handled by next.config.mjs)

## Risks and Trade-offs

1. **Parallel task conflict on next.config.mjs**: Tasks 1, 2, and 3 all modify this file. Since they add different redirect entries, conflicts should be trivially resolvable at merge time. I will add only the document-related redirects.

2. **The documents library page references `/obligations`** in a callback (line 446). This is technically a stale link after the contracts migration (Task 2), but Task 5 (link sweep) is responsible for catching all such references. I will note it in impl.md but not fix it here to avoid scope creep.

3. **i18n namespace**: Using a new `"DocumentsHub"` namespace avoids collisions with the existing `"Documents"` namespace used by the library page.

## Success Criteria Mapping

- GET /documents -> new hub dashboard with KPI cards (total, processed, byType) -- covered by file #2
- GET /documents/library -> existing documents list with filter chips -- covered by file #1
- GET /documents/ai-tools -> tabbed AI tools page -- covered by file #3
- /document-tools redirect -> covered by file #4
- /ask redirect -> covered by file #4 + file #7 (delete old ask page)
- No 404s -> covered by all files above
