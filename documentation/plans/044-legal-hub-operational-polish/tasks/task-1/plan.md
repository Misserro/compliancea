# Task 1 — Case Activity Log Tab: Implementation Plan

## Overview

Add a 5th "Activity" tab to `CaseDetailPage` that fetches from the existing `/api/legal-hub/cases/[id]/activity` endpoint and renders a reverse-chronological timeline of audit entries.

## Files to Create

### `src/components/legal-hub/case-activity-tab.tsx` (new)

A `"use client"` component accepting `{ caseId: number }`.

**Data fetching:**
- `useState` + `useEffect` pattern (consistent with `CaseDocumentsTab`, `CaseGenerateTab`)
- Fetch `GET /api/legal-hub/cases/${caseId}/activity` -> `{ data: AuditEntry[] }`
- Three states: `loading`, `error`, `entries` (AuditEntry[])

**Rendering:**
- **Loading state**: 4-5 Skeleton rows (`<Skeleton className="h-10 w-full" />`) matching the pattern in `case-generate-tab.tsx`
- **Error state**: centered `text-destructive` message, matching `case-detail-page.tsx` error pattern
- **Empty state**: `text-muted-foreground` paragraph with `t('activity.noActivity')` message
- **Timeline entries**: Each entry rendered as a bordered row in a vertical list with:
  - **Action label**: mapped via `ACTION_LABELS` dict to i18n key `activity.action.{action}`, fallback to raw string
  - **Timestamp**: formatted using `useLocale()` + `toLocaleString()` for absolute date/time
  - **Details summary**: Parse `details` JSON string. For `status_changed`: show "old -> new". For others with meaningful fields, show a brief summary. For null/empty, show nothing.

**Action type mapping:**
- Constants array: `create`, `update`, `status_changed`, `document_added`, `document_generated`, `document_exported`, `party_added`, `deadline_added`, `ai_mutation_applied`
- Each maps to i18n key `activity.action.{type}` in both en and pl
- Unknown actions: display raw `action` string directly

**Details parsing helper:**
- `function getDetailsSummary(action: string, details: string | null): string | null`
- Parses JSON, handles specific action types:
  - `status_changed`: `"{old_status} -> {new_status}"`
  - `document_added` / `document_generated` / `document_exported`: show document name if present
  - `party_added`: show party name if present
  - `deadline_added`: show deadline title if present
  - `ai_mutation_applied`: show brief description if present
  - Default: return null

## Files to Modify

### `src/components/legal-hub/case-detail-page.tsx`

1. Add `"activity"` to `TabKey` union type: `type TabKey = "overview" | "documents" | "generate" | "chat" | "activity"`
2. Import `History` icon from lucide-react (timeline icon) and `CaseActivityTab` component
3. Add 5th entry to `TABS` array: `{ key: "activity", labelKey: "tab.activity", icon: <History className="w-4 h-4" /> }`
4. Add conditional render block: `{activeTab === "activity" && <CaseActivityTab caseId={caseId} />}`

### `messages/en.json`

Add under `LegalHub.tab`:
- `"activity": "Activity"`

Add new `LegalHub.activity` namespace:
```json
"activity": {
  "noActivity": "No activity recorded for this case.",
  "loadError": "Failed to load activity log.",
  "action": {
    "create": "Case created",
    "update": "Case updated",
    "status_changed": "Status changed",
    "document_added": "Document added",
    "document_generated": "Document generated",
    "document_exported": "Document exported",
    "party_added": "Party added",
    "deadline_added": "Deadline added",
    "ai_mutation_applied": "AI changes applied"
  }
}
```

### `messages/pl.json`

Same structure, Polish translations:
- `tab.activity`: "Historia"
- `activity.noActivity`: "Brak zarejestrowanej aktywnosci dla tej sprawy."
- `activity.loadError`: "Nie udalo sie zaladowac historii aktywnosci."
- Action labels in Polish: "Sprawa utworzona", "Sprawa zaktualizowana", "Zmiana statusu", "Dodano dokument", "Wygenerowano dokument", "Wyeksportowano dokument", "Dodano strone", "Dodano termin", "Zastosowano zmiany AI"

## Success Criteria Mapping

- 5th tab after Chat: TABS array position 4 (index) with key "activity"
- Reverse chronological: API returns entries, component renders them as-is (API already returns newest first based on typical audit log ordering; if not, sort client-side by `created_at` desc)
- Human-readable labels: ACTION_LABELS mapping to i18n keys
- Fallback for unknown actions: raw string display
- Empty/loading/error states: all three handled
- i18n keys in both en.json and pl.json under `LegalHub.activity.*`
- `npx tsc --noEmit` passes: all types properly defined

## Risks

- API may not return entries sorted newest-first. Mitigation: sort client-side by `created_at` descending regardless.
- `details` JSON structure may vary per action type. Mitigation: wrap parsing in try/catch, gracefully return null on failure.
