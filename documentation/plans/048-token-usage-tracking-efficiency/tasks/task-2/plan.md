# Task 2 Implementation Plan — Instrument All 8 AI Routes

## Overview

Add token usage logging via `logTokenUsage()` to all 8 AI routes. For 4 routes that already capture tokens, just add the logging call. For the other 4, add token capture first, then logging.

## Files to Modify

### Group A — Already capture tokens (add logging only)

1. **`src/app/api/ask/route.ts`**
   - Has: `inputTokens`, `outputTokens`, `voyageTokens` already tracked
   - Add: import `logTokenUsage` from `@/lib/db-imports` and `PRICING` from `@/lib/constants`
   - Add: cost calculation + `logTokenUsage()` call before the final `return NextResponse.json(...)` (line ~141)
   - Route: `'/api/ask'`, model: `'sonnet'`
   - Note: Also need to handle early return at line 95 (no search results) — log with zero claude tokens but existing voyage tokens

2. **`src/app/api/analyze/route.ts`**
   - Has: `inputTokens`, `outputTokens` already tracked (no voyage)
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before `return NextResponse.json(out)` (line ~205)
   - Route: `'/api/analyze'`, model: `'sonnet'`, voyageTokens: `0`

3. **`src/app/api/nda/analyze/route.ts`**
   - Has: `inputTokens`, `outputTokens` already tracked (no voyage)
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before `return NextResponse.json(...)` (line ~102)
   - Route: `'/api/nda/analyze'`, model: `'sonnet'`, voyageTokens: `0`

4. **`src/app/api/desk/analyze/route.ts`**
   - Has: `inputTokens`, `outputTokens`, `voyageTokens` already tracked
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before `return NextResponse.json(out)` (line ~370)
   - Route: `'/api/desk/analyze'`, model: determined by `usedHaiku` flag — if Haiku was used for extraction but Sonnet for main call, use `'sonnet'` (primary model)
   - Note: Per task spec "For desk/analyze which uses Haiku optionally: check which model was actually used, set model field accordingly". However, this route always uses Sonnet for the main call; Haiku is only optionally used for extraction. Since the plan says to sum tokens and use the primary model, I'll use `'sonnet'`.

### Group B — Need token capture + logging

5. **`src/app/api/legal-hub/cases/[id]/chat/route.ts`**
   - Currently: No token capture at all
   - Add: `let inputTokens = 0; let outputTokens = 0;` at start of try block
   - Capture: `genResponse.usage.input_tokens` + `genResponse.usage.output_tokens` after the `anthropic.messages.create()` call (line ~267)
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before each return (action_proposal return at ~310, structured return at ~324)
   - Route: `'/api/legal-hub/cases/chat'`, model: `'sonnet'`, voyageTokens: `0`
   - Note: Also handle max_tokens early return at line ~271

6. **`src/app/api/contracts/chat/route.ts`**
   - Currently: No token capture at all
   - Two Claude calls: Haiku classifier (line ~121) + Sonnet answer (line ~301)
   - Add: `let inputTokens = 0; let outputTokens = 0;` at start of try block
   - Capture from classifier: `classifierResp.usage.input_tokens` + `classifierResp.usage.output_tokens` (inside the try block around line 127)
   - Capture from Sonnet: `genResponse.usage.input_tokens` + `genResponse.usage.output_tokens` (after line ~306)
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before final `return NextResponse.json(...)` (line ~319)
   - Route: `'/api/contracts/chat'`, model: `'sonnet'` (primary), voyageTokens: `0`
   - Note: Early returns for disambiguation (lines ~143, ~153, ~227) don't have AI calls that need logging (classifier may have run for ~143 and ~153 but those returns also happen before the main Sonnet call) — need to handle classifier-only returns by logging what we have
   - Correction: The classifier runs before the disambiguation checks. So for the disambiguation returns at lines 143 and 153, the classifier has already run but Sonnet hasn't. We should still log those with whatever tokens the classifier used. For the disambiguation at line 227 (multiple contracts found), classifier + data retrieval ran. Should log there too.

