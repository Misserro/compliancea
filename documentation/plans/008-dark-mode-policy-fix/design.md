# Dark Mode + Policy In-Force Fix — Design

**Date:** 2026-02-26

---

## 1. Dark Mode

### Goal
Allow users to switch between light, dark, and system-default themes. Preference is persisted across sessions.

### Architecture
- Use `next-themes` package (`npm install next-themes`)
- CSS variables for both themes are already defined in `globals.css` (`:root` for light, `.dark` for dark)
- `next-themes` applies the `.dark` class to `<html>` based on user preference
- `defaultTheme="system"` so first-time users automatically follow their OS preference

### Components
- **`ThemeProvider`** wraps `<body>` in `layout.tsx`
- **Theme toggle button** in `AppSidebar` footer — `Sun` icon in light mode, `Moon` icon in dark mode
- Toggle cycles: light → dark → system

### Files
| File | Change |
|------|--------|
| `package.json` | Add `next-themes` |
| `src/app/layout.tsx` | Wrap with `ThemeProvider`, add `suppressHydrationWarning` to `<html>` |
| `src/components/layout/app-sidebar.tsx` | Add `SidebarFooter` with `Sun`/`Moon` toggle using `useTheme` |

---

## 2. Policy "In Force" Bug Fix

### Goal
Policies tagged as "In Force" by the AI should display as "Active" in the Policies tab, not "Archived".

### Root Cause
The `in_force` DB field has two possible "active" values:
- `"in_force"` — written by the AI auto-tagger (`lib/autoTagger.js`)
- `"true"` — written programmatically when a document is activated via the Replace workflow (`lib/db.js`)

The Policies tab checks only for `"true"`, missing the `"in_force"` value.

### Fix
Add a shared `isInForce(value: string | null): boolean` utility that handles both values. Replace all raw comparisons across the Policies tab.

```ts
// src/lib/utils.ts — add this helper
export function isInForce(value: string | null | undefined): boolean {
  return value === "true" || value === "in_force";
}
```

### Files
| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add `isInForce` helper |
| `src/app/policies/page.tsx` | Replace `d.in_force === "true"` with `isInForce(d.in_force)` (filter + sort) |
| `src/components/policies/policies-list.tsx` | Replace `doc.in_force === "true"` with `isInForce(doc.in_force)` |
| `src/components/policies/version-history-panel.tsx` | Replace `v.in_force === "true"` with `isInForce(v.in_force)` |

---

## Non-goals
- No changes to the DB schema or `in_force` values stored
- No theming changes beyond adding the toggle (all CSS variables already exist)
- No changes to other tabs (Documents badge already handles both values correctly)
