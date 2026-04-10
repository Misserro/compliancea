# Task 3 — Implementation Notes: Cross-step bulk status transitions

## Changes

- Modified: `src/lib/constants.ts` (lines 61-66) — expanded `CONTRACT_STATUS_ACTION_MAP`

## What changed

Added missing cross-step entries to enable bulk status transitions between non-adjacent statuses:

| Current status | New target entries added | Action string |
|---|---|---|
| unsigned | active | activate |
| unsigned | terminated | terminate |
| signed | terminated | terminate |
| active | unsigned | unsign |
| terminated | signed | deactivate |
| terminated | unsigned | unsign |

All 4 original adjacent transitions preserved unchanged:
- unsigned -> signed (sign)
- signed -> unsigned (unsign), signed -> active (activate)
- active -> signed (deactivate), active -> terminated (terminate)
- terminated -> active (reactivate)

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npx next build` — passes successfully
- No API or DB changes needed — all 6 actions (sign, activate, terminate, unsign, deactivate, reactivate) are already in the API route's `validActions` array at `src/app/api/documents/[id]/contract-action/route.ts:41`
- `transitionObligationsByStage` ignores `previousStage` — deactivates ALL stages != newStage, so cross-step transitions are safe

## INTEGRATION

None — this task is fully independent. No other tasks depend on this constant.
