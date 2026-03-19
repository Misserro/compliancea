# Task 2 Plan — Frontend: ProposalCard + Confirm/Apply Flow

## Overview

Create `ActionProposalCard` component and integrate it into `CaseChatPanel` to render action proposals from the backend, handle confirm/cancel interactions, and refresh case data after mutations are applied.

## Types

```ts
interface ActionItem {
  tool: string;
  params: Record<string, unknown>;
  label: string;
}

interface ActionProposal {
  type: "action_proposal";
  proposalText: string;
  actions: ActionItem[];
}
```

These will be defined in `action-proposal-card.tsx` and imported into `case-chat-panel.tsx`.

## File 1: `src/components/legal-hub/action-proposal-card.tsx` (NEW)

### Props
- `proposal: ActionProposal` — the proposal data from backend
- `caseId: number` — for the apply API call
- `onApplied: () => void` — callback after successful apply
- `onRejected: () => void` — callback after cancel

### State
- `loading: boolean` — true while POST is in flight
- `error: string | null` — error message from failed apply
- `applied: boolean` — true after successful apply
- `rejected: boolean` — true after cancel

### Behavior
- **Confirm**: POST `/api/legal-hub/cases/${caseId}/actions/apply` with `{ actions: proposal.actions }`. On success: set `applied=true`, call `onApplied()`. On error: set error message, keep buttons for retry.
- **Cancel**: set `rejected=true`, call `onRejected()`.

### Layout
Uses `Card` from `@/components/ui/card` and `Button` from `@/components/ui/button`.

```
Card (bg-muted/30 border)
  proposalText paragraph (text-sm)
  Separator
  "Proponowane zmiany:" label (text-xs font-medium)
  ul with action.label items (text-xs, list-disc)
  Footer:
    - Default: [Zatwierdz] (primary, sm) + [Anuluj] (outline, sm)
    - Loading: [Zatwierdz] with Loader2 spinner, disabled + [Anuluj] disabled
    - Applied: "Zmiany zostaly zastosowane." text (text-xs text-green-700)
    - Rejected: "Propozycja odrzucona." text (text-xs text-muted-foreground)
    - Error: error text (text-xs text-destructive) + buttons still active
```

No emoji. Professional legal style. Polish UI text.

## File 2: `src/components/legal-hub/case-chat-panel.tsx` (MODIFY)

### Changes

1. **Import** `ActionProposalCard` and types from `./action-proposal-card`
2. **Import** `useRouter` from `next/navigation`
3. **Add** `useRouter()` in component body
4. **Add** `isActionProposal` type guard function (after existing `isStructuredAnswer`)
5. **Extend** `ChatMessage` interface: add `actionProposal?: ActionProposal | null`
6. **Update** `sendMessage` response handler: after the `isStructuredAnswer(data)` check, add an `else if (isActionProposal(data))` branch that sets `actionProposal` on the message and `content` to `data.proposalText`
7. **Update** message rendering: add a branch for `msg.actionProposal` that renders `<ActionProposalCard>` instead of plain text. This goes between the `msg.structuredAnswer` and fallback `msg.content` branches.
8. **Pass callbacks**: `onApplied={() => router.refresh()}`, `onRejected={() => {}}` (cancel is handled internally by the card showing "Propozycja odrzucona.")

### Type Guard

```ts
function isActionProposal(data: unknown): data is ActionProposal {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === "action_proposal" &&
    Array.isArray((data as Record<string, unknown>).actions)
  );
}
```

## No Regressions

- Existing `isStructuredAnswer` path is checked first and remains unchanged
- `ActionProposal` has a distinct `type: "action_proposal"` field that won't match structured answers
- Fallback plain text path remains for any unrecognized response shape

## Dependencies

- Task 1 must be complete (backend returns `ActionProposal` JSON and `/actions/apply` endpoint exists)
- Uses existing UI components: `Card`, `CardContent`, `CardFooter`, `Button`, `Separator`
- Uses `Loader2` icon from lucide-react (already imported in case-chat-panel)
