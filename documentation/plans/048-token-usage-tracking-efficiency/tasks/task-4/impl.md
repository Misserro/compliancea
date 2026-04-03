## Task 4 Complete — Efficiency Improvements

### 4a — Anthropic Client Singleton
- Created: `src/lib/anthropic-client.ts` (new file) — exports single `Anthropic` instance
- Modified: `src/app/api/ask/route.ts` — replaced `import Anthropic` with `import { anthropic }`, removed local instantiation (lines 132-134)
- Modified: `src/app/api/analyze/route.ts` — replaced import, removed local instantiation (lines 111-113)
- Modified: `src/app/api/nda/analyze/route.ts` — replaced import, removed local instantiation (line 87)
- Modified: `src/app/api/desk/analyze/route.ts` — replaced import, removed local instantiation (lines 107-109)
- Modified: `src/app/api/contracts/chat/route.ts` — replaced import, removed local instantiation (line 119)
- Modified: `src/app/api/legal-hub/cases/[id]/chat/route.ts` — replaced import, removed local instantiation (line 215), added `import type Anthropic` for `Anthropic.Tool[]` type usage
- Modified: `src/app/api/legal-hub/wizard/ai-assist/route.ts` — replaced import, removed local instantiation (lines 116-118)
- Modified: `src/app/api/legal-hub/wizard/ai-polish/route.ts` — replaced import, removed local instantiation (lines 89-91)
- GOTCHA: `legal-hub/cases/[id]/chat/route.ts` uses `Anthropic.Tool[]` as a type — required adding `import type Anthropic from "@anthropic-ai/sdk"` alongside the value import
- All routes keep their `if (!process.env.ANTHROPIC_API_KEY)` guard check for clear error messages

### 4b — Tag Pre-Filter Short-Query Bypass
- Modified: `src/app/api/ask/route.ts` — added `&& question.trim().length >= 30` to tag pre-filter condition (line 56)
- Questions shorter than 30 characters skip the Haiku tag extraction call entirely

### 4c — JWT Org Re-Hydration TTL Cache
- Modified: `src/auth.ts` — added module-level `jwtOrgCache` Map with 5s TTL
- Cache key: `${userId}:${orgId}`
- Cached fields: orgId, orgRole, orgName, isSuperAdmin, permissions, orgFeatures
- On cache hit (within 5s TTL): skips all DB queries for org context, permissions, features, super admin flag
- On cache miss/expired: runs existing DB queries, stores result with `expiresAt = Date.now() + 5000`
- On org-switch (`trigger === 'update'` with `session.switchToOrgId`): bypasses cache entirely, re-queries, stores new result keyed by new orgId
- Session re-hydration (getSessionById/createSession) is NOT cached — always runs
- INTEGRATION: Cache is process-local Map. Does not persist across server restarts. No cleanup needed for v1 (entries are tiny, keyed by userId:orgId).

### TypeScript Compilation
- All changes compile cleanly. Pre-existing errors in `src/lib/db-imports.ts` (logTokenUsage/getTokenUsageSummary exports) are from Task 1/2 scope, not related to this task.
