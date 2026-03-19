# Plan 024 — Case Chat: Unified Retrieval (Remove Intent Classifier)

**Status:** Draft
**Module:** Legal Hub — Case Chat
**Depends on:** Plan 023 (case document RAG infrastructure)

---

## Problem Statement

The current case chat routes every query through a Haiku intent classifier before deciding whether to search uploaded documents. This creates a hard gate: questions classified as `case_info`, `party_lookup`, or `deadline_query` never reach the document retrieval pipeline. Since the classifier receives no case context (only the bare user message), it misclassifies frequently — a question like "what obligations does the defendant have?" goes to `party_lookup` and gets only the party registration record, never the uploaded contract.

The user's requirement: **the chat must always check both structured case data AND uploaded documents for every question.**

---

## Goal

Replace the intent-classification-as-gate architecture with parallel unified retrieval:

- Every question fetches structured case data (case info + parties + deadlines) from the DB
- Every question runs document retrieval (vector + BM25 + rerank) via the existing `CaseRetrievalService`
- A single Claude call synthesises from both, instructed to prefer structured registered facts for case metadata and document evidence for case merits
- If documents are not indexed: answer from structured data and clearly note the gap
- Fix two existing bugs: max_tokens truncation returning raw JSON, and summarize intent getting shallow retrieval

---

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Intent classifier | Remove entirely | It's the root bug; misclassification gates document access |
| Structured data | Always included (compact) | Fast DB-only query, ~500 tokens, always relevant |
| Document retrieval | Always run | Same cost as before; eliminates "should I search?" ambiguity |
| System prompt | Single updated grounded prompt | Handles both structured + document context |
| StructuredAnswer shape | Unchanged | Frontend already consumes it correctly |
| Annotation/citation path | Unchanged | Only document evidence gets citation markers |

---

## Documentation Updates (Stage 4 Step 1)

| File | Update |
|---|---|
| `documentation/technology/architecture/data-flow.md` | Update case chat sequence diagram: remove intent router, show unified retrieval flow |

---

## Implementation Tasks

### Task 1 — Unified Case Chat Route + Updated System Prompt

**Scope:** Rewrite the case chat API route to remove the intent classifier and implement always-parallel retrieval. Update the grounded system prompt to handle the combined structured + document context.

**Files to create or modify:**

**`prompts/case-chat-grounded.md`** — Update (replace current content):
- Remove any assumption that only document evidence is provided
- Add handling for `[DANE SPRAWY]` structured context block
- Instruction: "Prefer structured registered data (from the DANE SPRAWY section) for facts about case registration — court, parties, deadlines, claim value. Use document evidence (from the DOKUMENTY SPRAWY section) for case merits, contract content, legal arguments, obligations, and facts found in uploaded files."
- When both sources support the same fact, cite the document if it provides more detail
- When only structured data is available (no documents indexed): answer from DANE SPRAWY and state clearly that document search was not available
- When only document evidence is available: answer from documents only
- Citation mechanics (`[cit:chunkId]` markers) unchanged — only for document evidence, not structured data
- Output format: same JSON `{answerText, citations}` shape
- Prompt language: Polish-first (case content is in Polish), English fallback acceptable

**`src/app/api/legal-hub/cases/[id]/chat/route.ts`** — Rewrite:

Remove:
- `CLASSIFIER_SYSTEM` constant
- Haiku classifier call (Step 1 in current flow)
- `respondWithSimpleContext` function
- `intent`-based routing branches (`if (intent === "case_info") ...` etc.)
- `HISTORY_TURNS` is fine to keep

Add:
- `buildStructuredContext(legalCase, parties, deadlines): string` — formats the compact structured context block. Include: case title/reference/court/judge/status/claim, all parties with type+representative, next 5 upcoming deadlines. Label section `[DANE SPRAWY]`.
- Update the generation call to build a combined user message:
  ```
  {message}

  [DANE SPRAWY]
  {structuredContext}

  [DOKUMENTY SPRAWY]
  {evidencePrompt or "Brak zindeksowanych dokumentów w tej sprawie."}
  ```
- Run `CaseRetrievalService.search()` and `buildStructuredContext()` in parallel with `Promise.all()` for minimal latency
- Pass `hasDocuments: boolean` flag based on whether retrieval returned any results
- If `retrieval.results.length === 0`: set `confidence = "low"` and include a clear note in the structured context injected into the user message

Fix — max_tokens truncation bug:
- When `stop_reason === "max_tokens"`, instead of returning raw partial JSON as `answerText`, return a clean fallback:
  ```json
  {
    "answerText": "Odpowiedź była zbyt długa i została przerwana. Spróbuj zadać bardziej szczegółowe pytanie.",
    "annotations": [],
    "citations": [],
    "usedDocuments": [],
    "confidence": "low",
    "needsDisambiguation": false
  }
  ```

Fix — summarize shallow retrieval:
- Add "podsumuj", "streszcz", "summarize", "summarise", "overview" to `isHighRiskQuery` patterns in `lib/citation-assembler.js` so summarization requests get the expanded top-80 retrieval

Keep unchanged:
- Auth check
- `getLegalCaseById`, `getCaseParties`, `getCaseDeadlines` imports and calls
- `CaseRetrievalService` usage
- `buildEvidencePrompt` / `parseCitationResponse` usage
- `isHighRiskQuery` usage (with summarize addition)
- History handling
- StructuredAnswer return shape

**Success criteria (user-visible):**
- Asking "what does the uploaded contract say about payment?" searches uploaded documents and returns cited evidence
- Asking "who is the defendant?" returns the party from the structured DB AND cites any document reference if found
- Asking "what is the claim value?" answers from case metadata (no document citation needed) AND notes if documents also mention it
- Asking "list all obligations" triggers high-risk retrieval (top-80 candidates)
- When no documents are indexed for the case, the chat clearly states this and still answers from case metadata
- The "max_tokens truncated response" bug no longer renders raw JSON to the user
- No Haiku classifier API call is made (latency reduced by ~400ms per query)

---

## Task Dependencies

Task 1 has no dependencies on other pending tasks. It depends on the infrastructure from Plan 023 (CaseRetrievalService, buildEvidencePrompt, parseCitationResponse) which is already deployed.

---

## Key Files Changed

| File | Change |
|---|---|
| `src/app/api/legal-hub/cases/[id]/chat/route.ts` | Rewrite — remove classifier, add unified parallel retrieval |
| `prompts/case-chat-grounded.md` | Update — add structured context handling, clarify data source priority |
| `lib/citation-assembler.js` | Minor — add summarize/streszcz to isHighRiskQuery patterns |

---

## Risks

| Risk | Mitigation |
|---|---|
| Slightly higher token cost (structured context always included) | ~500 tokens per query; structured context is compact and bounded |
| Structured data clutters the context for pure document questions | System prompt instructs Claude to use structured data only when relevant |
| Removing classifier might send some edge questions to RAG that worked fine before | Structured data is still in the context so Claude can answer from it; no regression |
| Summarize requests now get more chunks (top-80) — higher cost | Only for explicit summarize queries; acceptable for correctness |

---

- [ ] Task 1: Unified Case Chat Route + Updated System Prompt
