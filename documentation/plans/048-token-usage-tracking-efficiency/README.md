# Plan 048 — Token Usage Tracking & Efficiency Improvements

## Overview

Two related initiatives delivered as one plan:

1. **Token Usage Tracking** — Persist AI token consumption per user/org across all 8 AI routes, then expose an admin dashboard showing per-user totals with estimated dollar costs.
2. **Efficiency Improvements** — Fix the Anthropic client instantiation pattern, add a short-query bypass for the tag pre-filter, and add a TTL cache for JWT org re-hydration.

### Problem Statement

- The `TokenUsage` type and `PRICING` constants are fully defined but never persisted — every AI call's cost is computed and discarded.
- 4 of 8 AI routes don't capture token counts at all.
- Super admins have no visibility into which users are driving AI spend.
- `new Anthropic({...})` is instantiated in every route file (8 copies).
- Every request re-queries org membership + permissions from the DB, even burst requests.
- The tag pre-filter fires an extra Haiku call for every `/api/ask` request, including trivially short queries.

### Scope

- **In scope:** DB table, logging helpers, route instrumentation, super-admin dashboard, Anthropic singleton, tag pre-filter bypass, JWT TTL cache.
- **Out of scope:** sql.js architecture migration, per-request granularity log, UX audit, pricing accuracy beyond current `PRICING` constants.

---

## Architecture Decisions

### Token Usage Table (new)

A dedicated `token_usage` table — not `audit_log` — to keep concerns separate.

```sql
CREATE TABLE IF NOT EXISTS token_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  org_id         INTEGER NOT NULL REFERENCES organizations(id),
  route          TEXT NOT NULL,          -- e.g. '/api/ask', '/api/analyze'
  model          TEXT NOT NULL,          -- e.g. 'sonnet', 'haiku', 'voyage'
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  voyage_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       REAL NOT NULL DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Logging Strategy

- All writes are **fire-and-forget** — wrapped in `try/catch` with no `await` on the insert. A failed write must never affect the AI response.
- One row per AI endpoint invocation. For routes using both Haiku + Sonnet (e.g. `contracts/chat`), tokens from both models are summed into a single row with the primary model name.
- Voyage tokens are captured on the same row as the Claude call when both occur in the same route.

### Cost Calculation

Uses the existing `PRICING` constants from `src/lib/constants.ts`:

```
cost_usd = (input_tokens / 1_000_000 * PRICING.claude.sonnet.input)
         + (output_tokens / 1_000_000 * PRICING.claude.sonnet.output)
         + (voyage_tokens / 1_000 * PRICING.voyage)
