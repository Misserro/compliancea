# Task 2 — Implementation Notes

## Changes Made

### 1. `src/lib/types.ts` (line 367)
- Added `is_system_template?: number` to `CaseTemplate` interface after `is_active`
- Optional field ensures backward compatibility

### 2. `src/components/legal-hub/template-form.tsx` (lines 61-66)
- Appended 6 new entries to `VARIABLE_REFERENCE` array:
  - `{{parties.plaintiff.notes}}` — Dodatkowe dane powoda (np. NIP/REGON)
  - `{{parties.defendant.notes}}` — Dodatkowe dane pozwanego (np. NIP/REGON)
  - `{{parties.representative.representative_address}}` — Adres pełnomocnika / kancelarii
  - `{{case.procedure_type}}` — Tryb postępowania
  - `{{case.case_type}}` — Typ sprawy
  - `{{case.internal_number}}` — Wewnętrzny numer akt
- Total tokens: 24 (18 existing + 6 new)

### 3. `src/components/legal-hub/template-list.tsx` (lines 147-157)
- Wrapped Delete button in `{!template.is_system_template && (...)}`
- Edit button remains visible for all templates

### 4. `src/app/api/legal-hub/templates/[id]/route.ts`
- **DELETE handler** (lines 169-174): Added 403 guard — returns `{ error: "System templates cannot be deleted" }` with status 403 when `existing.is_system_template === 1`
- **PATCH handler** (line 93): Added comment documenting that `is_system_template` is intentionally excluded from `allowedKeys`

## Verification
- TypeScript compiles cleanly (`npx tsc --noEmit` — zero errors)
- All changes are additive; no existing behavior modified
