# Task 2 Complete — Bug Fixes: Chat Status Enum + Template Case-Type Filtering

## Changes

### Bug A: updateCaseStatus tool enum
- **Modified:** `src/app/api/legal-hub/cases/[id]/chat/route.ts`
  - Added import of `LEGAL_CASE_STATUSES` from `@/lib/constants` (line 19)
  - Replaced hardcoded 6-value enum `["active", "signed", "unsigned", "terminated", "closed", "other"]` with `[...LEGAL_CASE_STATUSES]` (line 123)
  - The spread converts the `readonly` tuple to a plain `string[]` for the Anthropic tool JSON schema
  - Now exposes all 11 statuses: new, intake, analysis, draft_prepared, filed, awaiting_response, hearing_scheduled, judgment_received, appeal, active, closed

### Bug B: Generate tab template filtering
- **Modified:** `src/components/legal-hub/case-generate-tab.tsx`
  - Added filtering logic after template fetch (lines 62-74)
  - Parses `applicable_case_types` (JSON string field) and checks if the current case's `case_type` is included
  - Templates with null, unparseable, empty string, or empty array `applicable_case_types` pass through (shown for all case types)
  - Only templates with a non-empty array that does NOT include the case type are filtered out

## Verification
- `npx tsc --noEmit` passes cleanly
- No new i18n keys added (none required)
- No files outside task scope modified
