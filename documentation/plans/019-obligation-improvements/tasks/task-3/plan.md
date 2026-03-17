# Task 3 Plan -- Obligation card and view redesign

## Overview

Redesign `ObligationCard` for clarity and actionability. Create `CompleteObligationDialog`. Fix `logAction` double-serialization in the finalize route. The obligations page layout (task 1) is already functional -- no page-level changes needed.

## Files to Create

### 1. `src/components/obligations/complete-obligation-dialog.tsx` (NEW)

A Radix Dialog for completing an obligation. Imports Dialog primitives from `@/components/ui/dialog`.

**Props:**
- `obligationId: number`
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `onCompleted: () => void`

**State:**
- `note: string` -- textarea value
- `selectedDocumentId: number | null`
- `selectedDocumentName: string | null`
- `submitting: boolean`
- `validationError: string | null`
- `showDocumentPicker: boolean`

**Behavior:**
- Title: "Complete Obligation", Description: "Add a note or attach a document as proof of completion."
- Fields: Note textarea (placeholder "Describe how this obligation was fulfilled..."), "Attach from library" button that opens `EvidenceDialog` (reuse existing component, but in a document-selection-only mode -- actually, we will use a simplified inline document list fetched from `/api/documents`, since EvidenceDialog has its own purpose of adding evidence with notes)
- Validation: on submit, if `note.trim() === ''` AND `selectedDocumentId === null`, set `validationError` to "Please add a note or attach a document"
- Submit: POST to `/api/obligations/${obligationId}/finalize` with `{ note: note.trim() || undefined, documentId: selectedDocumentId || undefined }`
- On success: `toast.success("Obligation completed")`, call `onCompleted()`, close dialog
- On error: `toast.error(data.error || "Failed to complete obligation")`

**Document picker approach:** Rather than nesting a full EvidenceDialog inside, use a simple inline list. Fetch `/api/documents` on open, show a scrollable list of processed documents. User clicks one to select, sees selection indicator. A "Remove" link clears the selection. This mirrors how EvidenceDialog works but avoids nested Dialog focus-trap conflicts.

## Files to Modify

### 2. `src/components/obligations/obligation-card.tsx` (MODIFY -- full redesign)

**Current state:** Collapsible card with inline-editable fields, payment schedule table, inline finalize flow.

**New design:**

**Surface (always visible):**
- Left `border-l-4` in category color (keep existing pattern using `CATEGORY_BORDER_COLORS`)
- Row layout: `[chevron] [category badge] [title, bold, truncate] [spacer] [due date chip] [status badge] [Evidence icon btn] [Complete btn]`
- Due date chip logic:
  - No due date: don't show chip
  - Normal: gray text, show formatted date
  - Within 7 days: amber text + amber background
  - Overdue (past + status !== 'met' && status !== 'finalized'): red background + "Overdue" prefix
- Status badge using `STATUS_COLORS[ob.status]`
- Evidence button: icon-only `Paperclip` from Lucide, variant="ghost", size="icon", `onClick` calls `onAddEvidence(ob.id)` -- stops propagation
- Complete button: `variant="outline"` size="sm"
  - If `status === 'met' || status === 'finalized'`: disabled, shows `<CheckCircle />` + "Completed"
  - Else: shows "Complete", onClick opens CompleteObligationDialog -- stops propagation
- Card body click toggles expanded section (chevron indicates expandability)

**Expanded section:**
- Owner (read-only display, not inline-editable input)
- Description (if set)
- Clause reference (if set, prefixed with "Clause: ")
- Category-specific fields section (read-only):
  - payment: "Amount: [formatted amount] | Currency: [currency]"
  - reporting: "Frequency: [freq] | Recipient: [recipient]"
  - compliance: "Regulatory Body: [body] | Jurisdiction: [jurisdiction]"
  - operational: "Service Type: [type] | SLA Metric: [metric]"