```

Haiku routes use `PRICING.claude.haiku` rates.

### Admin Dashboard Location

New page at `/admin/token-usage` (within the existing `(admin)` route group, super-admin only). A link is added to the existing admin nav/header. The page shows a table sorted by `cost_usd DESC` with columns: User, Email, Org, Claude Input Tokens, Claude Output Tokens, Voyage Tokens, Estimated Cost (USD).

### Anthropic Singleton

New shared module `src/lib/anthropic-client.ts` exports a single `Anthropic` instance. All 8 route files import from this module instead of calling `new Anthropic({...})`.

### Tag Pre-Filter Bypass

In `/api/ask`, skip the Haiku tag extraction stage when `question.trim().length < 30`. Short queries don't benefit from tag pre-filtering and the extra round-trip adds latency and tokens.

### JWT TTL Cache

In `src/auth.ts`, add a `Map<string, {data, expiresAt}>` keyed by `userId:orgId`. Cache org membership + permissions for 5 seconds. Cache is invalidated on org-switch (when `trigger === 'update'` in the JWT callback). This eliminates redundant DB reads for burst API calls while preserving live org-switch awareness.

---

## Documentation Gaps

| Gap | Location | Action |
|-----|----------|--------|
| `token_usage` table missing from schema | `documentation/technology/architecture/database-schema.md` | Add table definition to ERD and table list |
| No admin dashboard documented | `documentation/product/requirements/features.md` | Add "Token Usage Dashboard" under Admin section |

---

## Tasks

### Task 1 — Token Usage DB Table & Helpers

**Description:**
Add the `token_usage` table to `lib/db.js` using the existing incremental migration pattern (`ALTER TABLE ... ADD COLUMN` wrapped in try/catch, or `CREATE TABLE IF NOT EXISTS` for new tables). Add three DB helper functions:
- `logTokenUsage(params)` — inserts one row; returns nothing (caller does not await)
- `getTokenUsageSummary(filters?)` — aggregates totals per user across all routes; accepts optional `orgId` filter; returns `{ userId, userName, userEmail, orgId, orgName, claudeInputTokens, claudeOutputTokens, voyageTokens, estimatedCostUsd }`
- Export these from `src/lib/db-imports.ts`

**Files:**
- `lib/db.js` — add table + migration + helper functions
- `src/lib/db-imports.ts` — export new helpers

**Success Criteria:**
- After `ensureDb()`, the `token_usage` table exists with all columns
- `logTokenUsage({ userId: 1, orgId: 1, route: '/api/ask', model: 'sonnet', inputTokens: 100, outputTokens: 50, voyageTokens: 10, costUsd: 0.002 })` inserts a row without throwing
- `getTokenUsageSummary()` returns an array of per-user aggregates summing tokens and cost across all routes
- Calling `logTokenUsage` does not need to be awaited and a thrown error inside it does not propagate

---

### Task 2 — Instrument All 8 AI Routes

**Description:**
For the 4 routes currently missing token capture, add token counting. For all 8 routes, add a fire-and-forget `logTokenUsage()` call after token counts are finalized but before returning the response.

**Routes requiring token capture addition (no tracking today):**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — capture `message.usage.input_tokens` + `message.usage.output_tokens` from the final Anthropic response
- `src/app/api/contracts/chat/route.ts` — sum tokens from Haiku classification call + Sonnet answer call; log with model `'sonnet'` (primary)
- `src/app/api/legal-hub/wizard/ai-assist/route.ts` — capture from single Sonnet call
- `src/app/api/legal-hub/wizard/ai-polish/route.ts` — capture from single Sonnet call

**All 8 routes — add fire-and-forget log:**
```typescript
// Fire-and-forget — must not block or throw into the response path
try {
  logTokenUsage({
    userId: Number(session.user.id),
    orgId: Number(session.user.orgId),
    route: '/api/ask',       // set per-route
    model: 'sonnet',         // set per-route
    inputTokens,
    outputTokens,
    voyageTokens,
    costUsd,                 // computed using PRICING constants
  });
} catch (_) { /* silent */ }
```

**Files:**
- `src/app/api/ask/route.ts`
- `src/app/api/analyze/route.ts`
- `src/app/api/legal-hub/cases/[id]/chat/route.ts`
- `src/app/api/contracts/chat/route.ts`
- `src/app/api/nda/analyze/route.ts`
- `src/app/api/desk/analyze/route.ts`
- `src/app/api/legal-hub/wizard/ai-assist/route.ts`
- `src/app/api/legal-hub/wizard/ai-polish/route.ts`

**Success Criteria:**
- After making an AI call through any of the 8 routes while authenticated, a row appears in `token_usage` with the correct `user_id`, `org_id`, `route`, and non-zero token counts
- A DB insert failure in the logging call does not cause the AI endpoint to return a 500
- The `cost_usd` value on each row matches `(input/1M * rate) + (output/1M * rate) + (voyage/1K * rate)` for the appropriate model rates

---

### Task 3 — Super-Admin Token Usage Dashboard

**Description:**
Create a new API endpoint and page in the existing `(admin)` route group visible only to super admins.

**API endpoint** — `src/app/api/admin/token-usage/route.ts` (GET):
- Calls `requireSuperAdmin(session)` guard
- Calls `getTokenUsageSummary()` with no org filter (all users, all orgs)
- Returns JSON array sorted by `estimatedCostUsd DESC`

**Page** — `src/app/(admin)/admin/token-usage/page.tsx`:
- Super-admin guard (redirect if not super admin)
- Fetches from `/api/admin/token-usage`
- Renders a sortable table with columns: User, Email, Organization, Claude Input, Claude Output, Voyage Tokens, Est. Cost (USD)
- Shows a total row at the bottom summing all columns
- Matches the visual style of the existing admin pages (uses the same layout, shadcn/ui `Table` component)

**Admin nav link** — add "Token Usage" link to the admin panel navigation (wherever the existing admin page has its nav — check `src/app/(admin)/layout.tsx` or the admin page header).

**Files:**
- `src/app/api/admin/token-usage/route.ts` (new)
- `src/app/(admin)/admin/token-usage/page.tsx` (new)
- `src/app/(admin)/layout.tsx` or admin page header — add nav link

**Success Criteria:**
- A super admin can navigate to `/admin/token-usage` and see a table of all users with their aggregated token counts and estimated costs
- A non-super-admin user receives a redirect or 403 when accessing the page/API
- The "Total" row at the bottom correctly sums all user rows
- The table is visible and loads without errors when `token_usage` table is empty (shows empty state message)

---

### Task 4 — Efficiency Improvements

**Description:**
Three targeted efficiency fixes. Each is independent and can be verified separately.

#### 4a — Anthropic Client Singleton

Create `src/lib/anthropic-client.ts` that exports a single module-level `Anthropic` instance:

```typescript
import Anthropic from "@anthropic-ai/sdk";
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

