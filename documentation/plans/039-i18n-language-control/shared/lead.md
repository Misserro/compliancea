# Lead Notes — Plan 039: i18n Language Control

## Plan Overview

Full internationalisation using `next-intl` (without URL routing). Cookie-based locale (`locale=en|pl`). English default. Language toggle in AppSidebar footer. Hard reload on switch.

## Concurrency Decision

- **Slots:** 3 concurrent task-teams
- **Initial spawn:** Task 1 only (no dependencies, must complete first)
- **Sequence after Task 1:** Tasks 2, 3, 4 in parallel → when any completes, spawn Task 5, 6, or 7 to fill the slot
- Tasks 2–7 are all independent of each other — only depend on Task 1

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: depends on Task 1
- Task 3: depends on Task 1
- Task 4: depends on Task 1
- Task 5: depends on Task 1
- Task 6: depends on Task 1
- Task 7: depends on Task 1

## Key Architectural Constraints

1. **next-intl without URL routing** — use cookie-based setup, NOT the default URL-based routing pattern
2. **`i18n/request.ts`** reads `cookies().get('locale') ?? 'en'` and loads the matching messages file
3. **`next.config.mjs`** is ESM format — wrap with `withNextIntl` using ESM import syntax
4. **Root layout becomes async** — calls `getLocale()` and `getMessages()` from `next-intl/server`
5. **Hard reload** (`window.location.reload()`) required on language toggle — server components render locale at request time
6. **`LEGAL_CASE_STATUS_DISPLAY` and `LEGAL_CASE_TYPE_LABELS` are REMOVED** from `src/lib/constants.ts` in Task 2 — Task 3 must use `useTranslations('CaseStatuses')` etc. instead of those imports
7. **Each task owns a distinct top-level namespace** in messages/en.json and messages/pl.json — no cross-task key conflicts
8. **TypeScript clean** is a hard success criterion for every task

## Critical Files

- `next.config.mjs` — ESM format, needs `withNextIntl` wrap
- `src/app/layout.tsx` — becomes async server component with NextIntlClientProvider
- `src/lib/constants.ts` — display string maps removed in Task 2
- `src/components/layout/app-sidebar.tsx` — LanguageSwitcher added to footer in Task 1, nav labels translated in Task 2
- `messages/en.json` + `messages/pl.json` — shared across Tasks 1–7, each task owns distinct namespaces

## Tech Stack (relevant)

- Next.js 15 App Router, React 19
- next-intl (to be installed) — cookie-based setup without URL routing
- TypeScript throughout src/
- next.config.mjs (ESM)

## Decisions Made

- (2026-03-26) Cookie-based locale (no URL restructuring), English default, Polish as opt-in
- (2026-03-26) Full app scope — all 7 task areas
- (2026-03-26) next-intl chosen as the only viable App Router i18n library
- (2026-03-26) Hard reload on language toggle is intentional and acceptable
- (2026-03-26) `LEGAL_CASE_STATUS_DISPLAY`, `LEGAL_CASE_TYPE_LABELS` removed from constants.ts — call sites use useTranslations instead
