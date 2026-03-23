# Task 5 Complete -- "My law firm" admin tab UI

## Changes

- **Modified:** `src/components/legal-hub/legal-hub-dashboard.tsx` -- Added tab shell following the existing manual tab pattern from `case-detail-page.tsx`. Key changes:
  - New imports: `useEffect`, `useCallback`, `Briefcase`, `Building2` icons, `FirmStatsPanel`, `MemberRoster`
  - `isAdmin` derived from `sessionData?.user?.orgRole !== 'member'`
  - `activeTab` state (`"cases"` | `"firm"`) defaults to `"cases"`
  - `firmStats` state + `fetchFirmStats` callback fetches `GET /api/legal-hub/firm-stats` when admin switches to "firm" tab
  - Tab bar (border-b with styled buttons) renders only for admin/owner -- members see no tab bar, just the case list directly
  - "Sprawy" tab wraps the existing case list content unchanged
  - "Moja kancelaria" tab renders `FirmStatsPanel` + `MemberRoster`, passing firm stats data and refresh callback

- **Created:** `src/components/legal-hub/firm-stats-panel.tsx` -- Stats display component:
  - Props: `statsByStatus`, `finalizedLast30Days`, `loading`
  - Loading state: animated skeleton placeholders
  - Renders a grid of cards: total case count, per-status counts (using `LEGAL_CASE_STATUS_DISPLAY` labels and `LEGAL_CASE_STATUS_COLORS` badge styling), and finalized-last-30-days count with green accent

- **Created:** `src/components/legal-hub/member-roster.tsx` -- Member table with edit modal:
  - Exports `FirmMember` interface (used by dashboard for type safety)
  - HTML `<table>` with columns: Imie, Nazwisko, Email, Telefon, Specjalizacja, Nr wpisu, Sprawy (right-aligned, tabular-nums), Edit button (Pencil icon)
  - Empty state row when no members
  - Edit modal uses radix `Dialog` from `@/components/ui/dialog` with `DialogContent`, `DialogHeader`, `DialogTitle`
  - Form with 5 `Input` fields pre-filled from member record
  - Submit calls `PATCH /api/org/members/profile` with `{ target_user_id, first_name, last_name, phone, specialization, bar_registration_number }`
  - On success: closes modal, calls `onProfileUpdated()` which triggers `fetchFirmStats()` in parent to refresh all data
  - Error display + saving/disabled state on buttons

## Design Decisions

- **Manual tab pattern, not radix tabs** -- `@radix-ui/react-tabs` is not installed. The codebase uses `useState` + conditional rendering (see `case-detail-page.tsx`). Followed the exact same CSS classes for the tab bar.
- **No new UI primitives** -- Used existing `Dialog`, `Input`, `Label` from `@/components/ui/`. Table is plain HTML `<table>` with Tailwind (no shadcn Table component exists).
- **Lazy fetch** -- Firm stats are fetched only when admin navigates to the "firm" tab, not on mount. This avoids unnecessary API calls for the common case (viewing case list).
- **Polish labels** -- Tab labels ("Sprawy", "Moja kancelaria"), table headers ("Imie", "Nazwisko", etc.), and button text ("Zapisz", "Anuluj") in Polish to match the product language.

## TypeScript

`npx tsc --noEmit` passes cleanly with zero errors.