- Repeating info: if `is_repeating === 1`, show "Repeats every N days"
- Evidence list with remove button (using AlertDialog for confirmation instead of `window.confirm`)
- Completion record: if `finalization_note` or `finalization_document_id` is set, show green-tinted box with note text and document name (will need to fetch document name or use a stored reference)
- AI compliance check button at bottom (keep existing)
- Status selector (keep existing, for changing to waived/failed)

**State changes:**
- Keep: `isOpen`, `checking`
- Remove: `showFinalize`, `finalizeNote`, `finalizing`
- Add: `completeDialogOpen: boolean`, `deletingEvidenceIndex: number | null`

**Remove from card:**
- Inline-editable inputs for owner, escalation_to, department (move to read-only display)
- Payment schedule table from `details_json`
- `showFinalize` inline finalization flow
- `handleFinalize` function
- `window.confirm()` usage on evidence removal (replace with AlertDialog)

**Keep all callback props:**
- `onUpdateField` -- still used for status changes
- `onAddEvidence` -- still used for Evidence button
- `onRemoveEvidence` -- still used but with AlertDialog confirmation
- `onCheckCompliance` -- still used for AI check
- `onFinalize` -- signature changes: no longer called directly; CompleteObligationDialog calls the API itself and then calls a refresh callback

**Props change:**
- Replace `onFinalize?: (id: number, note: string) => void` with `onCompleted?: () => void` -- called after successful completion to trigger parent refresh
- All other props remain unchanged

### 3. `src/app/api/obligations/[id]/finalize/route.ts` (MODIFY -- fix logAction)

Single-line change:
```
// Before:
await logAction("obligation", id, "finalized", JSON.stringify({ note, documentId }));

// After:
await logAction("obligation", id, "finalized", { note: note ?? null, documentId: documentId ?? null });
```

### 4. `src/components/contracts/per-contract-obligations.tsx` (MODIFY -- adapt to new props)

Update `ObligationCard` usage to use the new `onCompleted` prop instead of `onFinalize`:
- Replace `onFinalize={async (id, note) => { ... }}` with `onCompleted={() => refreshObligations()}`
- Keep all other callback props unchanged

## Success Criteria Mapping

| Criterion | Implementation |
|-----------|---------------|
| Card shows category badge, title, due date chip, status badge, Evidence + Complete buttons without expanding | New surface layout in obligation-card.tsx |
| Complete button disabled with checkmark for met/finalized | Conditional rendering based on `ob.status` |
| Clicking Complete opens dialog; empty submit shows validation error | CompleteObligationDialog with client-side validation |
| Completing with note stores and displays it | Dialog POSTs to /finalize, expanded card shows `finalization_note` |
| Completing with document stores and displays it | Dialog POSTs documentId, expanded card shows `finalization_document_id` with document name |
| npm run build passes | TypeScript-clean implementation |

## Risks and Mitigations

1. **Nested Dialog focus-trap conflict**: Using EvidenceDialog inside CompleteObligationDialog would create nested Radix Dialogs with conflicting focus traps. Mitigation: build inline document picker inside the dialog instead.

2. **ObligationCard prop change (onFinalize -> onCompleted)**: Breaking change for consumers. Mitigation: `per-contract-obligations.tsx` is the only consumer, and we update it in the same task.

3. **Document name display in completion record**: The `Obligation` type has `finalization_document_id` but no `finalization_document_name`. Mitigation: when displaying the completion record, either fetch the document name from the joined query (the API already joins documents), or add a secondary fetch. The `getAllObligations` query already joins document name. For the per-contract view, obligations are fetched via `getObligationsByDocumentId` which does NOT join finalization document name. We may need to show the document ID as a fallback or add a small fetch. Simplest approach: show "Document attached" with a link to `/documents` if document_id is set, without needing the name.

4. **window.confirm removal**: The existing card uses `window.confirm()` for evidence removal. This violates the design system standard. Mitigation: replace with AlertDialog state management.

## Dependencies

- Task 2 (COMPLETE): category-specific fields on Obligation type and constants -- confirmed available per task-2/impl.md
- Task 1 (COMPLETE): obligations page layout -- confirmed available, no changes needed from this task
