# App Upgrades Design — 2026-02-26

## Overview

Three independent upgrades to the ComplianceA app:

1. **Policies tab** — download button per policy row
2. **Documents tab** — improved "In Force" pill + tags toggle
3. **Dashboard page** — new home page with KPI cards and deadline lists

---

## Feature 1: Policies — Download Button

### Goal
Allow users to download policy and procedure documents directly from the Policies tab without navigating elsewhere.

### Changes
- **`src/components/policies/policies-list.tsx`** — add a `Download` icon button to each `PolicyRow`, placed alongside the existing Replace and History buttons.

### Behaviour
- Clicking calls `window.open(\`/api/documents/${doc.id}/download?download=true\`, '_blank')`
- Triggers a browser file download using the existing `/api/documents/[id]/download` endpoint
- No backend changes required

---

## Feature 2: Documents — "In Force" Pill + Tags Toggle

### Goal
Make the document cards cleaner: the most important status ("In Force" vs "Archived") should be immediately visible and well-styled; tags should be available on demand without cluttering the collapsed view.

### In Force Pill
- Replace the existing `Badge` in `src/components/documents/document-badges.tsx`
- `● In Force` — solid green pill (`bg-green-500 text-white`, rounded-full, small)
- `● Archived` — muted grey pill (same shape)
- Always visible in the collapsed card header (unchanged placement)

### Tags Toggle
- In `src/components/documents/document-card.tsx`, add a `Tags (N)` chip button in the collapsed header row, next to the word count
- Clicking it toggles an inline tag list visible without fully expanding the card
- State is local to each card (`useState`)
- Button hidden when document has no tags
- Tags display: comma-separated or small pill list inline

---

## Feature 3: Dashboard Page

### Goal
Replace the current `/documents` home page with a dashboard that gives an at-a-glance view of the system's compliance health.

### New Route
- `src/app/dashboard/page.tsx` — new client component
- `src/app/page.tsx` — change redirect from `/documents` to `/dashboard`
- `src/components/layout/app-sidebar.tsx` — add Dashboard nav item (with `LayoutDashboard` icon) at the top of the nav list

### New API Endpoint
`GET /api/dashboard` — single aggregated endpoint

Response shape:
```ts
{
  docs: {
    total: number,
    processed: number,
    byType: Record<string, number>
  },
  obligations: {
    total: number,
    active: number,
    overdue: number,
    upcoming: Array<{ id: number, title: string, due_date: string, document_name: string }>
  },
  contracts: {
    total: number,
    active: number,
    expiringSoon: Array<{ id: number, name: string, expiry_date: string, daysLeft: number }>
  },
  features: {
    total: number,
    byStatus: Record<string, number>
  }
}
```

`upcoming` = obligations with `due_date` within the next 30 days, sorted ascending
`expiringSoon` = contracts with `expiry_date` within the next 60 days, sorted ascending

### Page Layout

```
┌──────────────────────────────────────────────────────┐
│  KPI Cards (4, responsive grid):                     │
│  [Documents] [Overdue Obligations] [Active Contracts]│
│  [Product Features]                                  │
├──────────────────────────┬───────────────────────────┤
│  Upcoming Obligations    │  Contracts Expiring Soon  │
│  (next 30 days)          │  (next 60 days)           │
│  • Title — X days        │  • Name — X days          │
├──────────────────────────┴───────────────────────────┤
│  Product Hub Status Bar                              │
│  Idea | In Spec | In Review | Approved | ... Shipped │
└──────────────────────────────────────────────────────┘
```

### Navigation
- Each KPI card links to its respective tab (`/documents`, `/obligations`, `/contracts`, `/product-hub`)
- Each row in the obligation/contract lists links to the relevant detail or tab

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/app/page.tsx` | Change redirect to `/dashboard` |
| `src/app/dashboard/page.tsx` | Create new dashboard page |
| `src/app/api/dashboard/route.ts` | Create new aggregated API endpoint |
| `src/components/layout/app-sidebar.tsx` | Add Dashboard nav item |
| `src/components/policies/policies-list.tsx` | Add Download button to PolicyRow |
| `src/components/documents/document-badges.tsx` | Restyle In Force as solid pill |
| `src/components/documents/document-card.tsx` | Add Tags toggle chip |
