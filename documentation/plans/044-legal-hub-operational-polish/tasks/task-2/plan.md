# Task 2 Plan — Bug Fixes: Chat Status Enum + Template Case-Type Filtering

## Bug A: updateCaseStatus tool enum

**File:** `src/app/api/legal-hub/cases/[id]/chat/route.ts`

**Current state (lines 122-129):** The `updateCaseStatus` tool definition has a hardcoded enum of 6 statuses: `["active", "signed", "unsigned", "terminated", "closed", "other"]`. These are wrong — they look like contract statuses, not case statuses.

**Fix:** Replace the enum array with all 11 values from `LEGAL_CASE_STATUSES` in `src/lib/constants.ts`: `["new", "intake", "analysis", "draft_prepared", "filed", "awaiting_response", "hearing_scheduled", "judgment_received", "appeal", "active", "closed"]`.

**Approach:** Import `LEGAL_CASE_STATUSES` from `@/lib/constants` and use `[...LEGAL_CASE_STATUSES]` as the enum value. This keeps it DRY and ensures future additions to the constant are automatically reflected. Note: The `as const` assertion on `LEGAL_CASE_STATUSES` produces a `readonly` tuple, so we spread into a plain array for the JSON schema.

## Bug B: Generate tab template filtering

**File:** `src/components/legal-hub/case-generate-tab.tsx`

**Current state (lines 56-70):** Templates are fetched from `/api/legal-hub/templates?isActive=1` and stored directly in state with no filtering by case type.

**Fix:** After fetching templates, filter them before setting state. A template is shown if:
- `applicable_case_types` is null, empty string, or empty array (applies to all case types), OR
- `applicable_case_types` (parsed as JSON array) includes `legalCase.case_type`

The `CaseTemplate.applicable_case_types` field is typed as `string` in `types.ts`, so it's a JSON string that needs parsing. Need to handle: null, empty string `""`, empty array `"[]"`, and actual array like `'["civil","commercial"]'`.

**Implementation:** Add a filter step after `data.templates` is received, before `setTemplates()`.

## Files modified

1. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — import `LEGAL_CASE_STATUSES`, replace hardcoded enum
2. `src/components/legal-hub/case-generate-tab.tsx` — filter templates by `applicable_case_types` vs `legalCase.case_type`

## Risks

- The `LEGAL_CASE_STATUSES` constant uses `as const`, producing `readonly string[]`. The Anthropic tool schema `enum` field expects `string[]`. Spreading with `[...LEGAL_CASE_STATUSES]` resolves this.
- `applicable_case_types` is a JSON string — need safe JSON.parse with fallback.
