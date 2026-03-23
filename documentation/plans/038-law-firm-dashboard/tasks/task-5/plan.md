# Task 5 Plan -- "My law firm" admin tab UI

## Overview

Add a tab shell to `LegalHubDashboard` so admins/owners see two tabs ("Sprawy" and "Moja kancelaria") while members see no tabs (just the existing case list). The "Moja kancelaria" tab contains a stats panel and a member roster table with per-row edit capability.

## Key Decisions

1. **No radix tabs** -- `@radix-ui/react-tabs` is not installed and the codebase uses manual tab patterns (see `case-detail-page.tsx` lines 32, 91-97). I will follow the same pattern: `useState` for active tab + conditional rendering + styled tab buttons.

2. **No new UI primitives needed** -- The shadcn `Tabs` component (`src/components/ui/tabs.tsx`) does not exist. Rather than installing a new dependency, I will use the existing manual tab pattern for consistency.

3. **Edit modal uses existing `Dialog` component** -- `src/components/ui/dialog.tsx` exists (radix-based). The edit modal will use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` for the profile edit form.

4. **No `table.tsx` primitive** -- No shadcn Table component exists. I will use plain HTML `<table>` with Tailwind styling, consistent with how other tabular data is displayed in the project.

## Files to Create/Modify

### 1. `src/components/legal-hub/legal-hub-dashboard.tsx` (MODIFY)

**Changes:**
- Add `activeTab` state (`"cases"` | `"firm"`) -- default `"cases"`
- Add `firmStats` state + `useEffect` fetch from `GET /api/legal-hub/firm-stats` (only when admin AND tab is "firm")
- Derive `isAdmin` from `sessionData?.user?.orgRole !== 'member'`
- Wrap existing content in a tab shell:
  - If `isAdmin`: render tab bar with "Sprawy" and "Moja kancelaria" triggers, then conditional content
  - If not admin: render existing case list directly (no tab bar visible)
- "Sprawy" tab content = existing case list (header, search, filters, CaseList, NewCaseDialog)
- "Moja kancelaria" tab content = `<FirmStatsPanel>` + `<MemberRoster>`, passing `firmStats` data
- Add a `refreshFirmStats` callback that re-fetches and is passed to `MemberRoster` for post-edit refresh

### 2. `src/components/legal-hub/firm-stats-panel.tsx` (NEW)

**Purpose:** Display case stats: counts per status + finalized last 30 days.

**Props:**
```ts
interface FirmStatsPanelProps {
  statsByStatus: { status: string; count: number }[];
  finalizedLast30Days: number;
  loading: boolean;
}
```

**Implementation:**
- "use client" component
- Shows a grid of status cards using `LEGAL_CASE_STATUS_DISPLAY` for labels and `LEGAL_CASE_STATUS_COLORS` for styling
- Shows a summary card for "finalized last 30 days" count
- Loading state: skeleton/placeholder text
- Uses `Card` from `@/components/ui/card` if the pattern fits, else simple styled divs

### 3. `src/components/legal-hub/member-roster.tsx` (NEW)

**Purpose:** Member table with edit modal.

**Props:**
```ts
interface MemberRosterProps {
  members: FirmMember[];
  onProfileUpdated: () => void; // triggers firmStats refresh
}

interface FirmMember {
  user_id: number;
  name: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  specialization: string | null;
  bar_registration_number: string | null;
  assigned_case_count: number;
}
```

**Implementation:**
- "use client" component
- HTML `<table>` with columns: Imie (first_name), Nazwisko (last_name), Email, Telefon (phone), Specjalizacja (specialization), Nr wpisu (bar_registration_number), Sprawy (assigned_case_count), Actions (edit button)
- `editingMember` state (null or FirmMember)
- Edit button per row sets `editingMember`
- Dialog-based edit modal (`Dialog` from `@/components/ui/dialog`) with form fields:
  - first_name (Input)
  - last_name (Input)
  - phone (Input)
  - specialization (Input)
  - bar_registration_number (Input)
- All fields pre-filled from the member record
- Submit calls `PATCH /api/org/members/profile` with `{ target_user_id, first_name, last_name, phone, specialization, bar_registration_number }`
- On success: close modal, call `onProfileUpdated()` to refresh
- Error handling: display error message in modal

## Data Flow

```
LegalHubDashboard
  |-- isAdmin check (session.user.orgRole !== 'member')
  |-- Tab bar (admin only)
  |-- "Sprawy" tab: existing case list (unchanged)
  |-- "Moja kancelaria" tab:
       |-- fetch GET /api/legal-hub/firm-stats on tab activation
       |-- FirmStatsPanel(statsByStatus, finalizedLast30Days, loading)
       |-- MemberRoster(members, onProfileUpdated=refreshFirmStats)
            |-- Edit button -> Dialog modal
            |-- Submit -> PATCH /api/org/members/profile
            |-- onSuccess -> onProfileUpdated() -> re-fetch firm-stats
```

## Success Criteria Mapping

1. Admin sees two tabs: "Sprawy" and "Moja kancelaria" -- Tab bar renders conditionally for admin
2. "Moja kancelaria" tab is not visible to members -- `isAdmin` check hides tab bar entirely
3. Stats panel shows counts per status + finalizedLast30Days -- FirmStatsPanel renders from API data
4. Member roster with all columns -- MemberRoster table
5. Edit button opens form with pre-filled fields -- Dialog modal with 5 profile fields
6. Saving calls PATCH API and refreshes table -- fetch + onProfileUpdated callback
7. TypeScript compiles cleanly -- All types defined, no `any`

## Risks

- **Firm stats API not returning data** -- Task 3 is a dependency and its impl.md confirms the API shape matches our expectations exactly.
- **Tab state persistence** -- URL-based tab state is out of scope; using simple React state. Navigating away and back will reset to "Sprawy" tab.
