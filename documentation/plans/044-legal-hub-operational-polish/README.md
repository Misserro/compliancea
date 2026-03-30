# Plan 044 — Legal Hub Operational Polish

## Overview

Three improvements that surface already-built backend capabilities and fix two known bugs in the Legal Hub. No new infrastructure required — all backend endpoints exist. Changes are frontend-heavy and low-risk.

## Goals

1. **Activity log tab** — expose the fully-implemented audit trail API as a visible case timeline (tab 5 in case detail)
2. **Bug fixes** — (a) align the chat route's `updateCaseStatus` tool enum with all 11 valid statuses; (b) filter the generate-tab template list by `applicable_case_types`
3. **Case list sorting** — add sort control (next deadline, title, newest, status) to the case list dashboard

## Tech Stack

- Next.js 15 App Router, shadcn/ui, next-intl (en/pl), Tailwind v4
- Existing API: `GET /api/legal-hub/cases/[id]/activity` → `{ data: AuditEntry[] }`
- Existing fields: `case_templates.applicable_case_types` (JSON array), `LEGAL_CASE_STATUSES` constant (11 values)

## Architecture Notes

- Audit log entry shape: `{ id, entity_type, entity_id, action, details (JSON string), created_at, user_id, org_id }`
- `getAuditLog` is imported via `@/lib/audit-imports` (CJS shim) — follow same pattern as other audit consumers
- `applicable_case_types` on a template is a JSON array of case type strings (e.g. `["civil","commercial"]`). An empty array or null means "applicable to all types"
- `LEGAL_CASE_STATUSES` is defined in a constants file — the chat route's tool definition must import or inline the same list; currently it only lists 6 of the 11 statuses

## Tasks

---

### Task 1 — Case Activity Log Tab

**Description:** Add a fifth "Activity" tab to `CaseDetailPage` that renders a reverse-chronological timeline of all logged actions for the case. Data comes from the existing `/api/legal-hub/cases/[id]/activity` endpoint.

**Patterns to read:**
- `src/components/legal-hub/case-detail-page.tsx` — tab array, tab switching pattern, how `CaseChatPanel` is conditionally mounted
- `src/app/api/legal-hub/cases/[id]/activity/route.ts` — response shape `{ data: AuditEntry[] }`
- `src/components/legal-hub/case-deadlines-section.tsx` — existing timeline-like list for visual pattern reference
- `messages/en.json` — `LegalHub.*` namespace for i18n key placement

**Files to create/modify:**
- `src/components/legal-hub/case-activity-tab.tsx` (new) — fetch and render activity timeline
- `src/components/legal-hub/case-detail-page.tsx` — add `"activity"` to `TABS` array; add `{activeTab === "activity" && <CaseActivityTab caseId={caseId} />}` render block
- `messages/en.json` — add `LegalHub.activity.*` keys
- `messages/pl.json` — add `LegalHub.activity.*` keys (Polish)

**Success criteria:**
- "Activity" tab appears as the 5th tab in the case detail header (after Chat)
- Tab renders a list of activity entries in reverse chronological order (newest first)
- Each entry shows: human-readable action label (mapped from `action` string), relative or absolute timestamp, and a summary derived from `details` JSON where meaningful (e.g. for status_changed: old → new status)
- Known action types mapped to readable labels (en + pl): `create`, `update`, `status_changed`, `document_added`, `document_generated`, `document_exported`, `party_added`, `deadline_added`, `ai_mutation_applied`
- Unmapped action types fall back to the raw action string
- Empty state shown when no activity entries exist
- Loading skeleton shown while fetching
- Error state shown on fetch failure
- Tab label key: `LegalHub.activity.tab` ("Activity" / "Historia")

---

### Task 2 — Bug Fixes: Chat Status Enum + Template Case-Type Filtering

**Description:** Fix two independent bugs discovered during codebase audit. (a) The chat route's `updateCaseStatus` tool definition only lists 6 of the 11 valid case statuses — align it with `LEGAL_CASE_STATUSES`. (b) The Generate tab shows all active templates regardless of the `applicable_case_types` field — filter the list to only show templates applicable to the current case's type (or all templates if `applicable_case_types` is empty/null).

**Patterns to read:**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — find the `updateCaseStatus` tool definition with the `enum` constraint; find where `LEGAL_CASE_STATUSES` or the status list is imported/defined
- `src/components/legal-hub/case-generate-tab.tsx` — find where templates are fetched and rendered; find how `case.case_type` is accessed; find the template list render
- `src/lib/types.ts` — `LEGAL_CASE_STATUSES` constant or equivalent

**Files to modify:**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — expand `updateCaseStatus` tool's `enum` to all 11 statuses from `LEGAL_CASE_STATUSES`
- `src/components/legal-hub/case-generate-tab.tsx` — after fetching templates, filter: `templates.filter(t => !t.applicable_case_types?.length || t.applicable_case_types.includes(caseType))`

**Success criteria:**
- Chat route's `updateCaseStatus` tool enum contains exactly the same values as `LEGAL_CASE_STATUSES` (all 11: new, intake, analysis, draft_prepared, filed, awaiting_response, hearing_scheduled, judgment_received, appeal, active, closed)
- Generate tab shows only templates where `applicable_case_types` is empty/null OR includes the current case's `case_type`
- A template with no `applicable_case_types` restriction still appears for all case types
- No new i18n keys required
- `npx tsc --noEmit` passes

---

### Task 3 — Case List Sorting

**Description:** Add a sort control to the Legal Hub case list dashboard. Sort is applied client-side (data already loaded). Options: by next deadline (soonest first, nulls last), by title (A–Z), by created (newest first).

**Patterns to read:**
- `src/components/legal-hub/legal-hub-dashboard.tsx` — existing filter controls (status checkboxes, case type dropdown); how state flows to `CaseList`
- `src/components/legal-hub/case-list.tsx` — where `filteredCases` is computed; existing client-side filter logic
- `messages/en.json` — `LegalHub.dashboard.*` namespace for sort option label placement

**Files to modify:**
- `src/components/legal-hub/legal-hub-dashboard.tsx` — add `sortBy` state (`"deadline" | "title" | "created"`, default `"deadline"`); add sort dropdown UI next to existing filters; pass `sortBy` to `CaseList`
- `src/components/legal-hub/case-list.tsx` — accept `sortBy` prop; apply sort after filtering: deadline sort uses `next_deadline` (nulls last), title sort is locale-aware `localeCompare`, created sort uses `created_at` descending
- `messages/en.json` — add `LegalHub.dashboard.sortBy`, `LegalHub.dashboard.sortDeadline`, `LegalHub.dashboard.sortTitle`, `LegalHub.dashboard.sortCreated`
- `messages/pl.json` — Polish equivalents

**Success criteria:**
- Sort dropdown appears in the filter row of the case list page
- Default sort is by next deadline (soonest case first; cases with no deadline appear last)
- "Title A–Z" sort orders cases alphabetically using locale-aware comparison
- "Newest" sort orders by `created_at` descending
- Sort persists within the session while navigating within the Legal Hub
- Changing sort does not reset active status/type filters
- Sorting works correctly with 0, 1, and many cases

## Concurrency

Tasks are sequential due to shared `messages/*.json` (Tasks 1 and 3) and the short overall task count.

```
Task 1 (Activity tab) → Task 2 (Bug fixes) → Task 3 (Sorting)
```

Task 2 has no i18n changes so it could run in parallel with Task 1, but sequential keeps it simple.
