# Task 3 — Implementation Plan: Cross-step bulk status transitions

## Summary

Add missing cross-step entries to `CONTRACT_STATUS_ACTION_MAP` in `src/lib/constants.ts` so that bulk status changes can jump between non-adjacent statuses (e.g., unsigned -> active, terminated -> unsigned).

## Files to modify

- `src/lib/constants.ts` — lines 61-66, the `CONTRACT_STATUS_ACTION_MAP` constant

No other files need changes. The API route already accepts all six actions (sign, activate, terminate, unsign, deactivate, reactivate) and `transitionObligationsByStage` ignores `previousStage`, so cross-step transitions are safe at both API and DB layers.

## Specific changes

Replace the current 4-entry map:

```ts
export const CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>> = {
  unsigned: { signed: "sign" },
  signed: { unsigned: "unsign", active: "activate" },
  active: { signed: "deactivate", terminated: "terminate" },
  terminated: { active: "reactivate" },
};
```

With the full cross-step map:

```ts
export const CONTRACT_STATUS_ACTION_MAP: Record<string, Record<string, string>> = {
  unsigned: { signed: "sign", active: "activate", terminated: "terminate" },
  signed: { unsigned: "unsign", active: "activate", terminated: "terminate" },
  active: { signed: "deactivate", terminated: "terminate", unsigned: "unsign" },
  terminated: { active: "reactivate", signed: "deactivate", unsigned: "unsign" },
};
```

All previously existing entries are preserved. New entries added per status:
- `unsigned`: +activate, +terminate
- `signed`: +terminate
- `active`: +unsign
- `terminated`: +deactivate, +unsign

## How success criteria are satisfied

1. "Active" for "Inactive" (unsigned) contract: `CONTRACT_STATUS_ACTION_MAP["unsigned"]["active"]` now returns `"activate"` instead of `undefined` -- transition is applied, not skipped.
2. "Inactive" for "Terminated" contract: `CONTRACT_STATUS_ACTION_MAP["terminated"]["unsigned"]` now returns `"unsign"` instead of `undefined` -- transition is applied.
3. All adjacent transitions preserved: every original entry is kept verbatim.
4. TypeScript clean: no type changes, the type is `Record<string, Record<string, string>>` which accepts any string keys.
5. Build passes: constant-only change, no imports or component changes.

## Risks

- None significant. The change is additive -- only adds new keys to existing objects. The API and DB layers already support all these actions.
