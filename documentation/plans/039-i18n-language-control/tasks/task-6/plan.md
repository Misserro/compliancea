# Task 6 — Implementation Plan: Documents Hub i18n

## Scope

Populate the `Documents` namespace in `messages/en.json` and `messages/pl.json` with comprehensive keys for:
- Documents page (`src/app/(app)/documents/page.tsx`)
- Document Tools / Analyze & Process page (`src/app/(app)/document-tools/page.tsx`)
- Ask Library page (`src/app/(app)/ask/page.tsx`)
- Policies page (`src/app/(app)/policies/page.tsx`)
- All supporting components in `src/components/documents/`, `src/components/analyze/`, `src/components/policies/`

## Files to Modify

### Message files
1. **`messages/en.json`** -- expand `Documents` namespace from 5 stub keys to full coverage
2. **`messages/pl.json`** -- expand `Documents` namespace with Polish translations

### Page files (add `useTranslations` import + replace hardcoded strings)
3. **`src/app/(app)/documents/page.tsx`** -- client component, `useTranslations('Documents')`
4. **`src/app/(app)/document-tools/page.tsx`** -- server component, `getTranslations('Documents')`
5. **`src/app/(app)/ask/page.tsx`** -- client component, `useTranslations('Documents')`
6. **`src/app/(app)/policies/page.tsx`** -- client component, `useTranslations('Documents')`

### Component files under `src/components/documents/`
7. **`upload-section.tsx`** -- "Upload Document", "Category", "No Category", "Uploading...", "Upload", validation messages
8. **`action-bar.tsx`** -- "Scan Server Folder", "Scan Google Drive", "Process All", "Retag All", "Show All Details", "Hide Details", scanning/processing states
9. **`document-list.tsx`** -- "No documents found.", "Try adjusting...", "Uncategorized", "{count} document(s)"
10. **`document-card.tsx`** -- "{word_count} words", "Not processed", "Tags ({n})", "Category:", "Client:", "Added:", "Unassigned", titles, confirm dialog
11. **`document-badges.tsx`** -- "In Force", "Archived", "Legal Hold", "Auto-tagged", "GDrive", "Local"
12. **`metadata-dialog.tsx`** -- "Edit Metadata", labels (Document Type, Category, Jurisdiction, Sensitivity, Status, Enforcement, Language, Client/Counterparty, Tags), statuses (Draft, In Review, Approved, Archived), enforcement options, "Saving...", "Save Changes", "Cancel"
13. **`contract-action-dialog.tsx`** -- "Contract Management", "Loading...", "Client:", "Total Obligations", "Overdue", "Next deadline:", action labels, "View All Obligations", "Close", "Contract not found.", confirm messages

### Component files under `src/components/analyze/`
14. **`analyzer-section.tsx`** -- output option labels (Full Translation, Summary, Key Points, Department To-Do List), "Document (PDF or DOCX)", "Outputs", "Target Language", "Analyzing...", "Analyze", "Clear", status messages, result section headings, "Export as DOCX", "Export as CSV", "Hide/Show Translation", "No translated text...", "No summary...", "No key points...", "No tasks.", "No to-dos...", "Source:"
15. **`desk-section.tsx`** -- mode labels: "Regulator Query", "Questionnaire", "NDA Review"
16. **`regulator-section.tsx`** -- "Regulator query document (PDF or DOCX)", "Outputs", "Cross-Reference", "Generate Response Template", "Pre-fill with library data", "Select library documents for cross-reference", "Target Language", "Analyzing...", "Analyze", result headings (Cross-Reference Results, Response Template), table headers (Question, Answer, Found In, Confidence), "Not found", "Export as DOCX"
17. **`questionnaire-section.tsx`** -- "Questionnaire file...", "Or paste questionnaire text", placeholder, "Select library documents for answering", "Processing...", "Process Questionnaire", "Approve All", "Approve High Confidence", "Export as CSV", "Submit Approved ({n})", "Answer", "Evidence"
18. **`ask-section.tsx`** -- "Search entire library", "Include historical versions", "Select documents to search", "(active only -- {n} of {m})", "Your question", placeholder, "Searching...", "Ask", "Answer", "Sources"
19. **`document-select-list.tsx`** -- "No documents available.", "Uncategorized"
20. **`nda-section.tsx`** -- "NDA document (PDF or DOCX)", "Jurisdiction", "Select jurisdiction...", "Enter jurisdiction", placeholder, "Analyzing...", "Review NDA", "NDA Analysis Report", "Export as DOCX"

