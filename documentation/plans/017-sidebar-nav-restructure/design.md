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
  Analyze & Process   → /document-tools  (new merged page, icon: Layers)
  Ask Library         → /ask
──────────────────────
Product Hub           → /product-hub
Settings              → /settings
Users (admin only)    → /users
```

## Sidebar DOM Structure

Each group of nav items is wrapped in a `SidebarGroup > SidebarGroupContent > SidebarMenu` tree. Standalone items (Dashboard, Product Hub, Settings, Users) are wrapped in their own `SidebarGroup > SidebarGroupContent > SidebarMenu` — without a `SidebarGroupLabel` — to maintain consistent padding and spacing across all items.

```
SidebarContent
  SidebarGroup                       ← standalone: Dashboard
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem (Dashboard)
  SidebarGroup                       ← Contract Hub
    SidebarGroupLabel "Contract Hub"
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem (Contracts)
        SidebarMenuItem (Obligations + badge)
  SidebarGroup                       ← Documents Hub
    SidebarGroupLabel "Documents Hub"
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem (Documents)
        SidebarMenuItem (Policies)
        SidebarMenuItem (Analyze & Process)
        SidebarMenuItem (Ask Library)
  SidebarGroup                       ← standalone: Product Hub, Settings, Users
    SidebarGroupContent
      SidebarMenu
        SidebarMenuItem (Product Hub)
        SidebarMenuItem (Settings)
        SidebarMenuItem (Users — admin only)
```

## Components & Files Affected

### `src/components/layout/app-sidebar.tsx`
- Import `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent` from `@/components/ui/sidebar`.
- Replace the flat `navItems` array and single `SidebarMenu` with the grouped DOM structure described above.
- Move overdue badge from the Contracts item to the Obligations item (badge condition changes from `item.href === "/contracts"` to `item.href === "/obligations"`).
- Add `/obligations` as a nav item under Contract Hub (it already has a route; it was simply absent from the sidebar).
- Remove `/analyze` and `/process` from nav items; add `/document-tools` with title "Analyze & Process" and icon `Layers` (already imported).

### New page: `src/app/(app)/document-tools/page.tsx`
- **Rendering strategy:** Server Component (no `"use client"` directive on the page itself).
- Fetches documents server-side. **Note:** Next.js 14 App Router requires an absolute URL for server-side `fetch` calls (relative URLs only work on the client). Use `process.env.NEXT_PUBLIC_APP_URL` to construct the full URL, or — preferably — import the database/service layer directly and bypass the API route entirely. On fetch failure, passes an empty array to `DeskSection` (preserving current `process/page.tsx` behaviour).
- Page heading (`<h2>`): "Analyze & Process"
- Page subheading: "AI-powered document analysis and multi-mode processing tools."
- Renders two Cards stacked vertically:
  1. **Document Analyzer card** — wraps `<AnalyzerSection />` (existing client component, no props needed).
  2. **Process card** — wraps `<DeskSection documents={documents} />` (existing client component, receives documents as prop).
- Because both `AnalyzerSection` and `DeskSection` are already `"use client"`, they function as client boundaries inside the Server Component automatically.

### Deleted routes
- `src/app/(app)/analyze/page.tsx` — deleted.
- `src/app/(app)/process/page.tsx` — deleted.
- No redirects needed (these routes have no external links).

### Sub-routes under `/document-tools`
No sub-routes are planned. The `isActive` check (`pathname === item.href || pathname.startsWith(item.href + "/")`) is safe as-is.

## Badge Logic

The `overdueCount` fetch in `AppSidebar` is unchanged. The badge renders next to the Obligations nav item instead of Contracts.

## Active State

`isActive` logic remains `pathname === item.href || pathname.startsWith(item.href + "/")` — no changes needed. The `/documents` and `/document-tools` routes share the `/document` prefix but the `startsWith` check uses the full href with a trailing `/`, so there is no false-positive collision between them.

## Out of Scope

- No changes to page content beyond merging Analyze + Process.
- No collapsible/expandable group behaviour.
- No changes to routing for Contracts, Obligations, Documents, Policies, or Ask Library pages.
