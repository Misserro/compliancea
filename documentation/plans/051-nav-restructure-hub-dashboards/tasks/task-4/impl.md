## Task 4 Complete — Sidebar collapsible category navigation

### Files Modified

- **Modified:** `src/components/layout/app-sidebar.tsx` (full sidebar refactor)
  - Added imports: `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `@/components/ui/collapsible`; `SidebarMenuAction`, `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`, `SidebarSeparator` from `@/components/ui/sidebar`; `ChevronRight` from `lucide-react`
  - Removed import: `Separator` from `@/components/ui/separator` (replaced by `SidebarSeparator`)
  - Replaced three flat `SidebarGroup` hub sections (Contract Hub, Legal Hub, Documents Hub) with a single `SidebarGroup` containing three `Collapsible`-powered `SidebarMenuItem` entries
  - Each category: `SidebarMenuButton` link to hub dashboard + `CollapsibleTrigger` chevron toggle + `CollapsibleContent` with `SidebarMenuSub` sub-pages
  - All three categories `defaultOpen` (expanded on first load)
  - Contract category: links to `/contracts` (dashboard), sub-pages `/contracts/list` and `/contracts/obligations`
  - Legal category: links to `/legal` (dashboard), sub-pages `/legal/cases`, `/legal/templates`, `/legal/firm` (admin/owner only with `SidebarSeparator`)
  - Documents category: links to `/documents` (dashboard), sub-pages `/documents/library` and `/documents/ai-tools`
  - Permission gates preserved: `canView('contracts') && canAccessFeature('contracts')`, `canView('legal_hub') && canAccessFeature('legal_hub')`, `canView('documents')`
  - Overdue obligations badge preserved on `/contracts/obligations` sub-item
  - My Law Firm sub-item gated by `orgRole !== "member"` with `SidebarSeparator className="my-1"` above it
  - Dashboard group, Workspace group, and Footer unchanged

- **Modified:** `messages/en.json` (Sidebar namespace)
  - Added: `"contract": "Contract"`, `"legal": "Legal"`
  - Old keys (`contractHub`, `legalHub`, `documentsHub`) left in place for Task 5 cleanup

- **Modified:** `messages/pl.json` (Sidebar namespace)
  - Added: `"contract": "Umowy"`, `"legal": "Prawo"`
  - Old keys left in place for Task 5 cleanup

### TypeScript Status

Zero errors in source files. The only TS errors are in `.next/types/validator.ts` (stale build cache referencing old routes removed by Tasks 1-3). Running `next build` or deleting `.next/` will clear these.

### Integration Notes

- INTEGRATION: Task 5 (internal link sweep) should remove `contractHub`, `legalHub`, `documentsHub` from both `messages/en.json` and `messages/pl.json`
- INTEGRATION: Task 5 should verify no remaining references to `/legal-hub`, `/obligations`, `/document-tools` in sidebar (all removed in this task)
- GOTCHA: `SidebarMenuSub` has `group-data-[collapsible=icon]:hidden` built in, so sub-items automatically hide when sidebar is collapsed to icon mode
- GOTCHA: `SidebarMenuAction` has `group-data-[collapsible=icon]:hidden` built in, so chevron toggles automatically hide in icon mode
- GOTCHA: Documents category and Documents Library sub-item both use `tSidebar("documents")` key — same label is intentional per plan
