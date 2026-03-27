# Task 2 Implementation Notes — Sidebar footer fix + layout standardization

## Changes Made

### 1. `src/components/layout/app-sidebar.tsx` (4 edits in SidebarFooter block, lines 360-392)
- Line 362: Added `border-sidebar-border` to user info container div (was `border-b mb-1`, now `border-b border-sidebar-border mb-1`)
- Line 364: Changed org name sub-line from `text-muted-foreground` to `text-sidebar-foreground/60`
- Line 371: Changed sign-out Button from `text-muted-foreground hover:text-foreground` to `text-sidebar-foreground/70 hover:text-sidebar-foreground`
- Line 382: Changed theme toggle Button from `text-muted-foreground hover:text-foreground` to `text-sidebar-foreground/70 hover:text-sidebar-foreground`

### 2. `src/components/layout/language-switcher.tsx` (1 edit)
- Line 26: Changed from `text-muted-foreground hover:text-foreground` to `text-sidebar-foreground/70 hover:text-sidebar-foreground`
- Rationale: This component renders inside SidebarFooter and was explicitly listed in the success criteria

### 3. `src/app/(app)/dashboard/page.tsx` (1 edit)
- Line 88: Changed `max-w-5xl` to `max-w-6xl` on the main wrapper div

### 4. `src/app/globals.css` (1 addition inside `@layer base`)
- Added CSS rule at lines 123-127 targeting `[data-sidebar="menu-button"][data-active="true"]`
- Applies `border-left: 2px solid var(--sidebar-primary)` and `padding-left: calc(0.5rem - 2px)`
- Padding math: SidebarMenuButton base is `p-2` (0.5rem). The 2px border + calc(0.5rem - 2px) padding = 0.5rem total left space, so no text shift.

## Integration Notes
- INTEGRATION: Task 3 also modifies `dashboard/page.tsx` but only touches panel content (error state, empty states, row affordance) — no conflict with the `max-w-6xl` change on the wrapper div.
- The LanguageSwitcher fix is scoped to the single component file. If this component is ever used outside the sidebar, the `text-sidebar-foreground` tokens would need to be parameterized. Currently it is only used in SidebarFooter.
