## Task 1 Complete — Token Usage DB Table & Helpers

- Modified: `lib/db.js` (line ~822) — added `CREATE TABLE IF NOT EXISTS token_usage` with all 10 columns (id, user_id, org_id, route, model, input_tokens, output_tokens, voyage_tokens, cost_usd, created_at) inside `initDb()`
- Modified: `lib/db.js` (line ~837) — added index `idx_token_usage_user_org` on `(user_id, org_id)`
- Modified: `lib/db.js` (line ~4535) — added `logTokenUsage({ userId, orgId, route, model, inputTokens, outputTokens, voyageTokens, costUsd })` — fire-and-forget insert wrapped in try/catch, errors swallowed silently
- Modified: `lib/db.js` (line ~4553) — added `getTokenUsageSummary(filters?)` — GROUP BY user_id, org_id with JOINs to users and organizations tables, returns camelCase objects `{ userId, userName, userEmail, orgId, orgName, claudeInputTokens, claudeOutputTokens, voyageTokens, estimatedCostUsd }`, sorted by estimatedCostUsd DESC
- Modified: `src/lib/db-imports.ts` (lines 203-204) — added exports for `logTokenUsage` and `getTokenUsageSummary` under "Token Usage Tracking (Plan 048)" comment

### Exports for downstream tasks
- `logTokenUsage` — Task 2 imports this from `@/lib/db-imports` for route instrumentation
- `getTokenUsageSummary` — Task 3 imports this from `@/lib/db-imports` for the admin dashboard API

### Design notes
- sql.js is synchronous, so `logTokenUsage` naturally does not return a promise — callers don't need to `await` it
- The try/catch in `logTokenUsage` ensures no error propagation even if the DB is in a bad state
- `getTokenUsageSummary` accepts optional `{ orgId }` filter for future per-org views, but Task 3 dashboard calls it without filters (all users, all orgs)
- Column names in SQL use snake_case; the `getTokenUsageSummary` function maps them to camelCase in the return objects to match the plan spec
