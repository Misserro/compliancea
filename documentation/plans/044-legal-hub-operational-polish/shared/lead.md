# Lead Notes — Plan 044 Legal Hub Operational Polish

## Plan Overview

Three improvements surfacing already-built backend capabilities and fixing two known bugs. No new infrastructure. Frontend-heavy, low-risk.

## Concurrency Decision

**Sequential only** — Tasks 1→2→3.

Tasks 1 and 3 both touch `messages/en.json` and `messages/pl.json`. Task 2 has no i18n but is in the same dependency chain. All sequential to avoid merge conflicts.

## Task Dependency Graph

```
Task 1 (Activity tab) → Task 2 (Bug fixes) → Task 3 (Sorting)
```

## Key Architectural Constraints

- **Next.js 15 App Router** — `src/app/(app)/` routes; `src/components/legal-hub/`
- **shadcn/ui** — use existing components only; no new UI libraries
- **next-intl** — all user-facing strings in both `messages/en.json` and `messages/pl.json` under `LegalHub.*` namespace
- **Audit log shape:** `{ id, entity_type, entity_id, action, details (JSON string), created_at, user_id, org_id }` — returned by `GET /api/legal-hub/cases/[id]/activity` as `{ data: entries[] }`
- **getAuditLog** imported via `@/lib/audit-imports` (CJS shim) — NOT directly from lib/db.js
- **LEGAL_CASE_STATUSES** — 11 values: new, intake, analysis, draft_prepared, filed, awaiting_response, hearing_scheduled, judgment_received, appeal, active, closed
- **applicable_case_types** on CaseTemplate — JSON array; empty/null = applies to all types
- **Tab pattern in CaseDetailPage** — `TABS` constant array + `activeTab` useState + `{activeTab === "X" && <Component />}` conditional mount

## Critical Decisions

- Task 1: Activity tab is 5th tab — after Chat. No existing tab is reordered.
- Task 1: Map known action strings to i18n labels; unknown actions fall back to raw string
- Task 2: updateCaseStatus enum must exactly match LEGAL_CASE_STATUSES — no subset
- Task 2: Template filter: show template if `applicable_case_types` is null/empty OR includes current case_type
- Task 3: Default sort = by next_deadline (soonest first, nulls last). Runs client-side on already-loaded data.
- Task 3: Sort state lives in LegalHubDashboard (not CaseList) — consistent with filter state location
