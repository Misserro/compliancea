# App Cleanup & Professionalization Design

**Date:** 2026-02-22
**Status:** Approved
**Scope:** Option B — Structural refactor + polish

## Context

The app is a client-facing compliance document management platform running on Railway (Next.js 15, React 19, TypeScript). It went through a migration from an Express backend to Next.js API routes, leaving behind dead code and a cluttered navigation structure. The goal is to remove dead code, fix broken features, restructure navigation, and standardize UI patterns so the app presents professionally to clients.

---

## Section 1: Dead Code Removal

### Delete immediately

| Item | Reason |
|------|--------|
| `server.js` (root, 92KB) | All 54 routes fully migrated to Next.js API routes. Railway `startCommand = "npm start"` runs `next start` — `server.js` is never executed. |
| `src/components/obligations/obligations-stats.tsx` | Not imported anywhere in the codebase. |

### Keep for now

| Item | Reason |
|------|--------|
| `src/app/obligations/page.tsx` | Permanent redirect to `/contracts`. Good URL hygiene for bookmarked links. |
| `src/app/api/admin/migrate-contract-hub/route.ts` | One-time migration utility. App is in test; may still be needed if DB is reset. Remove before client launch. |

---

## Section 2: Navigation & Information Architecture

### Problem

`/analyze` crams three unrelated tools into one scrolling page: Document Analyzer, Ask the Library, and Cross-Reference/Questionnaire/NDA Review. The sidebar entry "Analyze & Ask" is vague. The sidebar header says "Document Analyzer" instead of the product name.

### Changes

**Sidebar header:** Rename from "Document Analyzer" → "ComplianceA"

**Split `/analyze` into three dedicated pages:**

| New route | Sidebar label | Content |
|-----------|--------------|---------|
| `/analyze` | Analyze | Document Analyzer only (`analyzer-section.tsx`) |
| `/ask` | Ask Library | Ask the Library (`ask-section.tsx`) |
| `/process` | Process | Regulator Query / Questionnaire / NDA Review (`desk-section.tsx`) |

**New sidebar nav order:**
```
Documents
Analyze
Ask Library
Process
Contracts
Settings
```

The overdue obligations badge stays on Contracts.

**Implementation:**
- Create `src/app/ask/page.tsx` (new page — wraps `AskSection`)
- Create `src/app/process/page.tsx` (new page — wraps `DeskSection`)
- Simplify `src/app/analyze/page.tsx` to render only `AnalyzerSection`
- Update `src/components/layout/app-sidebar.tsx` nav items and header title

---

## Section 3: Feature Completion

### Evidence dialog (contract-card.tsx:311)

`EvidenceDialog` (`src/components/obligations/evidence-dialog.tsx`) was built but never wired up. The "Add Evidence" button in obligation cards inside Contracts hits a `// TODO: Open evidence dialog` and does nothing — a visible broken feature.

**Fix:** Mount `EvidenceDialog` in `contract-card.tsx`, add state to track which obligation's dialog is open, connect the `onAddEvidence` callback to open it.

---

## Section 4: Component Refactoring

### desk-section.tsx (879 lines → split)

`desk-section.tsx` handles three distinct modes with no shared state between them. Extract each mode into its own sub-component:

```
src/components/analyze/
├── desk-section.tsx          # Orchestrator: mode switcher + renders sub-component (~50 lines)
├── regulator-section.tsx     # Regulator Query UI + logic (new)
├── questionnaire-section.tsx # Questionnaire UI + logic (new)
└── nda-section.tsx           # NDA Review UI + logic (new)
```

Each sub-component receives `documents: Document[]` as a prop. No behavior changes — pure structural split.

`analyzer-section.tsx` (348 lines) and `ask-section.tsx` (187 lines) are reasonable sizes — no split needed.

---

## Section 5: UI Polish

### Loading states

The `Skeleton` component (`src/components/ui/skeleton.tsx`) exists but is never used. Six places show plain text "Loading..." while data fetches:

| File | Current | Replace with |
|------|---------|-------------|
| `src/app/documents/page.tsx` | `<p>Loading documents...</p>` | Card skeletons matching document-card shape |
| `src/app/analyze/page.tsx` | `<p>Loading documents...</p>` (×2) | Removed (page simplified; sub-pages handle their own loading) |
| `src/components/contracts/contract-list.tsx` | `<div>Loading contracts...</div>` | Card skeletons matching contract-card shape |
| `src/components/contracts/upcoming-obligations-section.tsx` | `<p>Loading...</p>` | Line skeletons |

### Status messages

`analyzer-section.tsx` and `ask-section.tsx` both implement identical inline ternary patterns for info/error/success status display. Extract to a shared `StatusMessage` component:

```tsx
// src/components/ui/status-message.tsx
<StatusMessage type="error" | "success" | "info" message={string} />
```

Used in both analyzer and ask sections.

### Semantic fix

`src/components/contracts/contract-list.tsx` — loading state uses `<div>` for text content; change to `<p>`.

### Empty states

Already consistent and well-written across all pages. No changes needed.

### Page titles

Already consistent (`text-2xl font-semibold tracking-tight` + `text-sm text-muted-foreground mt-1` subtitle). No changes needed.

---

## Change Summary

| # | Area | Files touched |
|---|------|--------------|
| 1 | Delete `server.js` | `server.js` |
| 2 | Delete `obligations-stats.tsx` | `src/components/obligations/obligations-stats.tsx` |
| 3 | Split analyze page | `src/app/analyze/page.tsx`, new `src/app/ask/page.tsx`, new `src/app/process/page.tsx` |
| 4 | Update sidebar | `src/components/layout/app-sidebar.tsx` |
| 5 | Wire evidence dialog | `src/components/contracts/contract-card.tsx`, `src/components/obligations/evidence-dialog.tsx` |
| 6 | Refactor desk-section | `src/components/analyze/desk-section.tsx`, new `regulator-section.tsx`, `questionnaire-section.tsx`, `nda-section.tsx` |
| 7 | Skeleton loaders | `src/app/documents/page.tsx`, `src/components/contracts/contract-list.tsx`, `src/components/contracts/upcoming-obligations-section.tsx` |
| 8 | StatusMessage component | new `src/components/ui/status-message.tsx`, `src/components/analyze/analyzer-section.tsx`, `src/components/analyze/ask-section.tsx` |
| 9 | Semantic fix | `src/components/contracts/contract-list.tsx` |

## Out of Scope

- `/api/admin/migrate-contract-hub` removal (deferred to pre-launch)
- Test suite
- Dashboard/home page
- Error boundary pages
