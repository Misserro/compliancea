# Task 3 Implementation Plan -- Strings: Legal Hub (all components)

## Summary

Extract all hardcoded Polish (and English) UI strings from every file in `src/components/legal-hub/` into the `LegalHub` namespace in `messages/en.json` and `messages/pl.json`. Replace them with `t('key')` calls. Also replace `LEGAL_CASE_STATUS_DISPLAY` / `LEGAL_CASE_TYPE_LABELS` usage with `useTranslations('CaseStatuses')` / `useTranslations('CaseTypes')`, and fix date locale calls.

## Files to Modify

### Message files
- `messages/en.json` -- add comprehensive `LegalHub` namespace (~200+ keys), plus expand `CaseStatuses` and `CaseTypes` to cover all values in constants.ts
- `messages/pl.json` -- same keys with Polish translations

### Legal Hub components (all "use client")
All 22 files in `src/components/legal-hub/`:

1. **blueprint-management.tsx** -- ~30 strings (SECTION_KEY_OPTIONS labels, toast messages, form labels, buttons)
2. **case-card.tsx** -- remove `LEGAL_CASE_STATUS_DISPLAY`/`LEGAL_CASE_TYPE_LABELS` imports, add `useTranslations('CaseStatuses')` + `useTranslations('CaseTypes')`, fix `formatDate("pl-PL")` -> locale, translate "Utworzono"
3. **case-chat-panel.tsx** -- ~15 strings (EXAMPLE_PROMPTS, headers, placeholders, error messages, indexing banner)
4. **case-deadlines-section.tsx** -- `DEADLINE_TYPE_LABELS` -> t() keys, form labels, toast messages, ~25 strings
5. **case-detail-page.tsx** -- TABS labels, error state, ~8 strings
6. **case-documents-tab.tsx** -- IndexingBadge labels, filter chips, empty states, dialog text, ~20 strings. Also uses `CASE_DOCUMENT_CATEGORIES.label` which is in Polish -- replace with `useTranslations('DocCategories')` for expanded set
7. **case-generate-tab.tsx** -- form labels, buttons, toast messages, ~20 strings
8. **case-header.tsx** -- remove display-string map imports, add translations, "Wroc do spraw", ~5 strings
9. **case-list.tsx** -- error/empty state strings, ~6 strings
10. **case-metadata-form.tsx** -- REPRESENTING_LABELS, form labels, toast messages, ~40 strings. Remove `LEGAL_CASE_TYPE_LABELS` import
11. **case-overview-tab.tsx** -- no direct strings (wrapper), skip
12. **case-parties-section.tsx** -- PARTY_TYPE_LABELS, REPRESENTATIVE_TYPES labels, form labels, toast messages, ~30 strings
13. **case-status-section.tsx** -- remove display-string imports, form labels, toast messages, ~12 strings
14. **firm-stats-panel.tsx** -- remove display-string import, stat card labels, ~5 strings
15. **member-roster.tsx** -- table headers, form labels, dialog, ~20 strings
16. **new-case-dialog.tsx** -- form labels, validation errors, buttons, ~15 strings. Remove `LEGAL_CASE_TYPE_LABELS` import
17. **template-form.tsx** -- VARIABLE_REFERENCE descriptions, form labels, ~30 strings
18. **template-list.tsx** -- table headers, empty state, confirm dialog, ~10 strings
19. **template-management-page.tsx** -- page title, buttons, ~8 strings
20. **template-wizard.tsx** -- wizard step labels, AI mode labels, navigation buttons, ~30 strings
21. **legal-hub-dashboard.tsx** -- heading, filter labels, buttons, ~10 strings. Remove display-string imports
22. **firm-dashboard.tsx** -- heading, subtitle, ~3 strings
23. **add-case-document-dialog.tsx** -- dialog title, tab labels, form labels, buttons, ~20 strings
24. **action-proposal-card.tsx** -- check for strings (likely minimal)
25. **annotated-answer.tsx** -- check for strings (likely minimal)
26. **citation-hover-card.tsx** -- check for strings (likely minimal)

## Approach

### Pattern for each client component:
```tsx
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

// Inside component:
const t = useTranslations('LegalHub');
const locale = useLocale();  // only if toLocaleDateString is used
```

For components also using CaseStatuses/CaseTypes:
```tsx
const tStatus = useTranslations('CaseStatuses');
const tType = useTranslations('CaseTypes');
const tDocCat = useTranslations('DocCategories');
```

