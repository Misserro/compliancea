# Task 2 Complete — Strings: App constants + sidebar navigation

## Changes

### Message files
- Modified: `messages/en.json` — populated CaseStatuses (12 keys: new, intake, analysis, draft_prepared, filed, awaiting_response, hearing_scheduled, judgment_received, appeal, active, closed, archived), CaseTypes (6 keys: civil, criminal, administrative, labor, family, commercial), DocCategories (9 keys: pleadings, evidence, correspondence, court_decisions, powers_of_attorney, contracts_annexes, invoices_costs, internal_notes, other), Sidebar (17 keys: dashboard, contracts, obligations, documents, policies, analyzeProcess, askLibrary, settings, organization, members, admin, cases, templates, myLawFirm, contractHub, legalHub, documentsHub)
- Modified: `messages/pl.json` — same namespaces with Polish translations

### Constants
- Modified: `src/lib/constants.ts` — REMOVED `LEGAL_CASE_STATUS_DISPLAY` (Record<string,string>), REMOVED `LEGAL_CASE_TYPE_LABELS` (Record<string,string>), CHANGED `CASE_DOCUMENT_CATEGORIES` from `{ value, label }[]` to `string[]` (labels now come from DocCategories translations)
- KEPT: `LEGAL_CASE_STATUSES`, `LEGAL_CASE_TYPES`, `LEGAL_CASE_STATUS_COLORS`, `CASE_DOCUMENT_CATEGORY_COLORS` (not display strings)

### Sidebar
- Modified: `src/components/layout/app-sidebar.tsx` — added `const tSidebar = useTranslations("Sidebar")`, replaced ALL hardcoded nav labels (Dashboard, Contracts, Obligations, Documents, Policies, Analyze & Process, Ask Library, Settings, Organization, Members, Admin Panel, Sprawy/Cases, Szablony/Templates, Moja kancelaria/My law firm) and group labels (Contract Hub, Legal Hub, Documents Hub) with `tSidebar()` calls

### Components updated to use useTranslations instead of removed constants
- Modified: `src/components/legal-hub/case-status-section.tsx` — `useTranslations('CaseStatuses')` as `tStatus`, replaced all `LEGAL_CASE_STATUS_DISPLAY[x]` with `tStatus(x)`
- Modified: `src/components/legal-hub/case-header.tsx` — `useTranslations('CaseStatuses')` + `useTranslations('CaseTypes')`, replaced both display maps
- Modified: `src/components/legal-hub/case-card.tsx` — same pattern as case-header
- Modified: `src/components/legal-hub/legal-hub-dashboard.tsx` — `useTranslations('CaseStatuses')` as `tStatus` + `useTranslations('CaseTypes')` as `tType`, replaced both display maps. Renamed loop variable from `t` to `caseType` to avoid shadowing.
- Modified: `src/components/legal-hub/firm-stats-panel.tsx` — `useTranslations('CaseStatuses')` as `tStatus`
- Modified: `src/components/legal-hub/case-metadata-form.tsx` — `useTranslations('CaseTypes')` as `tType`, renamed loop var from `t` to `caseType`
- Modified: `src/components/legal-hub/new-case-dialog.tsx` — `useTranslations('CaseTypes')` as `tType`, renamed loop var from `t` to `caseType`
- Modified: `src/components/legal-hub/case-documents-tab.tsx` — `useTranslations('DocCategories')` as `tCat`, removed `getCategoryLabel()` helper, updated filter chip iteration to work with string array (was `cat.value`/`cat.label`, now `cat`/`tCat(cat)`)
- Modified: `src/components/legal-hub/add-case-document-dialog.tsx` — `useTranslations('DocCategories')` as `tCat`, updated Select iteration to work with string array

## INTEGRATION notes
- CASE_DOCUMENT_CATEGORIES type changed from `readonly { value: string; label: string }[]` to `readonly string[]`. Any code outside this task that accesses `.value` or `.label` on items from this array will break at compile time.
- Task 3 (LegalHub strings) should NOT import LEGAL_CASE_STATUS_DISPLAY or LEGAL_CASE_TYPE_LABELS — they no longer exist. Use `useTranslations('CaseStatuses')` / `useTranslations('CaseTypes')` instead.

## TypeScript
- `npx tsc --noEmit` passes clean with zero errors
- `grep -rn "LEGAL_CASE_STATUS_DISPLAY\|LEGAL_CASE_TYPE_LABELS" src/` returns no results