7. **`src/app/api/legal-hub/wizard/ai-assist/route.ts`**
   - Currently: No token capture at all
   - Single Sonnet call (line ~120)
   - Add: capture `message.usage.input_tokens` + `message.usage.output_tokens`
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before `return NextResponse.json({ content })` (line ~135)
   - Route: `'/api/legal-hub/wizard/ai-assist'`, model: `'sonnet'`, voyageTokens: `0`

8. **`src/app/api/legal-hub/wizard/ai-polish/route.ts`**
   - Currently: No token capture at all
   - Single Sonnet call (line ~93)
   - Add: capture `message.usage.input_tokens` + `message.usage.output_tokens`
   - Add: import `logTokenUsage` + `PRICING`
   - Add: cost calculation + logging before `return NextResponse.json({ polishedHtml })` (line ~108)
   - Route: `'/api/legal-hub/wizard/ai-polish'`, model: `'sonnet'`, voyageTokens: `0`

## Logging Pattern (consistent across all routes)

```typescript
import { logTokenUsage } from "@/lib/db-imports";
import { PRICING } from "@/lib/constants";

// Before each return that follows AI call:
const costUsd =
  (inputTokens / 1_000_000) * PRICING.claude.sonnet.input +
  (outputTokens / 1_000_000) * PRICING.claude.sonnet.output +
  (voyageTokens / 1_000) * PRICING.voyage;

try {
  logTokenUsage({
    userId: Number(session.user.id),
    orgId: Number(session.user.orgId),
    route: '/api/...',
    model: 'sonnet',
    inputTokens,
    outputTokens,
    voyageTokens,
    costUsd,
  });
} catch (_) { /* silent */ }
```

## Design Decisions

1. **Where to place the log call**: Right before each `return NextResponse.json(...)` that follows an AI call. This ensures tokens are finalized.

2. **Early returns**: For routes with early returns before any AI call completes (e.g., validation errors), no logging is needed. For early returns after partial AI calls (e.g., contracts/chat disambiguation after classifier), log what we have.

3. **Contracts/chat complexity**: This route has multiple return paths after the classifier runs. I will add logging at every return point that follows at least one AI call, using the tokens accumulated so far.

4. **Legal-hub chat early return (max_tokens)**: The max_tokens truncation return at line 271 should also log, since the AI call did happen.

5. **Model field for desk/analyze**: Always `'sonnet'` since that's the primary model even when Haiku is used for extraction.

6. **Cost formula for Haiku-only returns in contracts/chat**: For disambiguation returns where only Haiku ran, use Haiku pricing. For the main return, use Sonnet pricing since that's the primary model. Actually, to keep it simple and per the plan spec ("sum tokens from both calls, log with model 'sonnet'"), I'll use Sonnet pricing for all contracts/chat returns including disambiguation ones where only Haiku ran. The cost difference is negligible for a classifier call.

   Revision: On reflection, for returns where only the Haiku classifier ran (no Sonnet call), using Sonnet pricing would overcount. But the plan explicitly says "log with model 'sonnet' (primary)". I'll follow the plan spec exactly.

## Risks

- **Multiple return paths**: contracts/chat and legal-hub/cases/chat have several return paths. Missing one would leave a gap. I will be thorough.
- **Variable shadowing**: legal-hub/cases/chat uses `message` as both a variable name for user input AND the variable name from `anthropic.messages.create()`. The existing code uses `genResponse` for the API result, so no conflict.

## Success Criteria Verification

1. After any AI call through any of the 8 routes, `logTokenUsage()` is called with correct userId, orgId, route, model, and non-zero tokens.
2. The `try/catch` wrapper ensures DB failures don't propagate to the response.
3. Cost formula uses `PRICING.claude.sonnet.input/output` (or haiku where specified) and `PRICING.voyage` with correct divisors (1M for Claude, 1K for Voyage).
