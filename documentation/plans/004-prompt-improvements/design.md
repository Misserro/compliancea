# AI Prompt Improvements — Design Document

**Date:** 2026-02-22

## Goal

Rewrite all AI prompts in the application as external `.md` files, modeled after the existing `nda-analysis-prompt.md` (which already produces high-quality output). The current prompts produce inaccurate, poorly-presented results. This redesign raises the quality bar across all six AI-powered features.

---

## Section 1: Architecture

**Pattern:** External `.md` files in a new `prompts/` directory at the project root. Files are loaded at runtime with `fs.readFileSync` and `{PLACEHOLDER}` substitution — the same pattern already used by `/api/nda/analyze`.

**Directory structure:**
```
prompts/
  analyzer.md              # Document Analyzer system prompt
  ask.md                   # Ask Library system prompt
  desk.md                  # Desk Analyzer main analysis system prompt
  questionnaire-answer.md  # Questionnaire answer drafting system prompt
  auto-tagger.md           # Auto-Tagger system prompt
```

Note: The NDA prompt (`nda-analysis-prompt.md`) stays at the root — it is already good and does not need to move.

---

## Section 2: Document Analyzer — `prompts/analyzer.md`

**Route:** `src/app/api/analyze/route.ts`

**Current problems:**
- No system prompt — role and quality expectations are undefined
- All instructions are in the user message, mixed with document text
- No constraint against inventing facts

**Prompt design:**

- **Role:** Senior compliance document analyst with expertise in regulatory documents, contracts, and policy frameworks
- **Explicit steps for each output type:**
  - *Summary:* Identify document type, parties, core subject matter, key obligations/rights, and any critical dates or conditions. Structured — not a stream of consciousness.
  - *Key Clauses:* Extract only clauses with genuine legal or compliance significance. Quote directly, then explain the practical implication in plain language.
  - *Obligations:* List each concrete obligation: who owes what, to whom, by when.
  - *Risk Flags:* Identify only clauses that create realistic, specific risk. Assign severity. Do not manufacture issues to appear thorough.
- **Accuracy constraint:** "Never invent facts, interpret beyond what the text states, or fill gaps with assumptions. If something is unclear, say so."
- **Quality bar for summaries:** Minimum useful content = document type + parties + core subject + primary obligation or right + any critical date.

---

## Section 3: Ask Library — `prompts/ask.md`

**Route:** `src/app/api/ask/route.ts`

**Current problems:**
- 3-sentence system prompt with no citation guidance
- Max tokens too low (2048) — answers get cut off
- No instruction to synthesize across documents or flag conflicts

**Prompt design:**

- **Role:** Compliance research analyst who synthesizes information across an organization's document library to answer questions precisely
- **Synthesis instruction:** When multiple documents are relevant, synthesize across them — do not just quote the first match
- **Citation format:** Inline citations: `[Document Name, Section X]` or `[Document Name]` if no section. Every factual claim needs a citation.
- **Conflict flagging:** If documents contradict each other on the same point, state this explicitly and quote both
- **Accuracy constraint:** Answer only from provided context. If the answer is not in the documents, say: *"This is not addressed in the provided library documents."* Do not speculate.
- **Max tokens:** Raise from 2048 → 4096

---

## Section 4: Desk Analyzer — `prompts/desk.md`

**Route:** `src/app/api/desk/analyze/route.ts`

**Current problems:**
- No system prompt on any of the 3 API calls (translation, extraction, main analysis)
- Main analysis has terse inline rules with no professional context or quality guidance
- Response templates lack regulatory tone guidance

**Prompt design for `prompts/desk.md`** (system prompt for main analysis call):

- **Role:** Senior regulatory affairs and compliance specialist with experience responding to formal regulatory inquiries
- **Context:** EXTERNAL DOC = document requiring a response. LIBRARY DOCS = organization's internal materials from which answers are drawn.
- **Cross-reference quality bar:**
  - Every discrete question, request, and information demand must be identified and listed — sub-questions count as separate items
  - `confidence: "high"` only when the answer is directly and explicitly stated in a Library Doc — not inferred
  - If not found, say so. Never fabricate.
- **Template quality bar:**
  - Formal regulatory correspondence style — precise, professional, no casual language
  - Address every identified item in sequence, no skipping
  - Use actual data from Library Docs; only use `[PLACEHOLDER]` where genuinely absent
  - Never invent facts, numbers, dates, or policy language

**Question extraction sub-call:** Improved inline system prompt added directly in route code (no separate file):
> *"You extract every question, request, and information demand from a regulatory or compliance document. Include sub-questions as separate items. Return a numbered list, one item per line."*

---

## Section 5: Questionnaire Answer — `prompts/questionnaire-answer.md`

**File:** `lib/questionnaire.js` — `draftAnswers` function

**Current problems:**
- "Be specific and reference the source documents" — no citation format specified
- "Still provide a placeholder answer if not found" — encourages fabrication
- No guidance on answer length or when to flag for human review

**Prompt design:**

- **Role:** Compliance document analyst drafting answers from evidence only — no speculation, no inference
- **Accuracy rule:** Base every answer exclusively on provided evidence. If evidence only partially covers a question, state what it covers and explicitly flag what is not addressed.
- **Citation format:** Inline: `[Document Name]`. Every factual claim must be cited.
- **Absent evidence:** Do not write a speculative placeholder. Write: *"Not addressed in provided library documents — requires manual input."*
- **Confidence levels:**
  - `high` — evidence directly and fully answers the question
  - `medium` — evidence partially answers; some aspects not covered
  - `low` — little or no relevant evidence found

---

## Section 6: Auto-Tagger — `prompts/auto-tagger.md`

**File:** `lib/autoTagger.js` — `extractMetadata` function

**Current state:** Already the most detailed inline prompt in the codebase. All field definitions, examples, and enumerated values are retained. Two targeted improvements:

**Summary instruction** — changed from:
> *"a 1-sentence summary of the document (max 30 words)"*

To:
> *"1–2 sentences covering: (1) what type of document it is, (2) parties or entities involved if identifiable, (3) the core subject matter, (4) the primary obligation, right, or finding. Max 50 words. Example: 'Service agreement between [Company] and [Vendor] governing IT infrastructure support. Establishes SLA obligations and liability caps for the 2024–2026 term.'"*

**`in_force` tie-breaker rule** — added:
> *"When signals are mixed or absent, prefer `'unknown'` over guessing. Only assign `'in_force'` when there is a positive signal (active date, no expiry found, executed status). Only assign `'archival'` when there is a clear negative signal (past expiry, superseded reference)."*

---

## What is NOT changing

- `nda-analysis-prompt.md` — already excellent, stays as-is
- Auto-tagger tag categories, jurisdiction logic, sensitivity levels, department mapping — all good
- `parseTextQuestionnaire` system prompt — already reasonable for pure extraction
- Translation call in Desk Analyzer — stays as-is (pure translation, no quality issues)
- All API route logic, JSON schema construction, token counting, search logic

---

## Implementation Notes

- All files are loaded with `fs.readFileSync` at call time (same pattern as NDA)
- No caching needed — files are small, read on each request
- `{PLACEHOLDER}` substitution where dynamic values are needed (e.g. `{TARGET_LANGUAGE}`)
- The auto-tagger runs on Haiku — prompt must stay concise to avoid token waste
