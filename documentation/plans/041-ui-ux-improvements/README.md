# Plan 041 — UI/UX Improvements

## Goal

Modernize the visual design system and close key UX gaps across the application:
1. Introduce an indigo primary color, dark navy sidebar in light mode, and slightly larger border radius
2. Fix sidebar footer readability on dark sidebar background; standardize dashboard max-width; add active nav left-border accent
3. Add meaningful empty states, dashboard error state, and interactive row affordance to dashboard panels

---

## Background

The current design uses a fully achromatic (zero-chroma) token set — every UI element is gray, with no brand color. The sidebar background in `:root` is near-white (`oklch(0.985 0 0)`), making it indistinguishable from the main content area in light mode. Direction chosen: indigo accent + dark navy sidebar + refined polish.

UX gaps identified independently of visual polish:
- Dashboard API errors are silently swallowed — users see frozen skeletons with no feedback
- Empty panel states are bare muted text with no icon or visual context
- Clickable panel rows lack affordance — nothing signals the row is interactive beyond a faint hover tint

---

## Architecture

- All color tokens live in `src/app/globals.css` `:root` and `.dark` blocks — single source of truth
- Sidebar uses `--sidebar-*` CSS vars: `bg-sidebar`, `text-sidebar-foreground`, `text-sidebar-accent-foreground` — `:root` controls light mode sidebar appearance
- Sidebar footer currently uses `text-muted-foreground` and `hover:text-foreground` (main app tokens) — unreadable on dark sidebar background; must switch to `text-sidebar-foreground/*` tokens
- Dashboard error state: `useState` for error flag; `.catch()` sets it instead of swallowing silently
- Empty state pattern: lucide icon centered above existing text — inline JSX, no new component
- Row affordance: `group` on the row `<button>` + `<ChevronRight>` with `opacity-0 group-hover:opacity-100 transition-opacity`

---

## Tasks

- [ ] **Task 1 — Design token refresh (`globals.css`)**
- [ ] **Task 2 — Sidebar footer fix + layout standardization**
- [ ] **Task 3 — Dashboard UX: error state, empty states, row affordance**

Task 2 and Task 3 both depend on Task 1 (sidebar tokens must exist before fixing footer colors). Tasks 2 and 3 are independent of each other and run in parallel once Task 1 completes.

---

## Task 1 — Design token refresh

**Description:**
Update `src/app/globals.css` to introduce indigo primary, dark navy sidebar in `:root`, and border radius `0.75rem`. Update `.dark` primary/ring/accent to match indigo. Leave all other `.dark` tokens (background, foreground, card, muted, destructive) unchanged.

**Files:**
- `src/app/globals.css`

**Token changes — `:root`:**
```
--radius: 0.75rem                              (was 0.625rem)
--primary: oklch(0.37 0.16 264)                (indigo — was achromatic dark)
--primary-foreground: oklch(0.98 0 0)          (white text on indigo)
--ring: oklch(0.55 0.18 264)                   (indigo focus ring — was achromatic gray)
--accent: oklch(0.94 0.03 264)                 (soft indigo tint hover — was achromatic)
--accent-foreground: oklch(0.25 0.08 264)      (deep indigo on accent bg)
--sidebar: oklch(0.18 0.025 264)               (dark navy — was near-white)
--sidebar-foreground: oklch(0.94 0 0)          (near-white text)
--sidebar-primary: oklch(0.55 0.18 264)        (medium indigo active/primary state)
--sidebar-primary-foreground: oklch(0.98 0 0)  (white)
--sidebar-accent: oklch(0.25 0.03 264)         (slightly lighter navy for hover)
--sidebar-accent-foreground: oklch(0.94 0 0)   (near-white)
--sidebar-border: oklch(0.28 0.03 264)         (subtle navy border)
--sidebar-ring: oklch(0.55 0.18 264)           (indigo ring)
```

**Token changes — `.dark`:**
```
--primary: oklch(0.65 0.18 264)                (lighter indigo for dark bg — was near-white achromatic)
--primary-foreground: oklch(0.10 0.02 264)     (dark base text on lit indigo button)
--ring: oklch(0.65 0.18 264)                   (indigo focus ring)
--accent: oklch(0.30 0.04 264)                 (dark indigo tint hover)
--accent-foreground: oklch(0.92 0.01 264)
```

All other `.dark` tokens remain unchanged.

**Patterns:**
- `src/app/globals.css` — read first to understand current token structure

**Success criteria:**
- Primary buttons render with indigo fill in light mode; lighter indigo in dark mode
- Sidebar has dark navy background in light mode (not white/near-white)
- Border radius on cards and buttons is visibly slightly larger than before
- No visual regressions on destructive, muted, card, popover, border tokens
- File compiles without errors (valid OKLch values, no syntax issues)

---

## Task 2 — Sidebar footer fix + layout standardization

