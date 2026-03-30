## Task 1 Complete -- Sidebar "Workspace" label for admin group

- Modified: `src/components/layout/app-sidebar.tsx` (line 322) -- added `<SidebarGroupLabel>{tSidebar("workspace")}</SidebarGroupLabel>` as the first child of the bottom standalones `<SidebarGroup>`, before `<SidebarGroupContent>`
- Modified: `messages/en.json` (line 82) -- added `"workspace": "Workspace"` to the `Sidebar` object
- Modified: `messages/pl.json` (line 82) -- added `"workspace": "Obszar roboczy"` to the `Sidebar` object

### Pattern followed

The label uses the exact same `SidebarGroupLabel` + `tSidebar()` pattern as Contract Hub (line 198), Legal Hub (line 241), and Documents Hub (line 298). No new imports needed -- `SidebarGroupLabel` was already imported at line 17.

### Integration notes

- INTEGRATION: Tasks 2, 3, 5 all touch `app-sidebar.tsx`. The bottom standalones group now starts with a `<SidebarGroupLabel>` at line 322. Subsequent tasks should account for this line shift.
- No items were added, removed, or reordered. Only the label was inserted.
- Both JSON files validated successfully with `JSON.parse()`.
