# Lead Notes — Plan 027: Polish Legal Templates

## Plan Overview

Add 3 professional Polish legal templates (Wezwanie do zapłaty, Pozew, Replika) as built-in system templates in the Legal Hub. Templates are seeded idempotently on startup, protected from deletion, and use only existing DB fields.

## Concurrency Decision

2 tasks, both ran in parallel. Tasks touch completely different files — no dependency between them.

## Task Dependency Graph

- Task 1: no dependencies → lib/db.js only
- Task 2: no dependencies → types.ts, template-form.tsx, template-list.tsx, route.ts only

## Key Architectural Constraints

1. Template engine (lib/templateEngine.js) requires NO changes — it already resolves any {{case.<field>}} and {{parties.<type>.<field>}} generically
2. is_system_template uses the existing ALTER TABLE try/catch migration pattern in db.js
3. Seeding is idempotent: check by name with SELECT COUNT(*) before each INSERT
4. initSystemTemplates() is a standalone function called at end of initDb()
5. Task 2 adds is_system_template?: number (optional) to CaseTemplate so it compiles cleanly regardless of DB state

## Critical Decisions

- No new DB tables or columns on legal_cases/case_parties — use only existing fields
- Manual placeholders use [UZUPEŁNIJ: ...] syntax — they pass through fillTemplate unchanged
- party.notes is the best available field for NIP/REGON (no dedicated identifier column)
- court sygnatura left as manual placeholder — reference_number is firm's internal ref
- is_system_template flag is immutable after seeding (no UI to change it)
- initSystemTemplates() uses get()/run() helpers (not raw db.exec) to correctly handle params

---

## Execution Complete

**Plan:** 027-polish-legal-templates
**Tasks:** 2 completed, 0 skipped, 0 escalated

### Tasks Completed

- **Task 1** (lib/db.js): ALTER TABLE migration at line 561; initSystemTemplates() at lines 631–755 with 3 Polish legal template HTML bodies; called from initDb() at line 623
- **Task 2** (4 files): is_system_template?: number added to CaseTemplate; 6 tokens added to VARIABLE_REFERENCE (24 total); Delete button hidden for system templates; 403 guard in DELETE API handler

### Files Modified

- `lib/db.js` — modified — ALTER TABLE migration + initSystemTemplates() seed function
- `src/lib/types.ts` — modified — is_system_template?: number on CaseTemplate
- `src/components/legal-hub/template-form.tsx` — modified — 6 new tokens in VARIABLE_REFERENCE
- `src/components/legal-hub/template-list.tsx` — modified — conditional Delete button hide
- `src/app/api/legal-hub/templates/[id]/route.ts` — modified — 403 guard on DELETE

### Test Results

- Per-task tests: 2/2 passed (reviewer + tester PASS on both tasks)
- Final gate (full suite): PASS — TypeScript clean, all checks green

### Follow-up Items

- If NIP/REGON identifiers become important, consider adding a dedicated `identifier` column to `case_parties` in a future plan
- If court sygnatura is needed as a distinct field, add `court_case_number` to `legal_cases`
- Law firm name, bank account, and lawyer title could be stored in `app_settings` for auto-prefill in a future improvement
