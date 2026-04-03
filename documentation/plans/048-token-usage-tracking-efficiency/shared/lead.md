# Lead Notes — Plan 048: Token Usage Tracking & Efficiency Improvements

## Plan Overview

Two initiatives in one plan:
1. **Token Usage Tracking** — new `token_usage` DB table, logging helpers, instrument 8 AI routes, super-admin dashboard
2. **Efficiency Improvements** — Anthropic client singleton, tag pre-filter short-query bypass, JWT TTL cache

## Concurrency Decision

2 concurrent task-teams max (pipeline overlap). Tasks are essentially sequential:
- Task 1 starts immediately
- Task 2 pipeline-spawns during Task 1 review/test
- Task 3 pipeline-spawns during Task 2 review/test
- Task 4 pipeline-spawns during Task 3 review/test

## Task Dependency Graph

- Task 1: no dependencies (Token Usage DB Table & Helpers)
- Task 2: depends on Task 1 (Instrument All 8 AI Routes)
- Task 3: depends on Task 1 + Task 2 (Super-Admin Token Usage Dashboard)
- Task 4: independent, runs last to avoid merge conflicts with Task 2 edits (Efficiency Improvements)

## Key Architectural Constraints

1. **Fire-and-forget writes** — `logTokenUsage()` must NEVER block AI responses. No `await`, wrap in try/catch, errors swallowed silently.
2. **No audit_log reuse** — dedicated `token_usage` table, not the `audit_log` table.
3. **Super-admin only dashboard** — `/admin/token-usage` page uses `requireSuperAdmin()` guard. Not accessible by org admins.
4. **Anthropic singleton** — `src/lib/anthropic-client.ts` exports one instance. All 8 routes import from it.
5. **JWT cache TTL = 5s** — process-local Map, invalidated on `trigger === 'update'` (org-switch).
6. **Cost formula** — uses existing `PRICING` constants from `src/lib/constants.ts`.

## Critical Files

- `lib/db.js` — all DB schema and helpers (CJS)
- `src/lib/db-imports.ts` — TypeScript re-exports of db.js functions
- `src/auth.ts` — NextAuth JWT callback (JWT TTL cache goes here)
- `src/lib/constants.ts` — PRICING constants (Sonnet $3/$15, Haiku $0.25/$1.25, Voyage $0.02)
- `src/app/(admin)/` — admin route group, super-admin only pages

## AI Routes to Instrument (all 8)

1. `src/app/api/ask/route.ts` — already captures tokens
2. `src/app/api/analyze/route.ts` — already captures tokens
3. `src/app/api/nda/analyze/route.ts` — already captures tokens
4. `src/app/api/desk/analyze/route.ts` — already captures tokens
5. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — NO token capture today
6. `src/app/api/contracts/chat/route.ts` — NO token capture today (uses Haiku + Sonnet)
7. `src/app/api/legal-hub/wizard/ai-assist/route.ts` — NO token capture today
8. `src/app/api/legal-hub/wizard/ai-polish/route.ts` — NO token capture today

## Decisions Made During Planning

- Chose dedicated `token_usage` table over reusing `audit_log` — keeps concerns separate
- Super admin only (not org admin) — simpler v1 scope
- All-time totals only — no time-bucketed aggregation for v1
- Cost display: tokens + estimated $ using existing PRICING constants
- Tag pre-filter bypass threshold: 30 characters (conservative)
