# Task 2 Implementation Plan -- Merge AI Tools into Tabbed Page

## Overview

Replace two sidebar items ("Analyze & Process" and "Ask Library") with a single "AI Tools" item at `/document-tools`. Convert the page to a client component with two tabs. Redirect `/ask` to `/document-tools`.

## Files to Modify

### 1. `src/components/layout/app-sidebar.tsx`

- Remove `MessageSquare` from the lucide-react import (line 5) -- not used elsewhere in this file
- In `docHubItems` array (lines 289-294):
  - Change `analyzeProcess` entry to use `tSidebar("aiTools")` instead of `tSidebar("analyzeProcess")`
  - Remove the `askLibrary` entry entirely
- Result: docHubItems has 3 entries (documents, policies, aiTools)

### 2. `src/app/(app)/document-tools/page.tsx`

- Full rewrite from server component to `"use client"` component
- Remove `getAllDocuments` server import, `getTranslations` server import
- Add client-side fetch of `/api/documents` on mount (pattern from existing `ask/page.tsx`)
- Add `activeTab` state with `"analyze"` as default
- Render tab bar with "Analyze & Process" and "Ask Library" tabs
- "analyze" tab: renders AnalyzerSection + DeskSection (existing cards)
- "ask" tab: renders AskSection with loaded documents
- Use Skeleton component for loading states
- Import Card components, Skeleton, useTranslations, AskSection

### 3. `src/app/(app)/ask/page.tsx`

- Replace entire file with server-side redirect to `/document-tools`
- Use `redirect()` from `next/navigation` (server component)

### 4. `messages/en.json`

- Add `"aiTools": "AI Tools"` to `Sidebar` object (after `askLibrary` or replacing position)
- Add `Documents.aiTools` object with title, subtitle, tab.analyze, tab.ask keys

### 5. `messages/pl.json`

- Add `"aiTools": "Narzedzia AI"` to `Sidebar` object
- Add `Documents.aiTools` object with Polish equivalents

## Success Criteria Mapping

1. Sidebar Documents Hub shows 3 items: Documents, Policies (task 3 removes this later), AI Tools -- YES, askLibrary removed
2. `/document-tools` shows tabbed page -- YES, two tabs with local state
3. Default tab is "Analyze & Process" -- YES, `useState<Tab>("analyze")`
4. "Ask Library" tab renders AskSection with documents -- YES, same fetch pattern as current ask/page.tsx
5. `/ask` redirects to `/document-tools` -- YES, server redirect
6. Labels in both EN and PL -- YES, all keys added to both files

## Risks

- Converting from server to client component means `getAllDocuments()` (CJS) is replaced by `/api/documents` fetch. This is intentional per lead notes.
- The existing `ask/page.tsx` fetch pattern is proven and works. Reusing it exactly.
- Tab state is local only (no URL params) -- consistent with DeskSection and ContractsTab patterns per lead notes.
