# Task 2 — Implementation Plan: Strings: App constants + sidebar navigation

## Scope

Populate `CaseStatuses`, `CaseTypes`, `DocCategories`, and `Sidebar` namespaces in both message files. Remove `LEGAL_CASE_STATUS_DISPLAY` and `LEGAL_CASE_TYPE_LABELS` from `constants.ts`. Update `CASE_DOCUMENT_CATEGORIES` to use translation keys. Replace all hardcoded sidebar navigation labels with `t()` calls.

## Files to Modify

### 1. `messages/en.json` — populate namespaces

**CaseStatuses** — add all 11 statuses matching `LEGAL_CASE_STATUSES` array:
- new, intake, analysis, draft_prepared, filed, awaiting_response, hearing_scheduled, judgment_received, appeal, active, closed

**CaseTypes** — add all 6 types matching `LEGAL_CASE_TYPES` array:
- civil, criminal, administrative, labor, family, commercial

**DocCategories** — add all 9 categories matching `CASE_DOCUMENT_CATEGORIES` array:
- pleadings, evidence, correspondence, court_decisions, powers_of_attorney, contracts_annexes, invoices_costs, internal_notes, other

**Sidebar** — add all navigation labels:
- dashboard, contracts, obligations, documents, policies, analyzeProcess, askLibrary, settings, organization, members, admin, cases, templates, myLawFirm, contractHub, legalHub, documentsHub

### 2. `messages/pl.json` — same keys, Polish translations

### 3. `src/lib/constants.ts` — remove display-string maps
- DELETE `LEGAL_CASE_STATUS_DISPLAY` (lines 156-168)
- DELETE `LEGAL_CASE_TYPE_LABELS` (lines 184-191)
- MODIFY `CASE_DOCUMENT_CATEGORIES` — remove `label` field, keep only `value` (since labels come from translations now). Change type to simple string array.

### 4. `src/components/layout/app-sidebar.tsx` — translate all nav labels
- Add `const tSidebar = useTranslations("Sidebar");`
- Replace all hardcoded strings: Dashboard, Contracts, Obligations, Documents, Policies, "Analyze & Process", "Ask Library", Settings, Organization, Members, "Admin Panel", Sprawy, Szablony, "Moja kancelaria"
- Replace group labels: "Contract Hub", "Legal Hub", "Documents Hub"

### 5. Components importing `LEGAL_CASE_STATUS_DISPLAY` — switch to `useTranslations('CaseStatuses')`
- `src/components/legal-hub/case-status-section.tsx` — add `useTranslations('CaseStatuses')`, replace all `LEGAL_CASE_STATUS_DISPLAY[x]` with `tStatus(x)`
- `src/components/legal-hub/case-header.tsx` — add `useTranslations('CaseStatuses')` and `useTranslations('CaseTypes')`, replace lookups
- `src/components/legal-hub/case-card.tsx` — same pattern
- `src/components/legal-hub/legal-hub-dashboard.tsx` — same pattern
- `src/components/legal-hub/firm-stats-panel.tsx` — same pattern

### 6. Components importing `LEGAL_CASE_TYPE_LABELS` — switch to `useTranslations('CaseTypes')`
- `src/components/legal-hub/case-metadata-form.tsx` — add `useTranslations('CaseTypes')`, replace `LEGAL_CASE_TYPE_LABELS[x]` with `tType(x)`
- `src/components/legal-hub/new-case-dialog.tsx` — same pattern

### 7. Components importing `CASE_DOCUMENT_CATEGORIES` — switch to `useTranslations('DocCategories')`
- `src/components/legal-hub/case-documents-tab.tsx` — add `useTranslations('DocCategories')`, change `getCategoryLabel()` to use `tCat(value)`, change filter chip labels to use `tCat(cat.value)`. Import `CASE_DOCUMENT_CATEGORIES` still needed for the value array (iteration), but labels come from `tCat()`.
- `src/components/legal-hub/add-case-document-dialog.tsx` — same pattern for the Select dropdown

## Strategy for CASE_DOCUMENT_CATEGORIES

Instead of removing the array entirely (it's used for iteration), I will change it from `{ value, label }[]` to a simple `string[]` (just values). Components will use `useTranslations('DocCategories')` to get the display label. This is clean and matches the CaseStatuses/CaseTypes pattern.

Actually, looking more carefully, `CASE_DOCUMENT_CATEGORIES` is typed with `as const` and used for iteration. The simplest approach that avoids changing the type signature everywhere is to keep the array structure but remove the hardcoded Polish labels. I'll change it to just a string array:

```ts
export const CASE_DOCUMENT_CATEGORIES = [
  "pleadings", "evidence", "correspondence", "court_decisions",
  "powers_of_attorney", "contracts_annexes", "invoices_costs",
  "internal_notes", "other",
] as const;
```

Components that iterate over it will access `cat` directly (string) instead of `cat.value`, and use `tCat(cat)` for the label.

## Risks

- Variable naming: some components use `t` for both translation function and loop variable (e.g., `LEGAL_CASE_TYPES.map((t) => ...)`). I'll use `tStatus`, `tType`, `tCat` for translation functions to avoid shadowing.
- The `legal-hub-dashboard.tsx` uses `t` as a loop variable in its map — need to rename the translation function to avoid conflict.
- `case-metadata-form.tsx` also uses `t` as a loop variable in `form.tags.split(",").map((t) => t.trim())` and `LEGAL_CASE_TYPES.map((t) => ...)`.

## Success Criteria Verification
- Sidebar labels: all replaced with `t()` calls
- CaseStatuses: all 11 status display strings in both en.json and pl.json
- CaseTypes: all 6 type labels in both files
- DocCategories: all 9 category labels in both files
- TypeScript compiles clean: no references to removed constants
