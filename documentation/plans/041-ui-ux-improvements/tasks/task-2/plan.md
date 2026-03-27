# Task 2 — Implementation Plan

## Overview
Fix sidebar footer readability on dark navy sidebar, standardize dashboard max-width, add active nav item left-border accent.

## Files to Modify

### 1. `src/components/layout/app-sidebar.tsx`

**SidebarFooter block (lines 360-388):**
- Line 364: `text-xs text-muted-foreground truncate` -> `text-xs text-sidebar-foreground/60 truncate` (org name sub-line)
- Line 371: `text-muted-foreground hover:text-foreground` -> `text-sidebar-foreground/70 hover:text-sidebar-foreground` (sign-out Button)
- Line 382: `text-muted-foreground hover:text-foreground` -> `text-sidebar-foreground/70 hover:text-sidebar-foreground` (theme toggle Button)
- Line 362: `border-b mb-1` -> `border-b border-sidebar-border mb-1` (user info container div)

### 2. `src/components/layout/language-switcher.tsx`

- Line 26: `text-muted-foreground hover:text-foreground` -> `text-sidebar-foreground/70 hover:text-sidebar-foreground` (language switcher Button)

**Rationale:** The LanguageSwitcher is rendered inside SidebarFooter and has the same unreadable `text-muted-foreground` on dark navy background. Success criteria explicitly lists "language switcher" as needing to be readable.

### 3. `src/app/(app)/dashboard/page.tsx`

- Line 88: `max-w-5xl` -> `max-w-6xl` (main wrapper div)

### 4. `src/app/globals.css`

Append inside `@layer base` block (before the closing `}`), after the `body` rule:

```css
/* Active sidebar nav item -- left accent border */
[data-sidebar="menu-button"][data-active="true"] {
  border-left: 2px solid var(--sidebar-primary);
  padding-left: calc(0.5rem - 2px);
}
```

**Padding math:** `SidebarMenuButton` uses `p-2` (= `0.5rem` all sides). The 2px border-left is compensated by reducing padding-left by 2px: `calc(0.5rem - 2px)` = `0.5rem - 2px` = `6px`, so total left space = 2px border + 6px padding = 8px = 0.5rem. No text shift.

## Risks / Trade-offs
- The LanguageSwitcher fix is a separate file from what's listed in the task spec, but it's explicitly called out in the success criteria. The component is tightly scoped (only used in sidebar footer).
- The CSS attribute selector for active nav items is global but scoped by data attributes, so no collision risk.

## Success Criteria Verification
1. Sidebar footer text readable on dark navy: All `text-muted-foreground` in footer replaced with `text-sidebar-foreground/*` tokens
2. Dashboard uses `max-w-6xl`: Direct string replacement
3. Active nav left indigo border with no text shift: CSS rule with exact padding compensation
4. No regressions in sidebar layout or SidebarMenuButton sizing: Only class string replacements and a CSS rule with compensating padding