Update all 8 AI route files to `import { anthropic } from "@/lib/anthropic-client"` and remove their local `new Anthropic({...})` instantiation.

#### 4b — Tag Pre-Filter Short-Query Bypass

In `src/app/api/ask/route.ts`, wrap the tag extraction block with a length check:

```typescript
if (targetDocumentIds.length === 0 && question.trim().length >= 30) {
  // existing tag pre-filter logic
}
```

Threshold: 30 characters. Below this, the query is too short for tag matching to add value.

#### 4c — JWT Org Re-Hydration TTL Cache

In `src/auth.ts`, add a module-level `Map<string, { payload: object; expiresAt: number }>` keyed by `${userId}:${orgId}`. In the `jwt` callback, before querying the DB for org membership/permissions/features:
- Check if a cached entry exists and `expiresAt > Date.now()`
- If hit: use cached data (skip DB queries)
- If miss: run existing DB queries, store result in cache with `expiresAt = Date.now() + 5000` (5s TTL)
- If `trigger === 'update'` (org-switch): bypass cache and force re-query, then update cache

Cache is process-local (Map). It does not persist across server restarts, which is fine — it's a short-lived read cache only.

**Files:**
- `src/lib/anthropic-client.ts` (new)
- All 8 AI route files — remove local `new Anthropic(...)` instantiation
- `src/app/api/ask/route.ts` — tag pre-filter bypass
- `src/auth.ts` — TTL cache

**Success Criteria:**
- All AI routes continue to function correctly after switching to the shared Anthropic client
- Making `/api/ask` with a question shorter than 30 characters does not trigger a Haiku tag extraction call (visible via logs or absence of extra token usage row)
- Burst requests (2+ concurrent calls from same user) show only 1 DB query for org data in server logs instead of N
- Org-switch still works correctly: after switching orgs, the next request reflects the new org's data

---

## Execution Order

Tasks must be executed in order: Task 1 → Task 2 → Task 3 → Task 4.

- Task 2 depends on Task 1 (needs `logTokenUsage` to exist)
- Task 3 depends on Task 1 (needs `getTokenUsageSummary` to exist) and Task 2 (needs data to display)
- Task 4 is independent but runs last to avoid merge conflicts with Task 2's route edits

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `logTokenUsage` write blocks AI response | Low | Fire-and-forget pattern; no `await` |
| JWT cache causes stale org data | Low | 5s TTL; cache invalidated on org-switch trigger |
| legal-hub chat tool-use tokens miscounted | Medium | Capture from `message.usage` after full response (not streaming partial) |
| Tag pre-filter bypass threshold too aggressive | Low | 30-char threshold is conservative; easy to tune |
| DB schema migration breaks existing data | Very Low | `CREATE TABLE IF NOT EXISTS` is non-destructive |
