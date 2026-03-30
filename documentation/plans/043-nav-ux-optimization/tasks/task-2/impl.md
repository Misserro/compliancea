## Task 2 Complete -- Merge AI Tools into Tabbed Page

- Modified: `src/components/layout/app-sidebar.tsx` (line 5) -- removed `MessageSquare` from lucide-react import (no longer used in this file)
- Modified: `src/components/layout/app-sidebar.tsx` (lines 289-292) -- replaced `analyzeProcess` + `askLibrary` entries in `docHubItems` with single `aiTools` entry using `tSidebar("aiTools")`
- Modified: `src/app/(app)/document-tools/page.tsx` -- full rewrite from server component to `"use client"` component with tab switcher (analyze/ask tabs), client-side `/api/documents` fetch, Skeleton loading states
- Modified: `src/app/(app)/ask/page.tsx` -- replaced with server-side `redirect("/document-tools")` from `next/navigation`
- Modified: `messages/en.json` -- added `Sidebar.aiTools: "AI Tools"` and `Documents.aiTools` object with title, subtitle, tab.analyze, tab.ask
- Modified: `messages/pl.json` -- added `Sidebar.aiTools: "Narzedzia AI"` and `Documents.aiTools` object with Polish equivalents

### Pattern followed

- Client-side document fetching uses the exact same pattern as the original `ask/page.tsx` (useEffect + fetch `/api/documents` + loading state)
- Tab switching uses local `useState` -- consistent with DeskSection and ContractsTab patterns (no URL params)
- Tab bar styling uses border-b-2 underline pattern with primary/muted-foreground colors
- Server redirect in ask/page.tsx uses `redirect()` from `next/navigation` (Next.js 15 pattern)

### Integration notes

- INTEGRATION: Task 3 touches `docHubItems` to remove `policies` entry. After this task, docHubItems has 3 entries: documents, policies, aiTools
- The `MessageSquare` icon was removed from sidebar import only. It remains imported in `case-detail-page.tsx`, `contracts-tab.tsx`, `contract-chat-panel.tsx`, and `case-chat-panel.tsx`
- Both JSON files validated successfully with `JSON.parse()`
- GOTCHA: `getAllDocuments()` CJS import was removed from document-tools page. Documents are now fetched client-side via `/api/documents` endpoint.
