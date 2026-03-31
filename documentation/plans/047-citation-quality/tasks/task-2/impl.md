## Task 2 Complete — Force-reprocess button for already-processed documents

- Modified: `src/app/api/documents/[id]/process/route.ts` (added `?force=true` query param parsing at line ~52, modified skip check at line ~87 to add `!force &&` guard)
- Modified: `src/components/documents/document-card.tsx` (added `RefreshCw` import, `onReprocess` prop to interface and destructuring, new Reprocess button in the processed-doc branch after Retag button)
- Modified: `src/components/documents/document-list.tsx` (added `onReprocess` to all 3 prop interfaces: `DocumentListProps`, `DocTypeSectionProps`, `DeptSectionProps`; added to all destructured props and both `sharedProps` objects; passed to `<DocumentCard>`)
- Modified: `src/app/(app)/documents/page.tsx` (added `handleReprocess` function that calls `POST /api/documents/${id}/process?force=true`, reuses `processingIds` for loading state; passed `onReprocess={handleReprocess}` to `<DocumentList>`)
- Modified: `messages/en.json` (added `documents.card.reprocessDocument` and `documents.reprocessSuccess`)
- Modified: `messages/pl.json` (added `documents.card.reprocessDocument` and `documents.reprocessSuccess`)
- TypeScript: `npx tsc --noEmit` passes with zero errors
- INTEGRATION: Task 1 (page number fix) benefits from this — after Task 1 is deployed, users can click Reprocess on existing documents to re-index with correct page numbers
- PATTERN: `handleReprocess` follows exactly the same pattern as `handleProcess` and `handleRetag` (Set add/delete for loading state, try/catch/finally, toast feedback, loadDocuments refresh)