### Date locale:
Replace `toLocaleDateString("pl-PL", ...)` and `toLocaleDateString("en-US", ...)` with `toLocaleDateString(locale, ...)`.
Replace `toLocaleString("en-US", ...)` with `toLocaleString(locale, ...)`.

### LEGAL_CASE_STATUS_DISPLAY / LEGAL_CASE_TYPE_LABELS:
Since Task 2 removes these from constants.ts, I MUST NOT import them. Instead:
- `LEGAL_CASE_STATUS_DISPLAY[status]` -> `tStatus(status)`
- `LEGAL_CASE_TYPE_LABELS[type]` -> `tType(type)`

### CASE_DOCUMENT_CATEGORIES labels:
The `label` field has Polish strings. I'll use `useTranslations('DocCategories')` with keys matching the `value` field. Need to expand DocCategories namespace with all 9 category values.

### Constant-defined label maps (DEADLINE_TYPE_LABELS, PARTY_TYPE_LABELS, etc.):
Replace with translation keys in LegalHub namespace, e.g.:
- `DEADLINE_TYPE_LABELS.hearing` -> `t('deadlineType.hearing')`
- `PARTY_TYPE_LABELS.plaintiff` -> `t('partyType.plaintiff')`
- `REPRESENTING_LABELS.plaintiff` -> `t('representing.plaintiff')`
- `SECTION_KEY_OPTIONS[].label` -> `t('sectionKey.custom')`, etc.

### CaseStatuses namespace expansion:
Current en.json only has 5 statuses. Constants has 11. Must add: `draft_prepared`, `filed`, `awaiting_response`, `hearing_scheduled`, `judgment_received`, `appeal`, `active`.

### CaseTypes namespace expansion:
Current en.json has 5 types. Constants has 6 (`commercial` is missing). Must add it.

### VARIABLE_REFERENCE descriptions in template-form.tsx:
These are help text for template variables. They should be translated. I'll add them under `LegalHub.variableDesc.*` keys.

## Message Key Structure (LegalHub namespace)

```
LegalHub:
  // Blueprint management
  blueprint.*
  sectionKey.*

  // Case card / header
  createdOn, backToCases

  // Case chat
  chat.*

  // Case deadlines
  deadlines, addDeadline, noDeadlines, ...
  deadlineType.hearing, deadlineType.response_deadline, ...
  deadlineStatus.overdue, deadlineStatus.met, ...

  // Case detail tabs
  tab.overview, tab.documents, tab.generate, tab.chat
  caseNotFound

  // Case documents
  documents, addDocument, ...
  indexing.indexed, indexing.processing, indexing.failed, indexing.error

  // Case generate
  generate.*

  // Case metadata
  metadata.*
  representing.plaintiff, representing.defendant

  // Case parties
  parties, partyType.*, representativeType.*

  // Case status
  status.*

  // Firm dashboard + stats
  firm.*

  // Member roster
  roster.*

  // New case dialog
  newCase.*

  // Template form + list + management
  template.*
  variableDesc.*

  // Template wizard
  wizard.*

  // Legal hub dashboard
  dashboard.*

  // Add case document dialog
  addDocDialog.*
```

## Risks

1. **Task 2 parallel execution**: Task 2 removes `LEGAL_CASE_STATUS_DISPLAY` and `LEGAL_CASE_TYPE_LABELS` from constants.ts. If Task 2 completes first, my code won't compile if it still imports them. My plan already avoids importing them. If Task 2 is NOT complete, existing imports will still work but I'll replace them anyway.

2. **Large number of translation keys**: ~200+ keys. Risk of typos. Mitigated by TypeScript compilation check.

3. **CaseStatuses/CaseTypes namespace conflicts with Task 2**: Task 2 owns these namespaces. I need to ensure my additions to CaseStatuses/CaseTypes don't conflict. The lead notes say "each task owns a distinct top-level namespace" -- but Task 3 needs CaseStatuses/CaseTypes which Task 2 also modifies. I'll add the missing keys that Task 2 may also add. Merge conflicts will be trivial (additive).

## Success Criteria Verification

- All Legal Hub pages switch between English and Polish
- Date formats follow active locale
- No hardcoded Polish or English strings in `src/components/legal-hub/`
- TypeScript compiles clean
