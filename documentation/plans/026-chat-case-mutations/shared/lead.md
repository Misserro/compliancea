# Lead Notes — Plan 026: Chat-Driven Case Mutations

## Plan Overview

Add tool_use capability to the case chat so Claude can propose structured case data mutations (metadata, parties, deadlines, status changes) which the user reviews and confirms before being applied. Includes document-driven extraction: Claude reads document evidence from the RAG pipeline and proposes structured updates.

## Concurrency
2 tasks, sequential. Task 2 pipeline-spawned while Task 1 is in review/test.

## Task Dependency Graph
- Task 1: no dependencies — backend tool_use integration
- Task 2: depends on Task 1 — frontend ProposalCard UI

## Critical Technical Notes

### Tool_use vs. prefill incompatibility
- Current chat route uses prefilled assistant turn: `{ role: "assistant", content: "{" }`
- This is INCOMPATIBLE with tool_use
- Must be removed when adding tools
- System prompt must be strengthened to ensure JSON output for text responses
- After removal: Claude outputs either text (parse as StructuredAnswer) OR tool_use blocks (convert to ActionProposal)

### Status field gap
- `updateLegalCase` in db.js supports `status` field
- PATCH /api/legal-hub/cases/[id] route has an allowlist that EXCLUDES `status`
- Must extend the PATCH allowlist OR call `updateLegalCase` directly from the apply endpoint
- Decision: call `updateLegalCase` directly from apply endpoint (simpler, no API surface change needed for mutation)

### Party IDs in context
- `updateParty` tool requires knowing the party's database ID
- Current `buildStructuredContext` includes party names but NOT their IDs
- Must include party IDs in the [DANE SPRAWY] context block

### ActionProposal response shape
```json
{
  "type": "action_proposal",
  "proposalText": "...",
  "actions": [
    { "tool": "addDeadline", "params": {...}, "label": "..." }
  ]
}
```

### Apply endpoint
- POST /api/legal-hub/cases/[id]/actions/apply
- Takes { actions: ActionItem[] }
- Applies each action by calling the appropriate DB helper directly (not re-routing through existing API endpoints)
- Returns { applied: string[], errors: string[] }
- Logs each applied action to audit_log

### Tools to define (5)
1. updateCaseMetadata — court, reference_number, internal_number, judge, case_type, procedure_type, court_division, summary, claim_description, claim_value, claim_currency
2. addParty — name, party_type (enum), address?, representative_name?, representative_address?, representative_type?, notes?
3. updateParty — party_id (number), + same optional fields as addParty
4. addDeadline — title, deadline_type (enum), due_date (YYYY-MM-DD), description?
5. updateCaseStatus — status (enum: active|signed|unsigned|terminated|closed|other), note?

### Parent refresh
- CaseChatPanel only receives caseId from parent
- After mutations applied: call router.refresh() from Next.js navigation
- This re-fetches server component data (legalCase, parties, deadlines) without full page reload

## Files to Change

Task 1 (backend):
- src/app/api/legal-hub/cases/[id]/chat/route.ts — add tools, remove prefill, handle tool_use blocks
- src/app/api/legal-hub/cases/[id]/actions/apply/route.ts — NEW apply endpoint
- prompts/case-chat-grounded.md — add tool usage instructions section

Task 2 (frontend):
- src/components/legal-hub/action-proposal-card.tsx — NEW proposal UI component
- src/components/legal-hub/case-chat-panel.tsx — detect ActionProposal, render card, router.refresh()

## Execution Log

(populated during execution)
