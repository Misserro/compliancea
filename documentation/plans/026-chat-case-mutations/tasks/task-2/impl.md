# Task 2 Implementation — Frontend: ProposalCard + Confirm/Apply Flow

## Status: Complete

## Files Changed

### Created: `src/components/legal-hub/action-proposal-card.tsx`
- Exports `ActionProposalCard` component, `ActionItem` and `ActionProposal` types
- Props: `proposal`, `caseId`, `onApplied`, `onRejected`
- State: `loading`, `error`, `applied`, `rejected`
- Confirm: POST to `/api/legal-hub/cases/${caseId}/actions/apply` with `{ actions: proposal.actions }`
- On success: shows "Zmiany zostały zastosowane.", calls `onApplied()`
- On error: shows error inline, keeps buttons active for retry
- On cancel: shows "Propozycja odrzucona.", calls `onRejected()`
- Uses Card, CardContent, CardFooter, Button, Separator, Loader2
- Professional legal style, no emoji

### Modified: `src/components/legal-hub/case-chat-panel.tsx`
- Added imports: `useRouter` from `next/navigation`, `ActionProposalCard` and `ActionProposal` type
- Added `isActionProposal` type guard (after existing `isStructuredAnswer`)
- Extended `ChatMessage` interface with `actionProposal?: ActionProposal | null`
- Added `const router = useRouter()` in component body
- Added `else if (isActionProposal(data))` branch in `sendMessage` response handler
- Added rendering branch for `msg.actionProposal` — renders `ActionProposalCard` with `onApplied={() => router.refresh()}`
- Existing Q&A/citation paths unchanged (no regression)

## Verification
- TypeScript compiles clean (`tsc --noEmit` passes with no errors)
