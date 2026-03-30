# Task 1 Plan — Add "Workspace" label to sidebar admin group

## Summary

Add a `SidebarGroupLabel` reading "Workspace" (en) / "Obszar roboczy" (pl) to the bottom navigation group in the sidebar that contains Settings, Organization, Members, and Admin Panel.

## Files to Modify

### 1. `src/components/layout/app-sidebar.tsx`

**Change:** Add `<SidebarGroupLabel>{tSidebar("workspace")}</SidebarGroupLabel>` as the first child inside the `<SidebarGroup>` at line 321 (the "Bottom standalones" group).

The group currently has no label — just `<SidebarGroup>` followed immediately by `<SidebarGroupContent>`. The label will be inserted between them, matching the pattern used by Contract Hub (line 198), Legal Hub (line 241), and Documents Hub (line 298).

No imports needed — `SidebarGroupLabel` is already imported (line 17).

### 2. `messages/en.json`

**Change:** Add `"workspace": "Workspace"` to the `Sidebar` object (after `"documentsHub"` key, line 81).

### 3. `messages/pl.json`

**Change:** Add `"workspace": "Obszar roboczy"` to the `Sidebar` object (after `"documentsHub"` key, line 81).

## Risks

- None. This is a single-line label addition with no logic changes.
- `SidebarGroupLabel` is already imported and used by three other groups.
- No permission guards or feature flags are affected.

## Success Criteria Mapping

- "Bottom navigation group shows a Workspace label above Settings/Organization/Members" -- satisfied by the `SidebarGroupLabel` insertion
- "Label renders correctly in both English and Polish" -- satisfied by en.json and pl.json additions
- "No other sidebar items are affected" -- only the bottom group is touched, no items added/removed/reordered
