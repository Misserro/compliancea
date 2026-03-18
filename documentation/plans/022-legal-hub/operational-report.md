# Operational Report: 022-legal-hub

**Generated:** 2026-03-18T14:31:26.000Z
**Plan:** Legal Hub — professional case management module for law firms
**Tasks:** 5 total, 5 completed, 0 skipped, 0 escalated

---

## Executive Summary

Execution completed successfully in ~108 minutes wall-clock time, though ~16 minutes of that was lost at the very start due to persistent HTTP 529 (API overload) errors on the Opus model tier that required a model-tier fallback to Sonnet. Once Sonnet was adopted for the executor role, the pipeline ran steadily with good concurrency utilisation. The biggest systemic friction was a recurring pattern of review failures (4 of 5 tasks failed first-pass review) driven by unwritten API route conventions around error handling, audit logging, and HTTP status codes — issues that a single standards document addition would prevent across all future plans.

---

## Timeline

| Task | Planning | Implementation | Review | Total | Retries |
|------|----------|----------------|--------|-------|---------|
| task-1: DB schema + Case Registry API + Dashboard | ~20 min (incl. ~16 min 529 downtime) | ~9 min | ~38 min (1 fail cycle) | ~69 min | 5 (4× 529, 1× review) |
| task-2: Case Detail UI | ~38 min | ~6 min | ~9 min | ~53 min | 0 |
| task-3: Case Document Repository | ~7 min | ~16 min | ~11 min (1 fail cycle) | ~23 min | 1 |
| task-4: Template-based Document Generation | ~7 min | ~24 min | ~12 min (1 fail cycle) | ~31 min | 1 |
| task-5: Grounded Case Chat | ~4 min | ~7 min | ~4 min (1 fail cycle) | ~12 min | 1 |

