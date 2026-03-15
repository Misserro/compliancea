# Sidebar Navigation Restructure

**Date:** 2026-03-15

## Overview

Restructure the left sidebar navigation from a flat list into grouped sections using `SidebarGroup` / `SidebarGroupLabel` primitives. Introduce two hub categories (Contract Hub, Documents Hub), expose Obligations as its own nav item, and merge the Analyze and Process pages into a single `/document-tools` page.

## Target Sidebar Structure

```
Dashboard
──────────────────────
Contract Hub          ← SidebarGroupLabel (unclickable)
  Contracts           → /contracts
  Obligations         → /obligations  (overdue badge shown here)
──────────────────────
Documents Hub         ← SidebarGroupLabel (unclickable)
  Documents           → /documents
  Policies            → /policies
  Analyze & Process   → /document-tools  (new merged page)
  Ask Library         → /ask
──────────────────────
Product Hub           → /product-hub
Settings              → /settings
Users (admin only)    → /users
```

## Components & Files Affected

### `src/components/layout/app-sidebar.tsx`
- Replace flat `navItems` array with grouped structure using `SidebarGroup` + `SidebarGroupLabel`.
- Move overdue badge from the Contracts item to the Obligations item.
- Standalone items (Dashboard, Product Hub, Settings, Users) remain outside groups.

### New page: `src/app/(app)/document-tools/page.tsx`
- Server/client hybrid page titled "Analyze & Process".
- Renders `AnalyzerSection` (single-doc AI analysis) in a Card on top.
- Fetches documents from `/api/documents` and renders `DeskSection` in a Card below.
- Merges all logic currently split between `analyze/page.tsx` and `process/page.tsx`.

### Deleted routes
- `src/app/(app)/analyze/page.tsx` — removed.
- `src/app/(app)/process/page.tsx` — removed.
- No redirects needed (these routes are not externally linked).

## Badge Logic

The `overdueCount` fetch in `AppSidebar` is unchanged. The badge renders next to the Obligations nav item instead of Contracts.

## Active State

`isActive` logic remains `pathname === item.href || pathname.startsWith(item.href + "/")` — no changes needed.

## Out of Scope

- No changes to page content beyond merging Analyze + Process.
- No collapsible/expandable group behaviour.
- No changes to routing for Contracts, Obligations, Documents, Policies, or Ask Library pages.
