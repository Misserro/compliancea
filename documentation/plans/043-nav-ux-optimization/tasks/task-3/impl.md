## Task 3 Complete -- Sidebar + Documents: Policies filter chip, remove nav item

- Modified: `src/components/layout/app-sidebar.tsx` (line 291) -- removed the policies entry `{ title: tSidebar("policies"), href: "/policies", icon: Shield, resource: "policies", feature: "policies" }` from `docHubItems` array. Documents Hub now has 2 entries: documents, aiTools.
- Modified: `src/app/(app)/documents/page.tsx` -- added `typeFilter` state (`"all" | "policies"`), type filter logic in `filteredDocuments` useMemo (filters to `doc_type in ["policy", "procedure"]` when policies selected), chip bar UI between page header and UploadSection, updated `hasActiveFilters` and clear-filters handler to include typeFilter.
- Modified: `messages/en.json` -- added `Documents.typeFilter.all: "All"` and `Documents.typeFilter.policies: "Policies"` (after the aiTools block, around line 1128)
- Modified: `messages/pl.json` -- added `Documents.typeFilter.all: "Wszystkie"` and `Documents.typeFilter.policies: "Polityki"` (same location)

### Pattern followed

- Filter chips use the existing `Button` component with `variant="secondary"` (active) / `"ghost"` (inactive), `size="sm"`, `className="h-7 px-3 text-xs"` -- matching the plan spec exactly.
- Type filter is applied before status filter and search in the `filteredDocuments` useMemo chain, consistent with the existing filter pipeline pattern.
- i18n strings follow the nested namespace pattern used throughout the Documents section.

### Verification

- `Shield` import is preserved on line 5 -- still used by Admin panel item at line 349.
- `/policies` page (`src/app/(app)/policies/page.tsx`) was NOT touched.
- Both JSON files validated with `JSON.parse()`.

### Integration notes

- INTEGRATION: Task 5 touches `app-sidebar.tsx`. The `docHubItems` array now has 2 entries (documents, aiTools) starting at line 289. Subsequent tasks should account for this line shift.
- The `typeFilter` state defaults to `"all"`, so the page behaves identically to before when no chip is clicked.