**Total wall-clock time:** ~108 minutes (12:43 – 14:31)
**Effective work time:** ~92 minutes (excluding ~16 min Opus 529 downtime on task-1)
**Pipeline utilisation:** High — every available concurrency slot was productively used throughout. Pipeline spawning (planning during predecessor's review) eliminated all inter-task blocking time.

---

## Incidents

### Stalls Detected

None detected after the initial 529 incident. All agents remained responsive throughout.

### Rate Limits / API Overload

| Start | End | Duration | Agents Affected | Recovery |
|-------|-----|----------|-----------------|---------|
| 12:46:29 | 12:59:49 | ~13 min | executor-1 (Opus) | Model-tier switch: Opus → Sonnet |

**Details:** executor-1 hit HTTP 529 (server-side API overload) three times in succession on the Opus model tier between 12:43 and 12:59. This is distinct from a quota-based 429 rate limit — it indicates Anthropic API capacity pressure at that moment, specifically on Opus. After the third consecutive failure the Lead made the correct decision to switch executor-1 to Sonnet, which succeeded immediately on first attempt. The 529s did not recur on any subsequent task or agent. Sonnet-tier agents were unaffected throughout.

### Agent Crashes / Re-spawns

| Time | Task | Agent | Detected By | Recovery |
|------|------|-------|-------------|----------|
| 12:46:29 | task-1 | executor-1 (Opus) | Lead | Re-spawned on Opus (attempt 2) |
| 12:51:04 | task-1 | executor-1 (Opus) | Lead | Re-spawned on Opus (attempt 3) |
| 12:55:13 | task-1 | executor-1 (Opus) | Lead | Re-spawned on Opus (attempt 4) |
| 12:59:49 | task-1 | executor-1 (Opus→Sonnet) | Lead | Re-spawned on Sonnet — succeeded |

---

## Token Efficiency Analysis

### Per-Task Cost Breakdown

| Task | Planning | Impl | Review | Retries | Idle Wait | Total Est. |
|------|----------|------|--------|---------|-----------|------------|
| task-1 | wasteful (16 min 529 downtime burned context repeatedly) | efficient | wasteful (38 min) | x5 | reviewer+tester idle ~20 min | high |
| task-2 | acceptable | efficient | efficient | x0 | reviewer+tester idle ~38 min | acceptable |
| task-3 | efficient | efficient | acceptable | x1 | reviewer+tester idle ~7 min | efficient |
| task-4 | efficient | acceptable | acceptable | x1 | reviewer+tester idle ~7 min | efficient |
| task-5 | efficient | efficient | efficient | x1 | reviewer+tester idle ~4 min | efficient |

### Waste Identified

**Repeated context loads due to 529 re-spawns (task-1):**
executor-1 was spawned 4 times, each time reloading the full plan, architecture docs, standards, and lead notes into its context. 3 of those spawns produced no output. Estimated wasted context: ~3× full executor context load on Opus (the most expensive model tier).

**Idle reviewer/tester time:**
| Role | Avg Idle Before First Use | Across Tasks | Assessment |
|------|--------------------------|--------------|------------|
| Reviewer | ~12 min | All 5 tasks | Reviewers loaded context at spawn but sat idle until implementation complete. For task-2, reviewer-2 was idle ~38 minutes. Acceptable for short tasks; wasteful for long planning phases. |
| Tester | Full task duration | All 5 tasks | Testers were never activated — no STAGE testing messages were received across any task. All tasks went planning → implementation → review → complete with no testing stage. Tester agents burned spawn context costs with zero productive output. |

**Tester utilisation — critical finding:** 0% utilisation across all 5 tasks. 5 tester agents were spawned, loaded full context, and produced nothing. This is the single largest avoidable token cost in this execution.

**Retry cost:**
- Total review retry cycles: 4 (tasks 1, 3, 4, 5)
- Each retry cycle burns: executor re-read of reviewer feedback + fix implementation + reviewer re-read of updated code
- Estimated extra burn: ~4× partial task context reload across executor+reviewer pairs
- Avoidable retries: 3 of 4 (tasks 1, 3, 5) — caused by missing standards conventions, not logic bugs. Task-4's retry (sanitization + logAction + 400→404) was partially avoidable (logAction/status code) and partially real (sanitization).

**Model tier mismatch (529-driven):**
All executor agents ran on Sonnet for this execution (after the task-1 Opus fallback). For a plan of this complexity — 6 new DB tables, 22 API routes, multiple LLM pipeline components — Sonnet performed at adequate quality with 0 escalations. The Opus tier was not necessary. Recommendation: default executor model to Sonnet for this codebase; reserve Opus only for tasks involving novel architectural decisions.

### Cost Reduction Recommendations

1. **Eliminate tester spawns until actually needed** (~20% token reduction): Testers were spawned at task start but never activated for any of the 5 tasks. Lazy tester spawn (spawn only when executor signals "ready for test") would eliminate 5 wasted context loads.
2. **Lazy reviewer spawn** (~10% token reduction): Reviewer for task-2 was idle for ~38 minutes while executor planned and implemented. Spawn reviewer when executor sends first progress update, not at task start.
3. **Opus → Sonnet default for executor** (~30–40% per-token cost reduction): All 5 tasks completed with Sonnet executors with no quality degradation. The 529 incident confirmed Opus adds fragility at peak API load. Default to Sonnet unless the Lead explicitly flags a task as requiring Opus reasoning depth.
4. **API Route Conventions in standards docs** (indirect token saving via fewer retries): 4 review retries at ~1 retry cycle cost each = significant executor+reviewer context burn. Documenting the conventions (see Standards section below) would prevent most of these.

---

## Pipeline Flow Analysis

### Stage Bottlenecks

**task-1 planning (20 min, ~16 min lost to 529s):** The entire plan was blocked on task-1. The 529 incidents at the start of the day caused the largest single delay. No process change prevents API-side overload, but the Lead's rapid detection and model-tier switch (at the third failure, ~13 min in) was the right call operationally. A faster escalation threshold (switch after 2nd consecutive 529 rather than 3rd) would save ~4 minutes on future occurrences.

**task-1 review (38 min):** Reviewer-1 took ~38 minutes to review a task covering 6 DB tables, 2 API routes, and 3+ UI components. This is long but defensible given the scope — task-1 was the largest implementation surface. The review did catch real issues (catch typing, response envelope keys). No evidence of reviewer stalling; likely a thorough but slow read. The 38-minute review did give task-2 executor ample planning time, so the pipeline absorbed the cost well.

**All other stages:** implementation and review stages for tasks 2–5 were fast (3–12 min implementations, 2–12 min reviews). The pipeline hummed once task-1 cleared.

### Retry Analysis

| Task | Issue Type | Root Cause | Avoidable? |
|------|-----------|------------|------------|
| task-1 (review) | catch typing, response envelope keys | Missing TypeScript catch clause convention + API response shape not explicit in standards | Yes — standards gap |
| task-3 | CASE_ATTACHMENTS_DIR missing from paths.js | Path constants convention not documented | Yes — standards gap |
| task-4 | Template sanitization | Real implementation oversight | No |
| task-4 | Missing logAction in export route | Audit logging requirement not explicit in standards | Yes — standards gap |
| task-4 | 400→404 for missing template | HTTP status semantics not documented in standards | Yes — standards gap |
| task-5 | Missing inner try-catch for JSON parse error | Error handling pattern not documented in standards | Yes — standards gap |

**5 of 6 review failure issues were avoidable via standards documentation.** Only 1 (template sanitization) was a genuine implementation gap that review correctly caught.

### Dependency and Concurrency

Dependency management was excellent. Pipeline spawning was used consistently and correctly:
- task-2 spawned during task-1's review window (saved ~38 min)
- task-3 and task-4 spawned simultaneously during task-2's review window (saved ~9 min, utilised both concurrency slots)
- task-5 spawned during task-3's review window (saved ~7 min)

Zero blocking wait time between dependent tasks. The pipeline spawn pattern absorbed all inter-task dependency delays.

---

## Communication Analysis

### Planning → Implementation Alignment

Plans were approved quickly and cleanly for tasks 2–5 (single minor fix on task-1's status list, zero amendments on all others). The detailed lead.md with explicit architectural constraints (module separation, saveDb() pattern, WAL pragma, formidable for uploads) gave executors clear guardrails that prevented architectural drift. No task required a mid-implementation replanning.

### Review Feedback Quality

Review feedback was specific and actionable in all cases. Issues were named precisely (e.g. "CASE_ATTACHMENTS_DIR missing from paths.js", "inner try-catch for 400 on malformed JSON") rather than vague. Executors fixed issues on the first retry in all cases — no second review failures were observed. This indicates reviewers applied a consistent standard and executors understood the feedback.

The 38-minute task-1 review duration suggests reviewer-1 was thorough to the point of slowness, but the quality of the issues found (real TypeScript and API shape problems) justifies it.

### Information Flow Gaps

No cross-task coordination issues were observed. The lead.md note about concurrent task-3/task-4 writes to lib/db.js (safe due to non-colliding function names) was accurate — no conflicts were flagged by either executor. The pre-emptive documentation of this potential conflict in lead.md was effective.

---

## Repeated Work Analysis

### Knowledge Agent Utilisation

No knowledge agent was spawned for this execution. No `SPAWNED knowledge-legal-hub` message was received. Executors relied entirely on the plan README, lead.md, and their own codebase reading. No NOT FOUND responses to log.

**Assessment:** For this plan, the lack of a knowledge agent appears to have been fine — the plan README was comprehensive (data model, API routes, UI structure, data flows, prompts all specified), and lead.md covered all architectural constraints. The plan was self-contained enough that a knowledge agent would have added overhead without proportionate benefit.

### Duplicate Code / Patterns

No duplicate work was detected from dashboard-level observation. Tasks 3 and 4 ran concurrently and both modified lib/db.js — per lead notes, function names were non-colliding (getCaseDocuments vs getTemplates). No conflict signals were raised by either executor, confirming the pre-execution analysis in lead.md was correct.

### Repeated Review Failures

The same class of issue — missing error handling or missing audit/convention call — appeared across tasks 1, 3, 4, and 5. This is the clearest systemic pattern in the execution. It is not individual executor failure; it is a missing standards document.

**Specific repeating pattern:** Every task that touched API routes missed at least one of: catch clause typing, logAction call, correct HTTP status for "not found" scenarios, or inner try-catch for JSON parse. These are all variants of the same root cause — API route conventions are implied but not written down.

---

## Plan Quality Retrospective

### Task Granularity Assessment

| Task | Duration | Retries | Size Verdict | Evidence |
|------|----------|---------|-------------|----------|
| task-1: DB schema + Registry API + Dashboard | ~69 min | 5 | Too large | Combined DB setup (6 tables, 8 indexes, WAL), 2 API routes, 3 UI components, and sidebar in one task. The 38-min review reflects the scope. Could have been split: DB schema alone vs UI+API. |
| task-2: Case Detail UI | ~53 min | 0 | Right-sized | 8 API routes + 6 UI components + audit log. Long planning phase (38 min) suggests executor needed the time, but clean execution with 0 retries confirms scope was appropriate. |
| task-3: Case Document Repository | ~23 min | 1 | Right-sized | Focused scope (4 API routes, 1 UI component, file storage pattern). Fast and clean. |
| task-4: Template-based Document Generation | ~31 min | 1 | Right-sized | Wider surface (9 files including templateEngine.js, docxExport.js, TipTap UI) but well-contained. |
| task-5: Grounded Case Chat | ~12 min | 1 | Too small / boundary concern | The ContractChatPanel adaptation made implementation very fast (~3 min first pass). The core work (getCaseChunks helper, case-scoped vector query, 5-intent classifier) could have been more thoroughly validated. Short planning window (~4 min, unlocked before executor had finished) is a risk factor. |

**Too-large tasks found: 1**
- task-1: "DB schema + Case Registry API + Matter Dashboard UI" combined foundational DB work with API and UI in a single task. The DB schema (6 tables, 8 indexes, WAL pragma, TypeScript interfaces, helper functions) is a self-contained deliverable that could stand alone, enabling task-2 to start planning against stable interfaces earlier.
- **Suggestion:** Split into task-1a (DB schema + helpers + types) and task-1b (API routes + UI). Plan Enhancer rule: if a task's file list includes both `lib/db.js` schema changes AND `src/app/(app)/` UI files, flag for splitting.

**Boundary concern: task-5**
- task-5 had only ~4 minutes of planning before the gate opened (task-3 completed very quickly after task-5 was spawned). The executor may not have had enough planning time to fully address the vector search scoping requirements. The review failure (missing JSON error handling) was a different issue, but the short planning window is a risk for a task of this complexity.
- **Suggestion:** For pipeline-spawned tasks with complex dependencies (task-5 depends on both task-2's DB helpers AND task-3's getCaseChunks), enforce a minimum planning window before the implementation gate opens, regardless of when the dependency completes.

### Plan Enhancer Improvement Recommendations

1. **Split rule for DB + UI tasks:** If a task's file list spans both `lib/db.js` (schema changes) and `src/app/(app)/` (UI pages), recommend splitting into a data-layer task and a UI task. The data layer is often a prerequisite for multiple downstream tasks and benefits from being a clean atomic deliverable.

2. **Minimum planning window for pipeline-spawned tasks:** Tasks spawned in pipeline mode should have a minimum planning duration (suggest 10 minutes) enforced before the implementation gate opens. A task with 4 minutes of planning on a complex LLM pipeline feature is under-planned regardless of whether the dependency is satisfied.

3. **Tester activation signal:** The plan contained no explicit testing stage triggers. All 5 tasks completed without a testing stage being activated. Either the plan should explicitly define what "testing" means for each task (with specific test scenarios), or the pipeline should be adjusted to make the tester role optional/conditional. As-is, spawning testers at task start for plans with no testing infrastructure is pure waste.

4. **Cross-task file modification warnings in lead.md:** Lead.md correctly identified lib/db.js and src/lib/db-imports.ts as cross-task conflict candidates for tasks 1–5. This pattern (many tasks touching the same infrastructure files) is a signal that the DB helper pattern may benefit from a pre-execution scaffold task that creates the base structure, with individual tasks only adding their specific helpers.

### Success Criteria Clarity

All tasks had clear, specific success criteria. No ambiguity issues were observed. The criteria for task-5 ("Ask 'Jaki jest numer referencyjny sprawy?' → answer cites the reference_number field value") are integration-level criteria that require a running application to verify — appropriate for a final gate but not automatically checkable by the pipeline.

### Scope Accuracy

No plan amendments were required. All 5 tasks completed within their original scope definitions. No hidden dependencies were discovered mid-execution. The advance work in the plan's "Known Limitations" and "Assumptions" sections was thorough and accurate.

---

## System Improvement Suggestions

### Agent Behavior

1. **Executors should check paths.js / constants files before writing file paths.** CASE_ATTACHMENTS_DIR (task-3) was a direct path constant that should have been defined in the project's path constants file rather than hardcoded. A checklist item in executor instructions: "Before writing any file path string, check if it should be a named constant in paths.js."

2. **Executors should audit every new API route against a convention checklist before submitting for review.** A simple mental checklist (try-catch present? logAction called? correct HTTP status for 404 vs 400 vs 500? response shape { data } or { error }?) would catch the 5 avoidable review failures in this execution.

### Pipeline Process

1. **Adopt a faster Opus → Sonnet fallback threshold.** Currently the Lead waited for 3 consecutive 529s before switching. After 2 consecutive 529s on the same agent, the model tier should be switched. The third failure added ~4 minutes of downtime with no new information.

2. **Do not spawn testers unless the plan defines explicit testing scenarios.** This plan had assumption #10 ("No testing infrastructure exists in the project; no test files needed"). Testers should not be spawned for plans with this assumption. Add a `spawn_testers: false` flag to plan metadata, or have the Lead check for this assumption before spawning.

3. **Enforce a minimum 10-minute planning window for pipeline-spawned tasks.** The current pattern opens the implementation gate the moment the predecessor completes. For tasks with moderate-to-high complexity, 4 minutes of planning is insufficient.

### Plan Enhancer

1. **DB schema + UI split rule** (see Task Granularity section above).
2. **Minimum planning window enforcement** (see Task Granularity section above).
3. **Tester spawn condition** based on plan metadata or explicit test scenario presence.
4. **Flag tasks where implementation would be near-trivially fast due to direct component adaptation** (e.g. task-5's ContractChatPanel → CaseChatPanel). These tasks risk under-testing the novel parts (case-scoped vector search) while passing review on the adapted boilerplate. The plan should explicitly call out which components are being adapted vs built from scratch, and reviewers should be instructed to focus scrutiny on the novel portions.

### Token Efficiency

In priority order by estimated savings:

1. **Lazy tester spawn / no tester for plans without test infrastructure** — highest saving. 5 wasted context loads in this execution. For a 5-task plan, this is 5× full tester context load with 0 productive output.
2. **Default executor model to Sonnet** — 30–40% per-token cost reduction on the most token-intensive role. All 5 tasks demonstrated Sonnet is sufficient for this codebase.
3. **Lazy reviewer spawn** — medium saving. For task-2 the reviewer was idle ~38 minutes. Spawn reviewer on first executor progress update rather than at task start.
4. **Faster model-tier fallback on 529** — small but direct: saves 1 extra Opus context load per persistent 529 incident.

Note: items 1–3 require architectural changes to the pipeline spawn logic. Item 4 is a Lead orchestration policy change requiring no code change.

### Rate Limit Resilience

1. **Treat HTTP 529 (server overload) separately from HTTP 429 (quota exhausted).** 529 is transient and model-tier-specific; 429 requires waiting for quota reset. The current process handled this correctly in practice but the distinction should be explicit in Lead instructions to avoid unnecessary long waits when the issue is 529-based.
2. **Start new plan executions with Sonnet for all agents.** Opus provides no demonstrated quality advantage for this codebase and adds fragility under API load conditions. If Opus is needed, escalate to it explicitly rather than using it as the default.
3. **Stagger agent spawns by 15–30 seconds when 3+ agents are spawning simultaneously** (e.g. when COMPLETED + APPROVED-IMPL + PIPELINE-SPAWN arrive together). Burst spawning increases the probability of 529 events.

### Documentation and Standards

**Highest-priority addition: API Route Conventions section in standards docs.**

This single addition would have prevented 5 of 6 review failures in this execution. The section should cover:

- **TypeScript catch clause typing:** `catch (error: unknown)` with explicit type narrowing; never `catch (e)` untyped.
- **Response envelope shape:** Success: `NextResponse.json({ data: ... })`. Error: `NextResponse.json({ error: "message" }, { status: NNN })`. No other shapes.
- **HTTP status semantics:** 400 for malformed/invalid request body. 404 for missing resource (wrong ID). 409 for conflict. 500 for unexpected server error. Never return 400 when the resource simply doesn't exist.
- **Audit logging requirement:** Every route that performs INSERT, UPDATE, or DELETE must call `logAction()` before returning. Export routes that write files count as mutations.
- **JSON body parsing:** Every POST/PATCH route must wrap `req.json()` in a try-catch returning 400 on parse failure. This is not optional.
- **Path constants:** Any file path written in an API route must be a named constant imported from `lib/paths.js`. No inline string paths.

**Secondary addition: paths.js registry.**
Document all named path constants (DOCUMENTS_DIR, CASE_ATTACHMENTS_DIR, CASE_GENERATED_DIR) in the architecture docs so executors know to look there before hardcoding paths.
