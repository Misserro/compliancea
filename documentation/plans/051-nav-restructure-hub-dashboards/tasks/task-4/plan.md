# Task 4 — Implementation Plan: Sidebar Collapsible Category Navigation

## Overview

Refactor `app-sidebar.tsx` to replace three flat `SidebarGroup` hub sections (Contract Hub, Legal Hub, Documents Hub) with `Collapsible`-powered category items. Each category header is a navigation link to the hub dashboard AND has a chevron toggle for expanding/collapsing sub-pages. Update i18n keys in both `en.json` and `pl.json`.

## Files to Modify

### 1. `src/components/layout/app-sidebar.tsx` (full refactor)

**Imports to add:**
- `Collapsible, CollapsibleContent, CollapsibleTrigger` from `@/components/ui/collapsible`
- `SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarMenuAction, SidebarSeparator` from `@/components/ui/sidebar`
- `ChevronRight` from `lucide-react`

**Imports to remove:**
- `SidebarGroupLabel` (no longer used after refactor)
- `Layers` icon (no longer needed — AI Tools can use the same icon or we keep it for the sub-item)

**Structural changes — replace the three hub `SidebarGroup` sections (lines 196-320) with:**

A single `SidebarGroup` containing a `SidebarMenu` with three `SidebarMenuItem` entries, each wrapping a `Collapsible`:

#### Contract Category (guarded by `canView('contracts') && canAccessFeature('contracts')`)
- Category header: `<SidebarMenuButton asChild>` linking to `/contracts`, icon `ClipboardCheck`, label `tSidebar("contract")`
- `isActive` when `pathname === "/contracts" || pathname.startsWith("/contracts/")`
- Chevron: `<CollapsibleTrigger asChild><SidebarMenuAction showOnHover={false}>` with `ChevronRight` rotating 90deg on open
- Sub-pages in `<CollapsibleContent><SidebarMenuSub>`:
  - Contracts: `/contracts/list`, icon `ClipboardCheck`, label `tSidebar("contracts")`, active on `/contracts/list` or startsWith
  - Obligations: `/contracts/obligations`, icon `ListChecks`, label `tSidebar("obligations")`, active on `/contracts/obligations` or startsWith; includes overdue badge

#### Legal Category (guarded by `canView('legal_hub') && canAccessFeature('legal_hub')`)
- Category header: link to `/legal`, icon `Scale`, label `tSidebar("legal")`
- `isActive` when `pathname === "/legal" || pathname.startsWith("/legal/")`
- Sub-pages:
  - Cases: `/legal/cases`, icon `Scale`, label `tSidebar("cases")`, active on `/legal/cases` or startsWith (excluding `/legal/templates` and `/legal/firm`)
  - Templates: `/legal/templates`, icon `FileText`, label `tSidebar("templates")`
  - (admin/owner only) `<SidebarSeparator className="my-1" />` + My Law Firm: `/legal/firm`, icon `Building2`, label `tSidebar("myLawFirm")`, guarded by `sessionData?.user?.orgRole !== "member"`

#### Documents Category (guarded by `canView('documents')`)
- Category header: link to `/documents`, icon `FileText`, label `tSidebar("documents")`
- `isActive` when `pathname === "/documents" || pathname.startsWith("/documents/")`
- Sub-pages:
  - Documents: `/documents/library`, icon `FileText`, label `tSidebar("documents")` (reuse key)
  - AI Tools: `/documents/ai-tools`, icon `Layers`, label `tSidebar("aiTools")`

**Preserved sections (unchanged):**
- Dashboard group at top (lines 176-194) — no changes
- Workspace group at bottom (lines 322-361) — no changes
- Footer (lines 363-392) — no changes
- All hooks, state, effects, helper functions (lines 49-134) — no changes

**Active state logic for sub-items:**
- Each sub-item uses `pathname === "/path" || pathname.startsWith("/path/")` for exact match + child routes
- Cases sub-item: `pathname === "/legal/cases" || pathname.startsWith("/legal/cases/")` (handles case detail pages)

### 2. `messages/en.json` (Sidebar namespace)

**Add keys:**
- `"contract": "Contract"` (new category label)
- `"legal": "Legal"` (new category label)

**Remove keys (deferred to Task 5):**
- `contractHub`, `legalHub`, `documentsHub` — Task 5 handles i18n cleanup. We will stop using these keys but NOT remove them from the JSON files in this task, since Task 5 explicitly handles removal.

**Note:** `"documents": "Documents"` already exists and will serve as the category label.

### 3. `messages/pl.json` (Sidebar namespace)

**Add keys:**
- `"contract": "Umowy"` (Polish for Contract category)
- `"legal": "Prawo"` (Polish for Legal category)

**Note:** `"documents": "Dokumenty"` already exists.

## Key Design Decisions

1. **defaultOpen on all Collapsibles** — all three categories expand by default, matching the success criteria.

2. **Permission gates at category level** — the entire `SidebarMenuItem` (including collapsible and sub-items) is conditionally rendered based on `canView()` and `canAccessFeature()`, preserving existing behavior.

3. **SidebarMenuAction for chevron** — using `showOnHover={false}` so the chevron is always visible, not just on hover. The `group-data-[collapsible=icon]:hidden` class on SidebarMenuAction ensures the chevron hides in collapsed sidebar mode.

4. **SidebarSeparator before My Law Firm** — instead of the current `<Separator>`, use `<SidebarSeparator className="my-1" />` which is the proper sidebar primitive with correct styling.

5. **Documents sub-item label ambiguity** — the Documents category label and the Documents Library sub-item both use `tSidebar("documents")`. This is intentional per the plan — the category says "Documents" and the sub-item says "Documents" (meaning the library). This matches the existing key and avoids adding a new `"documentsLibrary"` key.

6. **Single SidebarGroup for all categories** — wrap all three collapsible categories in one `SidebarGroup > SidebarGroupContent > SidebarMenu` to keep them visually grouped. This replaces three separate `SidebarGroup` blocks.

7. **Chevron rotation animation** — `group-data-[state=open]/collapsible:rotate-90` on `ChevronRight` provides the expand/collapse visual indicator.

## Risks and Trade-offs

- **Route dependency** — this task assumes Tasks 1-3 have completed and the new routes (`/contracts`, `/contracts/list`, `/contracts/obligations`, `/legal`, `/legal/cases`, `/legal/templates`, `/legal/firm`, `/documents`, `/documents/library`, `/documents/ai-tools`) all exist. If any route is missing, those nav links will 404.

- **Documents sub-item label reuse** — using the same `"documents"` key for both category and library sub-item. If designers want different labels later, a new key would be needed.

## Success Criteria Mapping

| Criterion | How addressed |
|---|---|
| Three collapsible categories | Three `Collapsible` wrappers with `SidebarMenuItem` |
| Expanded by default | `defaultOpen` prop on each `Collapsible` |
| Category label navigates to hub | `SidebarMenuButton asChild` wrapping `Link` |
| Chevron toggles sub-pages | `CollapsibleTrigger` wrapping `SidebarMenuAction` |
| Sub-pages indented | `SidebarMenuSub` provides indentation via `mx-3.5 border-l px-2.5` |
| Permission/feature gates | `canView()` and `canAccessFeature()` conditionals preserved |
| Overdue badge on Obligations | Badge rendered inside obligations `SidebarMenuSubButton` |
| My Law Firm admin-only with separator | `orgRole !== "member"` check + `SidebarSeparator` |
| Sidebar collapse works | `group-data-[collapsible=icon]:hidden` on sub-menus and actions |
