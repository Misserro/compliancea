## Task 3 Complete -- Obligation card and view redesign

### Files Created
- `src/components/obligations/complete-obligation-dialog.tsx` (NEW) -- Dialog for completing obligations with note and/or document attachment

### Files Modified
- `src/components/obligations/obligation-card.tsx` (FULL REWRITE) -- Redesigned card surface and expanded section
- `src/app/api/obligations/[id]/finalize/route.ts` (SINGLE-LINE FIX) -- Fixed logAction double-serialization
- `src/components/contracts/per-contract-obligations.tsx` (PROP CHANGE) -- Replaced onFinalize with onCompleted

### Key Changes

**ObligationCard surface row:**
- Category badge, title (truncated), due date chip (red if overdue, amber if within 7 days), status badge, Evidence (Paperclip) icon button, Complete button
- Complete button disabled with CheckCircle icon for met/finalized statuses
- Clicking Complete opens CompleteObligationDialog (stopPropagation to avoid toggling collapse)
- Evidence icon button calls onAddEvidence with stopPropagation

**ObligationCard expanded section:**
- Owner, description, clause reference displayed read-only (removed inline-editable inputs)
- Category-specific fields: payment (amount/currency), reporting (frequency/recipient), compliance (regulatory body/jurisdiction), operational (service type/SLA metric)
- Start date, recurrence info
- Evidence list with AlertDialog confirmation for removal (replaced window.confirm)
- Completion record: green-tinted box showing finalization_note and/or finalization_document_id
- AI compliance check button and status selector preserved

**CompleteObligationDialog:**
- Note textarea + inline document picker (fetches /api/documents, shows processed docs)
- Validation: requires either note or document, shows error message
- Submits to /api/obligations/{id}/finalize, calls onCompleted on success
- Inline document picker avoids nested Dialog focus-trap conflicts

**Style compliance:**
- All conditional classNames use `cn()` from `@/lib/utils`
- Status colors use `STATUS_COLORS` from `@/lib/constants`
- Category colors use `CATEGORY_COLORS` / `CATEGORY_BORDER_COLORS` from `@/lib/constants`
- Evidence removal uses AlertDialog from `@/components/ui/alert-dialog`
- No template literal concatenation for classNames

**Props change:**
- `onFinalize?: (id: number, note: string) => void` replaced with `onCompleted?: () => void`
- Only consumer (per-contract-obligations.tsx) updated in same task

### Build
- `npm run build` passes cleanly

### INTEGRATION
- Task 4+ should be aware that ObligationCard no longer accepts `onFinalize` prop -- use `onCompleted` instead
- CompleteObligationDialog handles the API call internally; parent only needs to provide a refresh callback
