# Task 1 Plan — Prompt Caching: System Prompt + Tool Schemas

## Objective

Add Anthropic prompt caching (`cache_control: { type: "ephemeral" }`) to the system prompt and tool schemas in the Legal Hub chat route. Add cache pricing constants.

## Files to Modify

### 1. `src/lib/constants.ts`
- **Change:** Add `cacheRead: 0.30` and `cacheWrite: 3.75` to `PRICING.claude.sonnet`
- **Concern:** PRICING is declared `as const`. Adding new fields requires removing `as const` or restructuring. Since all other consumers only access `.input` and `.output` (verified via grep), I will change the declaration to use a typed object without `as const` so that new fields are accessible. Alternatively, I can keep `as const` and just add the fields inline — TypeScript infers literal types for `as const` objects, so adding new properties is fine as long as they're in the literal.
- **Decision:** Simply add the two new fields inside the existing object literal. `as const` will still work — it infers the literal types for all fields including the new ones. No type breakage.

### 2. `src/app/api/legal-hub/cases/[id]/chat/route.ts`
- **Change 1 — System prompt:** Replace `system: groundedSystemPrompt` (string) with `system: [{ type: "text", text: groundedSystemPrompt, cache_control: { type: "ephemeral" } }]` (content block array).
- **Change 2 — Tools:** Replace `tools: CASE_CHAT_TOOLS` with a spread that adds `cache_control` to the last tool:
  ```ts
  const cachedTools: Anthropic.Tool[] = [
    ...CASE_CHAT_TOOLS.slice(0, -1),
    { ...CASE_CHAT_TOOLS[CASE_CHAT_TOOLS.length - 1], cache_control: { type: "ephemeral" } },
  ];
  ```
  Then pass `tools: cachedTools` to the API call. This does not mutate the `CASE_CHAT_TOOLS` constant.
- **Change 3 — Cost logging:** Update `logUsage` to include cache tokens in cost calculation. Read `cache_creation_input_tokens` and `cache_read_input_tokens` from `genResponse.usage` and factor them into the cost formula.

## TypeScript Considerations

- The `cache_control` field on tool definitions may require a type assertion if the SDK types don't include it. The Anthropic SDK types for `Tool` may or may not have `cache_control`. If not present, I will use a spread with `as any` on just the cache_control property, or cast the tool array. I will check the SDK types first.
- The system parameter accepts `string | Array<TextBlockParam>`. The array form with `cache_control` should be supported by the SDK.

## Success Criteria Verification

1. `system` parameter is `[{ type: "text", text: groundedSystemPrompt, cache_control: { type: "ephemeral" } }]` — yes
2. Last tool has `cache_control` via spread (no mutation) — yes
3. `PRICING.claude.sonnet.cacheRead = 0.30` and `.cacheWrite = 3.75` — yes
4. `tsc --noEmit` passes — will verify
5. Cache read tokens > 0 on second request — verifiable by code inspection (Anthropic returns this in usage when cache hits)

## Risks

- SDK type compatibility for `cache_control` on tools — mitigated with type assertion if needed
- No runtime risk — `cache_control` is purely an optimization hint to Anthropic's API