### Component files under `src/components/policies/`
21. **`policies-list.tsx`** -- "Active", "Archived", "Download", "Replace", "History", empty state text
22. **`version-history-panel.tsx`** -- "No previous versions.", "Version history", "Active", "Archived", "Diff"
23. **`pending-replacement-banner.tsx`** -- "May replace {name} (v{version})", "{n}% match", "Confirm", "Suggestion dismissed"
24. **`diff-modal.tsx`** -- "Failed to load diff", "No differences found.", "{n} change(s) found"
25. **`set-replacement-modal.tsx`** -- "Set as replacement for...", description text, "Search documents...", "No documents found.", "Cancel", "Confirm replacement"

## Message Namespace Structure

The `Documents` namespace will be organized with sub-objects for clarity:

```
Documents.title, Documents.subtitle, Documents.searchByName, Documents.allStatuses, Documents.filterByStatus, Documents.clearFilters, Documents.ofDocuments (for "{n} of {m} document(s)")

Documents.upload.*          -- upload section
Documents.actionBar.*       -- action bar
Documents.list.*            -- document list
Documents.card.*            -- document card
Documents.badges.*          -- document badges
Documents.metadata.*        -- metadata dialog
Documents.contract.*        -- contract action dialog

Documents.analyzer.*        -- analyzer section
Documents.desk.*            -- desk mode labels
Documents.regulator.*       -- regulator section
Documents.questionnaire.*   -- questionnaire section
Documents.ask.*             -- ask section
Documents.docSelect.*       -- document select list
Documents.nda.*             -- NDA section

Documents.analyze.*         -- analyze & process page headings
Documents.askPage.*         -- ask page headings

Documents.policies.*        -- policies page + list
Documents.versionHistory.*  -- version history panel
Documents.replacement.*     -- pending replacement banner
Documents.diff.*            -- diff modal
Documents.setReplacement.*  -- set replacement modal
```

## Approach

1. Add all English keys to `messages/en.json` under `Documents` namespace
2. Add all Polish keys to `messages/pl.json` under `Documents` namespace
3. For each **client** component: add `import { useTranslations } from 'next-intl'`, call `const t = useTranslations('Documents')`, replace all hardcoded strings with `t('key')` calls
4. For the **server** component (`document-tools/page.tsx`): use `import { getTranslations } from 'next-intl/server'`, `const t = await getTranslations('Documents')` -- BUT since it calls AnalyzerSection and DeskSection which are client components, only the page headings need server translation. Actually, re-checking: document-tools/page.tsx has no `"use client"` directive, so it is a server component. The headings on that page will use `getTranslations`.
5. Follow the exact pattern established in Task 3 (LegalHub): `useTranslations` in client components, `getTranslations` in server components.

## Risks

- **Large namespace**: ~200+ keys across many sub-objects. Careful not to miss any string.
- **Toast messages with dynamic content**: Some toast messages include error details from the server (e.g., `toast.error(data.error)`). Those pass-through server messages are out of scope (per architecture: "Translation of API error messages returned from the backend displayed in toasts as-is"). Only the static prefix parts get translated.
- **Status/badge strings from DB**: Some strings like `doc.status`, `doc.sensitivity`, `doc.doc_type` are stored values. These will be translated via t() lookup where feasible, or left as data values per the out-of-scope rule for user-entered content.

## Success Criteria

- All hardcoded UI strings in the 25 files listed above are replaced with `t()` calls
- `Documents` namespace in both en.json and pl.json has matching keys
- TypeScript compiles clean
- Pages fully switch language when locale changes
