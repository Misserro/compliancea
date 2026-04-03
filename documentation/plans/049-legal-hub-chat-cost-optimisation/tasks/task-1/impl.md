# Task 1 Implementation — Prompt Caching: System Prompt + Tool Schemas

## Changes

### Modified: `src/lib/constants.ts`
- Added `cacheRead: 0.30` and `cacheWrite: 3.75` to `PRICING.claude.sonnet` (line 110)
- `as const` preserved — TypeScript infers literal types for the new fields

### Modified: `src/app/api/legal-hub/cases/[id]/chat/route.ts`
- **System prompt** (line 268): Changed from `system: groundedSystemPrompt` (plain string) to `system: [{ type: "text", text: groundedSystemPrompt, cache_control: { type: "ephemeral" } }]` (content block array with cache control)
- **Tools** (lines 259-263): Created `cachedTools` array by spreading `CASE_CHAT_TOOLS` with `cache_control: { type: "ephemeral" }` on the last tool (`updateCaseStatus`). Original `CASE_CHAT_TOOLS` constant is not mutated.
- **Cost logging** (lines 279-287): Added `cacheReadTokens` and `cacheWriteTokens` extracted from `genResponse.usage.cache_read_input_tokens` and `genResponse.usage.cache_creation_input_tokens`. Cost formula now includes cache read and write costs.

## Verification

- `tsc --noEmit` passes with zero errors
- Anthropic SDK (`@anthropic-ai/sdk`) natively supports `cache_control?: CacheControlEphemeral | null` on both `Tool` and `TextBlockParam` types — no type assertions needed
- SDK `Usage` type includes `cache_read_input_tokens: number | null` and `cache_creation_input_tokens: number | null`
- On second request within 5 minutes, Anthropic will return `cache_read_input_tokens > 0` for the cached system prompt and tool schemas prefix

## INTEGRATION notes for Task 3
- Task 3 (Session Priming Context Cache) will further modify the `messages` array structure and the cost logging. The `cachedTools` pattern established here is independent and will not conflict.
- Task 3 should build on the cache token logging already added here.
