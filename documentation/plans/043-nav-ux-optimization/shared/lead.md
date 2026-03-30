# Lead Notes — Plan 043 Nav UX Optimization

## Plan Overview

Pure UX/readability improvements — no new features. Reduces sidebar from ~12 to ~9 items.

## Concurrency Decision

**Max 2 concurrent task-teams.**

Tasks 1, 2, 3, 5 all touch `app-sidebar.tsx` (and message files) → must run sequentially.
Task 4 touches only `action-bar.tsx` → fully independent, runs in parallel with any other task.

## Task Dependency Graph

```
Task 1 (Workspace label) → Task 2 (AI Tools merge) → Task 3 (Policies chip) → Task 5 (Separator)
Task 4 (ActionBar dropdown) — independent, no dependencies
```

Initial spawn: Task 1 + Task 4 simultaneously.

## Key Architectural Constraints

- **Next.js 15 App Router** — `src/app/(app)/` routes, `(app)/layout.tsx` wraps all auth'd pages
- **shadcn/ui** — use existing components from `@/components/ui/`. No new UI libraries.
- **next-intl** — cookie-based locale (en/pl). All user-facing strings must be in both `messages/en.json` and `messages/pl.json` under the correct namespace.
- **Permission gating** — `app-sidebar.tsx` uses `canView(resource)` and `canAccessFeature(feature)`. Do not alter these guards.
- **Task 2 (AI Tools)**: Converting `document-tools/page.tsx` from Server Component to Client Component is intentional. The `getAllDocuments()` CJS call is replaced by `/api/documents` fetch. DeskSection and AskSection both accept `documents: Document[]` props.
- **Task 3 (Policies)**: Keep `/policies` page and route intact — only remove it from sidebar nav. The `Shield` lucide import in sidebar must NOT be removed (still used by Admin panel item).
- **Task 4 (ActionBar)**: `ActionBarProps` interface must be preserved exactly — parent `documents/page.tsx` passes all 6 props.

## Critical Decisions

- Tasks 1, 2, 3, 5 are sequential due to shared file conflict on `app-sidebar.tsx`
- Task 4 is independent and runs in parallel with Task 1 initially
- `/ask` route becomes a server-side redirect to `/document-tools` (not client redirect)
- Policies type filter in Documents page uses hardcoded `['policy', 'procedure']` array — no settings fetch needed
- No URL-based tab routing for AI Tools — local state only (consistent with existing DeskSection and ContractsTab patterns)
