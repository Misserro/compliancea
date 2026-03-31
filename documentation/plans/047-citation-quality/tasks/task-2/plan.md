# Task 2 — Force-Reprocess Button: Implementation Plan

## Overview
Add a "Reprocess" button (RefreshCw icon) for already-processed documents and a `?force=true` query parameter to bypass the content-hash skip check in the process route.

## Files to Modify

### A — `src/app/api/documents/[id]/process/route.ts`
- At line ~50 (after `const documentId = parseInt(id, 10);`), parse `?force` from the request URL:
  ```ts
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";
  ```
- At line ~85, change the skip check from:
  ```ts
  if (document.processed === 1 && document.content_hash === contentHash) {
  ```
  to:
  ```ts
  if (!force && document.processed === 1 && document.content_hash === contentHash) {
  ```

### B — `src/components/documents/document-card.tsx`
- Add `onReprocess: (id: number) => void` to `DocumentCardProps` interface
- Add `onReprocess` to destructured props
- Import `RefreshCw` from `lucide-react` (alongside existing icons)
- In the `{doc.processed ? (...) : ...}` branch (line ~178), add a Reprocess button after the Retag button, inside the same `<>` fragment, guarded by `canEdit`:
  ```tsx
  {canEdit && (
    <Button variant="ghost" size="icon" className="h-7 w-7"
      onClick={() => onReprocess(doc.id)}
      disabled={processing}
      title={t('card.reprocessDocument')}
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </Button>
  )}
  ```

### C — `src/components/documents/document-list.tsx`
- Add `onReprocess: (id: number) => void` to all three prop interfaces: `DocumentListProps`, `DocTypeSectionProps`, `DeptSectionProps`
- Add `onReprocess` to all destructured props and `sharedProps` spread objects
- Pass `onReprocess={onReprocess}` to `<DocumentCard>` in `DocTypeSection`

### D — `src/app/(app)/documents/page.tsx`
- Add `handleReprocess` function (modeled after `handleProcess`):
  - Calls `POST /api/documents/${id}/process?force=true`
  - Reuses `processingIds` state for loading indicator
  - On success: `toast.success(t('reprocessSuccess'))` + reload documents
  - On error: `toast.error(t('processError') + ...)` (reuse existing key)
- Pass `onReprocess={handleReprocess}` to `<DocumentList>`

### E — `messages/en.json`
- Under `Documents.card`, add: `"reprocessDocument": "Reprocess document"`
- Under `Documents` (top-level toast keys), add: `"reprocessSuccess": "Document reprocessed successfully"`

### F — `messages/pl.json`
- Under `Documents.card`, add: `"reprocessDocument": "Przeindeksuj dokument"`
- Under `Documents` (top-level toast keys), add: `"reprocessSuccess": "Dokument został przeindeksowany"`

## Prop Drilling Path
`page.tsx` -> `DocumentList` -> `DeptSection` -> `DocTypeSection` -> `DocumentCard`

The `onReprocess` prop follows exactly the same pattern as the existing `onProcess` and `onRetag` props through this chain.

## Success Criteria Mapping
1. RefreshCw button on processed doc cards, guarded by canEdit -- change B
2. Calls POST with ?force=true -- change D
3. Loading state via processingIds -- change D (reuses existing state)
4. Existing Process button unchanged -- no modification to unprocessed branch
5. i18n keys in both locales -- changes E + F
6. No TypeScript errors -- verified via `npx tsc --noEmit`

## Risks
- None significant. All changes follow established patterns (onRetag, onProcess).
