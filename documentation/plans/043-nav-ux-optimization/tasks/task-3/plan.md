# Task 3 Plan -- Sidebar + Documents: Policies filter chip, remove nav item

## Overview

Remove the "Policies" nav item from the Documents Hub sidebar group and add type-filter chips ("All" / "Policies") to the Documents page that filter the document list client-side. The `/policies` page remains untouched.

## Files to modify

### 1. `src/components/layout/app-sidebar.tsx`

**Change:** Remove the policies entry from the `docHubItems` array (line 291).

Before:
```tsx
const docHubItems = [
  { title: tSidebar("documents"), href: "/documents", icon: FileText, resource: "documents", feature: "" },
  { title: tSidebar("policies"), href: "/policies", icon: Shield, resource: "policies", feature: "policies" },
  { title: tSidebar("aiTools"), href: "/document-tools", icon: Layers, resource: "documents", feature: "" },
]
```

After:
```tsx
const docHubItems = [
  { title: tSidebar("documents"), href: "/documents", icon: FileText, resource: "documents", feature: "" },
  { title: tSidebar("aiTools"), href: "/document-tools", icon: Layers, resource: "documents", feature: "" },
]
```

**IMPORTANT:** Keep the `Shield` import on line 5 -- it is still used by the Admin panel item (line 350).

### 2. `src/app/(app)/documents/page.tsx`

**Changes:**
- Add `typeFilter` state: `useState<"all" | "policies">("all")`
- Extend `filteredDocuments` useMemo to filter by `doc_type` when `typeFilter === "policies"` (hardcoded `["policy", "procedure"]`)
- Update `hasActiveFilters` to include typeFilter
- Add type-filter chip bar between the page header and the UploadSection
- Chips use existing `Button` component with `variant="secondary"` (active) / `"ghost"` (inactive), `size="sm"`, `className="h-7 px-3 text-xs"`
- "Clear filters" button also resets typeFilter to "all"

### 3. `messages/en.json`

**Change:** Add `typeFilter` object inside the `Documents` namespace, after the `aiTools` block (around line 1123):

```json
"typeFilter": {
  "all": "All",
  "policies": "Policies"
}
```

### 4. `messages/pl.json`

**Change:** Add equivalent Polish strings in the same location:

```json
"typeFilter": {
  "all": "Wszystkie",
  "policies": "Polityki"
}
```

## How success criteria are satisfied

1. **Sidebar Documents Hub shows 3 items: Documents, AI Tools** -- policies entry removed from docHubItems
2. **Documents page has two chips: "All" and "Policies"** -- chip bar rendered between header and UploadSection
3. **"Policies" chip filters list to policy/procedure doc types** -- filteredDocuments checks `doc_type in ["policy", "procedure"]`
4. **"All" chip clears the type filter** -- sets typeFilter to "all"
5. **/policies URL still works** -- no changes to `src/app/(app)/policies/page.tsx`
6. **Labels render correctly in both English and Polish** -- i18n strings added to both message files

## Risks

- None significant. All changes are additive except removing one line from docHubItems.
- Shield import must be preserved -- verified it is used by Admin panel at line 350.
