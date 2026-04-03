# Task 1 — Token Usage DB Table & Helpers — Implementation Plan

## Files to Modify

### 1. `lib/db.js`

**Table creation (inside `initDb()`, after wizard_blueprints block around line 808):**
- Add `CREATE TABLE IF NOT EXISTS token_usage (...)` with the exact schema from the plan README
- Add index: `CREATE INDEX IF NOT EXISTS idx_token_usage_user_org ON token_usage(user_id, org_id)` for fast summary queries

**New helper functions (at end of file, after `getUpcomingDeadlinesForUser`):**

#### `logTokenUsage(params)`
- Signature: `logTokenUsage({ userId, orgId, route, model, inputTokens, outputTokens, voyageTokens, costUsd })`
- Wraps the INSERT in try/catch — errors are swallowed silently (console.warn at most, no throw)
- Calls `run()` synchronously (sql.js is sync) — no async needed
- Returns nothing
- Pattern: similar to `logAction()` at line 1559 but with try/catch wrapping

#### `getTokenUsageSummary(filters?)`
- Signature: `getTokenUsageSummary(filters = {})`
- Accepts optional `{ orgId }` filter
- SQL: `SELECT tu.user_id, u.name, u.email, tu.org_id, o.name, SUM(input_tokens), SUM(output_tokens), SUM(voyage_tokens), SUM(cost_usd) FROM token_usage tu JOIN users u ON tu.user_id = u.id JOIN organizations o ON tu.org_id = o.id [WHERE tu.org_id = ?] GROUP BY tu.user_id, tu.org_id`
- Returns array of `{ userId, userName, userEmail, orgId, orgName, claudeInputTokens, claudeOutputTokens, voyageTokens, estimatedCostUsd }`
- Uses `query()` helper, maps column names to camelCase in result

### 2. `src/lib/db-imports.ts`

- Add `logTokenUsage` and `getTokenUsageSummary` to the export list
- Place under a new comment section: `// Token Usage Tracking (Plan 048)`

## Success Criteria Mapping

1. "After ensureDb(), token_usage table exists" — CREATE TABLE IF NOT EXISTS in initDb()
2. "logTokenUsage inserts a row without throwing" — try/catch wrapping, calls run() which does the insert + saveDb()
3. "getTokenUsageSummary returns per-user aggregates" — GROUP BY user_id, org_id with JOINs
4. "logTokenUsage does not need to be awaited, errors don't propagate" — synchronous function (sql.js is sync), try/catch swallows errors

## Risks

- sql.js `run()` already calls `saveDb()` which writes to disk synchronously. This is the existing pattern for all writes in this codebase, so no new risk introduced.
- The fire-and-forget aspect is naturally satisfied because sql.js is synchronous — there's no promise to await. The try/catch ensures no error propagation.