**Description:**
Fix sidebar footer text colors that are unreadable against the new dark navy sidebar background. Standardize dashboard max-width to match the wider content pages. Add an active sidebar item left-border accent via a global CSS rule.

**Files:**
- `src/components/layout/app-sidebar.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/globals.css`

**Changes:**

`app-sidebar.tsx` — `SidebarFooter` block (around lines 360–388):
- `text-xs text-muted-foreground truncate` (org name / email sub-line) → `text-xs text-sidebar-foreground/60 truncate`
- `text-muted-foreground hover:text-foreground` on the sign-out Button → `text-sidebar-foreground/70 hover:text-sidebar-foreground`
- `text-muted-foreground hover:text-foreground` on the theme-toggle Button → `text-sidebar-foreground/70 hover:text-sidebar-foreground`
- `border-b mb-1` on the user info container → add `border-sidebar-border`

`dashboard/page.tsx`:
- `max-w-5xl` → `max-w-6xl` (line 88)

`globals.css` — append inside `@layer base`:
```css
/* Active sidebar nav item — left accent border */
[data-sidebar="menu-button"][data-active="true"] {
  border-left: 2px solid var(--sidebar-primary);
  padding-left: calc(0.5rem - 2px);
}
```
Read `src/components/ui/sidebar.tsx` to confirm the `SidebarMenuButton` base padding value before computing the offset.

**Patterns:**
- `src/components/layout/app-sidebar.tsx` — read to find exact class strings to replace
- `src/components/ui/sidebar.tsx` — read `SidebarMenuButton` to find base `px-` value
- `src/app/(app)/dashboard/page.tsx` — read to confirm max-width line

**Success criteria:**
- Sidebar footer text (user name, org name, sign out link, theme toggle, language switcher) is readable on dark navy sidebar background in light mode
- Dashboard page uses `max-w-6xl` wrapper
- Active nav items show a left indigo border accent with no text shift (padding compensates)
- No regressions in sidebar layout or `SidebarMenuButton` sizing

---

## Task 3 — Dashboard UX: error state, empty states, row affordance

**Description:**
Three targeted UX improvements to `src/app/(app)/dashboard/page.tsx`:
1. Error state — API failure shows a card with icon instead of frozen skeletons
2. Empty state design — every panel "no data" state gains a lucide icon above the message
3. Row affordance — a `ChevronRight` icon appears on hover for every clickable panel row

**Files:**
- `src/app/(app)/dashboard/page.tsx`
- `messages/en.json`
- `messages/pl.json`

**Changes:**

**1. Error state:**
- Add `const [error, setError] = useState(false);`
- In `.catch()` block: `setError(true)` (remove the `/* silent */` comment)
- Render below the KPI grid (or instead of panels when `error && !loading`):
  ```tsx
  {error && !loading && (
    <div className="rounded-xl border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium">{t("errorTitle")}</p>
      <p className="text-xs text-muted-foreground mt-1">{t("errorSub")}</p>
    </div>
  )}
  ```
  `AlertTriangle` is already imported.
- Add i18n keys: `Dashboard.errorTitle` and `Dashboard.errorSub`

**2. Empty state design — all 5 instances:**
Replace bare `<p className="px-5 py-8 text-xs text-muted-foreground text-center">...</p>` with:
```tsx
<div className="px-5 py-8 text-center">
  <Icon className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
  <p className="text-xs text-muted-foreground">{t("...")}</p>
</div>
```
Icon assignments:
- `noUpcomingDeadlines` (obligations panel) → `CalendarCheck`
- `noContractsExpiring` (contracts panel) → `FileCheck`
- `noUpcomingCaseDeadlines` (court deadlines panel) → `CalendarCheck`
- `noRecentCases` (recent cases panel) → `Scale` (already imported)

Add imports: `CalendarCheck`, `FileCheck` from `lucide-react`.

**3. Row affordance:**
- Add `ChevronRight` to lucide imports
- Add `group` class to every clickable row `<button>` in all four panels
- After the existing right-side `<span>` in each row, append:
  ```tsx
  <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
  ```

**New i18n keys:**
```
Dashboard.errorTitle  — "Could not load dashboard"       / "Nie można załadować pulpitu"
Dashboard.errorSub    — "Refresh the page to try again." / "Odśwież stronę, aby spróbować ponownie."
```

**Patterns:**
- `src/app/(app)/dashboard/page.tsx` — read full file before changes

**Success criteria:**
- API failure (e.g. fetch throws) shows an error card with `AlertTriangle` icon and message; skeletons do NOT persist
- All 5 "no data" empty states show an icon above the text
- Hovering any dashboard panel row reveals a `ChevronRight` on the right side
- Loading skeleton behavior is unchanged (error state only appears after fetch settles)
- `Dashboard.errorTitle` and `Dashboard.errorSub` keys exist in both `en.json` and `pl.json`
