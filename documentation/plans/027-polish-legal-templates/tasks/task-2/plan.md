# Task 2 — Variable Reference Panel + System Template Protection

## Plan

### 1. `src/lib/types.ts` — Add `is_system_template` to CaseTemplate
- Add `is_system_template?: number;` after `is_active: number;` (line 366)
- Optional field so existing code compiles cleanly

### 2. `src/components/legal-hub/template-form.tsx` — Extend VARIABLE_REFERENCE
- Append 6 new entries after the last existing entry (line 59, before `];`):
  - `{{parties.plaintiff.notes}}` — Dodatkowe dane powoda (np. NIP/REGON)
  - `{{parties.defendant.notes}}` — Dodatkowe dane pozwanego (np. NIP/REGON)
  - `{{parties.representative.representative_address}}` — Adres pelnomocnika / kancelarii
  - `{{case.procedure_type}}` — Tryb postepowania
  - `{{case.case_type}}` — Typ sprawy
  - `{{case.internal_number}}` — Wewnetrzny numer akt
- Total tokens after change: 18 existing + 6 new = 24

### 3. `src/components/legal-hub/template-list.tsx` — Hide Delete for system templates
- Wrap the Delete `<Button>` (lines 147-155) in `{!template.is_system_template && (...)}`
- Edit button remains available for all templates

### 4. `src/app/api/legal-hub/templates/[id]/route.ts` — API protection
- **DELETE handler**: After the `existing` null check (line 167), add 403 guard:
  ```ts
  if (existing.is_system_template === 1) {
    return NextResponse.json({ error: "System templates cannot be deleted" }, { status: 403 });
  }
  ```
- **PATCH handler**: Add comment at line 93 documenting that `is_system_template` is intentionally excluded from `allowedKeys`

## Risk Assessment
- All changes are additive — no existing behavior modified
- `is_system_template` is optional in TypeScript, so code compiles regardless of DB migration state
- No cross-file dependencies between the 4 changes
