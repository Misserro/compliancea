# Lead Notes — Plan 037: AI Template Assist

## Overview
Adds two AI capabilities to the Template Wizard (Plan 036):
1. **Section AI Assist** — per-section AI content generation with mode toggle (template vars / real prose) + optional user hint
2. **Document Polish** — full AI rewrite of assembled document into cohesive Polish legal language, with accept/revert UI

## Concurrency Decision
2 concurrent task-teams. Tasks 1 & 3 run in parallel (both API routes — independent). Tasks 2 & 4 pipeline-spawn when 1 & 3 enter review/test respectively. Task 4 also waits for Task 2 (same file: template-wizard.tsx).

## Task Dependency Graph
- Task 1 (Section AI Assist API): no dependencies
- Task 2 (Section AI Assist UI): depends on Task 1
- Task 3 (Document Polish API): no dependencies
- Task 4 (Document Polish Wizard Step): depends on Task 2 + Task 3

## Key Architectural Constraints

### Must Follow Existing Patterns
- **No shared AI client factory** — each route does `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` inline
- **File-based system prompts** — `fs.readFile(path.join(process.cwd(), "prompts/xxx.md"))` — NOT inline strings
- **Model**: `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`
- **Non-streaming** — `anthropic.messages.create` awaited, consistent with all existing routes
- **Auth pattern**: NextAuth session via `auth()` from `@/auth` (NOT `@/lib/auth-imports` — confirmed by reviewer-1 from codebase scan), 401 if no session
- **Org check**: verify user belongs to org (follow pattern in existing legal-hub routes)

### Variable Preservation Contract
Both API routes must instruct Claude via system prompt: treat `{{...}}` tokens as sacred — reproduce verbatim, never substitute, expand, or remove. This is the primary guard against template tokens being collapsed into literal values.

### Token Limits
- Section assist: `max_tokens: 1024` (section content only)
- Document polish: `max_tokens: 4096` (full document rewrite)

### Wizard Flow Change
```
"blueprint" → 0...N-1 → "ai-polish" → onComplete(html)
```
WizardStep type: `"blueprint" | number | "ai-polish"` (add "ai-polish" variant)

### WizardSection Extension (src/lib/wizard-blueprints.ts)
Add optional fields (runtime only, not persisted):
```ts
aiMode?: "template" | "real";  // defaults to "template"
aiHint?: string;
```

## Critical Decisions
- Non-streaming chosen for consistency with all existing AI routes
- "ai-polish" step placed after all sections, before onComplete — not inside the editor
- Skip button on polish step ensures feature never blocks wizard completion
- combineWizardSections() reused server-side in polish route to assemble input HTML

## Files of Interest
- `src/components/legal-hub/template-wizard.tsx` — main wizard (Tasks 2 & 4 both touch this)
- `src/lib/wizard-blueprints.ts` — WizardSection type, combineWizardSections()
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — reference AI route pattern
- `src/app/api/ask/route.ts` — reference AI route pattern (simpler)
- `prompts/ask.md`, `prompts/case-chat-grounded.md` — reference prompt files

## Execution Log

## Execution Complete

**Plan:** 037-ai-template-assist
**Tasks:** 4 completed, 0 skipped, 0 escalated
**Wall-clock:** ~19 minutes
**Final gate:** PASSED (709/709 tests, TypeScript clean)

### Tasks Completed
- **Task 1** (Section AI Assist API): `POST /api/legal-hub/wizard/ai-assist` + `prompts/wizard-section-assist.md`
- **Task 2** (Section AI Assist UI): AI mode toggle, hint textarea, Generuj z AI button in wizard section steps; WizardSection type extended; WizardStep type exported
- **Task 3** (Document Polish API): `POST /api/legal-hub/wizard/ai-polish` + `prompts/wizard-document-polish.md`; fix: added `ensureDb()` per REST standard
- **Task 4** (Document Polish Wizard Step): Full "ai-polish" step with idle/loading/done/error states, accept/revert/skip

### Files Modified
- `src/app/api/legal-hub/wizard/ai-assist/route.ts` — created
- `prompts/wizard-section-assist.md` — created
- `src/app/api/legal-hub/wizard/ai-polish/route.ts` — created
- `prompts/wizard-document-polish.md` — created
- `src/lib/wizard-blueprints.ts` — WizardSection extended, WizardStep exported
- `src/components/legal-hub/template-wizard.tsx` — AI assist UI + ai-polish step

### Decisions Made During Execution
- Auth import corrected to `@/auth` (not `@/lib/auth-imports`) based on reviewer-1 codebase scan
- `ensureDb()` added to ai-polish route after reviewer-3 FAIL (REST standard requires it in every handler)
- Polish diacritics restored ("Treść rzeczywista", "Wskazówka dla AI") after reviewer-2 FAIL
- React render side-effect fixed: `AiPolishPlaceholder` component with useEffect replaced inline `onComplete` call

### Test Results
- Per-task tests: 4/4 PASS (reviewers + testers each passed)
- Final gate: PASS — 709/709 tests, `npx tsc --noEmit` clean
