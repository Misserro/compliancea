# Task 4 — Efficiency Improvements — Implementation Plan

## Overview

Three independent efficiency improvements: Anthropic client singleton, tag pre-filter short-query bypass, and JWT org re-hydration TTL cache.

---

## 4a — Anthropic Client Singleton

### New file: `src/lib/anthropic-client.ts`

Create a new module exporting a single `Anthropic` instance:

```typescript
import Anthropic from "@anthropic-ai/sdk";
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### Modifications to 8 AI route files

For each route file:
1. Replace `import Anthropic from "@anthropic-ai/sdk"` with `import { anthropic } from "@/lib/anthropic-client"`
2. Remove the local `const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` (or multi-line variant)
3. Keep the `if (!process.env.ANTHROPIC_API_KEY)` guard check in each route — it provides a clear error message before any API call

**Files to modify:**
- `src/app/api/ask/route.ts` — lines 3, 132-134
- `src/app/api/analyze/route.ts` — lines 3, 111-113
- `src/app/api/nda/analyze/route.ts` — lines 3, 87
- `src/app/api/desk/analyze/route.ts` — lines 3, 107-109
- `src/app/api/contracts/chat/route.ts` — lines 3, 119
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — lines 2, 215
- `src/app/api/legal-hub/wizard/ai-assist/route.ts` — lines 5, 116-118
- `src/app/api/legal-hub/wizard/ai-polish/route.ts` — lines 5, 89-91

---

## 4b — Tag Pre-Filter Short-Query Bypass

### File: `src/app/api/ask/route.ts`

Wrap the existing tag pre-filter block (lines 56-71) with a length check. Change:

```typescript
if (targetDocumentIds.length === 0) {
```

To:

```typescript
if (targetDocumentIds.length === 0 && question.trim().length >= 30) {
```

This skips the Haiku tag extraction call for questions shorter than 30 characters.

---

## 4c — JWT Org Re-Hydration TTL Cache

### File: `src/auth.ts`

Add a module-level TTL cache for the "else if" branch (subsequent requests, lines 117-173). This branch re-queries org membership, super admin flag, permissions, and feature flags on every request.

**Cache structure:**
```typescript
const jwtOrgCache = new Map<string, { data: JwtCachePayload; expiresAt: number }>();
```

**Cache key:** `${userId}:${orgId}`

**What gets cached (JwtCachePayload):**
- orgId, orgRole, orgName
- isSuperAdmin
- permissions
- orgFeatures

**Logic in the "else if" branch:**
1. If `trigger === 'update'` (org-switch): bypass cache, run all DB queries, store result in cache with new orgId key
2. Otherwise: check cache for `${token.id}:${token.orgId}`. If hit and `expiresAt > Date.now()`, apply cached data to token and skip DB queries
3. If cache miss or expired: run existing DB queries, store result with `expiresAt = Date.now() + 5000`

**Important:** The session re-hydration check (getSessionById/createSession at lines 121-125) is NOT cached — it must always run. Only the org context + permissions + features block is cached.

**TTL:** 5000ms (5 seconds)

---

## Risks and Trade-offs

- **Anthropic singleton with undefined API key at module load:** The Anthropic SDK accepts undefined apiKey at construction time and only fails when making API calls. The per-route guard check ensures a clear error message. No risk.
- **JWT cache stale data:** 5s TTL is very short. Org-switch explicitly bypasses cache. Permissions changes take up to 5s to take effect — acceptable.
- **Cache memory growth:** Map entries are tiny (< 1KB each) and keyed by userId:orgId. In practice, active users * orgs is small. No eviction needed for v1.

---

## Success Criteria Mapping

1. All AI routes function correctly with shared Anthropic client — verified by: import change is mechanical, same instance API
2. Short questions skip tag extraction — verified by: `question.trim().length >= 30` condition
3. Burst requests reuse cached org data — verified by: TTL cache returns cached data within 5s window
4. Org-switch works correctly — verified by: `trigger === 'update'` bypasses cache and re-queries
