## Task 2 Complete — Instrument All 8 AI Routes with Token Usage Logging

### Modified Files

1. **`src/app/api/ask/route.ts`**
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added logging at 2 return points: early return (no search results, line ~95) and main return (line ~155)
   - Route: `'/api/ask'`, model: `'sonnet'`, includes voyageTokens
   - Already had: `inputTokens`, `outputTokens`, `voyageTokens` tracking

2. **`src/app/api/analyze/route.ts`**
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added logging before main return (line ~205)
   - Route: `'/api/analyze'`, model: `'sonnet'`, voyageTokens: `0`
   - Already had: `inputTokens`, `outputTokens` tracking

3. **`src/app/api/nda/analyze/route.ts`**
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added logging before main return (line ~102)
   - Route: `'/api/nda/analyze'`, model: `'sonnet'`, voyageTokens: `0`
   - Already had: `inputTokens`, `outputTokens` tracking

4. **`src/app/api/desk/analyze/route.ts`**
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added logging before main return (line ~370)
   - Route: `'/api/desk/analyze'`, model: `'sonnet'`, voyageTokens included
   - Already had: `inputTokens`, `outputTokens`, `voyageTokens` tracking

5. **`src/app/api/legal-hub/cases/[id]/chat/route.ts`** (NEW token capture)
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added token capture: `genResponse.usage.input_tokens` + `genResponse.usage.output_tokens`
   - Created local `logUsage()` helper to DRY the 3 return paths (max_tokens, tool_use, text-only)
   - Route: `'/api/legal-hub/cases/chat'`, model: `'sonnet'`, voyageTokens: `0`

6. **`src/app/api/contracts/chat/route.ts`** (NEW token capture)
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added `let inputTokens = 0; let outputTokens = 0;` before try block
   - Captures tokens from Haiku classifier (`classifierResp.usage`) and Sonnet answer (`genResponse.usage`)
   - Created local `logUsage()` helper; called at 4 return paths: unknown disambiguation, needsSelectedContract, multiple contracts, and main answer
   - Route: `'/api/contracts/chat'`, model: `'sonnet'` (primary), voyageTokens: `0`

7. **`src/app/api/legal-hub/wizard/ai-assist/route.ts`** (NEW token capture)
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added token capture: `message.usage.input_tokens` + `message.usage.output_tokens`
   - Added logging before return
   - Route: `'/api/legal-hub/wizard/ai-assist'`, model: `'sonnet'`, voyageTokens: `0`

8. **`src/app/api/legal-hub/wizard/ai-polish/route.ts`** (NEW token capture)
   - Added imports: `logTokenUsage` from `@/lib/db-imports`, `PRICING` from `@/lib/constants`
   - Added token capture: `message.usage.input_tokens` + `message.usage.output_tokens`
   - Added logging before return
   - Route: `'/api/legal-hub/wizard/ai-polish'`, model: `'sonnet'`, voyageTokens: `0`

### Design Notes

- **Fire-and-forget pattern**: Every `logTokenUsage()` call is wrapped in `try/catch` with empty catch block, ensuring DB failures never propagate to API responses
- **Cost formula**: `(inputTokens / 1_000_000) * PRICING.claude.sonnet.input + (outputTokens / 1_000_000) * PRICING.claude.sonnet.output + (voyageTokens / 1_000) * PRICING.voyage`
- **DRY for multi-return routes**: cases/chat and contracts/chat use a local `logUsage()` closure to avoid repeating the log block at each return point
- **contracts/chat**: Token tracking variables declared outside try block so they accumulate across both classifier and answer calls, and survive early returns
- **Model field**: All routes use `'sonnet'` since that's the primary model. contracts/chat sums Haiku+Sonnet tokens under `'sonnet'` per plan spec

### INTEGRATION notes for downstream tasks
- Task 3 (dashboard): Can now query `token_usage` table for per-user aggregates — all 8 routes write rows
- Task 4 (Anthropic singleton): Will replace `new Anthropic(...)` in all 8 files — my changes don't conflict as they only add imports and logging blocks

### Known issue (pre-existing from Task 1)
- `src/lib/db-imports.ts` has TS2305 errors for `logTokenUsage` and `getTokenUsageSummary` because `lib/db.js` is a CJS module without matching type declarations. This is a Task 1 issue, not introduced by Task 2. The functions exist at runtime and work correctly.
