# Task 5 Implementation Plan — Grounded Case Chat

## Overview

This plan implements the Chat tab in the case detail view. The backend uses the same two-step pipeline as `contracts/chat/route.ts`: Haiku classifies intent → retrieval from case SQL tables or case-scoped vector search → Sonnet generates a grounded answer. A new `getCaseChunks(caseId)` DB helper returns chunks scoped strictly to documents linked to the current case via `case_documents`. The UI adapts `ContractChatPanel` for the case context with source references.

---

## Current State

Tasks 1–4 have already been implemented. The following files exist and are relevant:

- `lib/db.js` — has all Legal Hub helpers up through `deleteCaseGeneratedDoc`; `getCaseChunks` does NOT yet exist
- `lib/db.d.ts` — has declarations up through `deleteCaseGeneratedDoc`; `getCaseChunks` declaration missing
- `src/lib/db-imports.ts` — has exports up through `deleteCaseGeneratedDoc`; `getCaseChunks` export missing
- `src/components/legal-hub/case-detail-page.tsx` — Chat tab currently renders "Coming soon" placeholder at line 129–133
- `src/app/api/legal-hub/cases/[id]/chat/` — directory does NOT exist yet

---

## Files to Create or Modify

### 1. `lib/db.js` — append `getCaseChunks` helper

**Location:** Append after the `// ---- Case Documents ----` section (after `removeCaseDocument`), in a new subsection `// ---- Case Chunks (for chat) ----`.

**Function:**
```js
export function getCaseChunks(caseId) {
  return query(
    `SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding,
            d.name as document_name
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE c.embedding IS NOT NULL
       AND c.document_id IN (
         SELECT document_id FROM case_documents
         WHERE case_id = ? AND document_id IS NOT NULL
       )
     ORDER BY c.document_id, c.chunk_index`,
    [caseId]
  );
}
```

The query joins `chunks` → `documents` (for `document_name`) and filters to document IDs linked to the case. Only chunks with embeddings are returned (same guard as `getAllChunksWithEmbeddings`). No `saveDb()` needed — this is a read-only query.

### 2. `lib/db.d.ts` — append one declaration

Append at the end of the file:
```ts
export function getCaseChunks(...args: any[]): any;
```

### 3. `src/lib/db-imports.ts` — append one export

Add `getCaseChunks,` before the closing `} from "../../lib/db.js"`.

### 4. `prompts/case-chat.md` — new file

System prompt for the Sonnet generation step. Rules:
- Answer ONLY from the `[DANE SPRAWY]` section provided in each message
- Language: Polish exclusively
- Cite the source document name for every claim
- Fallback: if context is empty or marked as insufficient → return the exact fallback string
- Never use external legal knowledge or world knowledge
- Keep answers concise: 1–3 sentences for simple lookups; bullet points (max 5) for summaries

### 5. `src/app/api/legal-hub/cases/[id]/chat/route.ts` — new file

**Auth:** `const session = await auth()` is the FIRST statement in `POST`, before `ensureDb()`. Returns 401 if no session. (Note: `contracts/chat/route.ts` omits auth — this is a known gap. The case chat endpoint corrects this.)

**Response shape:** `{ answer, sources, needsDisambiguation }` — resource-named envelope. Returns HTTP 200 (RPC-style, not creating a persistent resource).

**Full pipeline:**

```
POST /api/legal-hub/cases/[id]/chat
Body: { message: string, history: { role, content }[] }
```

**Step 0 — validation:**
- `const session = await auth()` → 401 if no session
- `await ensureDb()`
- Parse `props.params` → `id` → `parseInt` → 400 if NaN
- `getLegalCaseById(id)` → 404 if null
- Parse body: `message` (required, non-empty string), `history` (default `[]`)

**Step 1 — Haiku classification:**

Model: `claude-haiku-4-5-20251001` (NOT `claude-3-haiku-20240307` — that model is deprecated and retiring April 19, 2026).

Inline `CLASSIFIER_SYSTEM` constant (no file read — follows contracts/chat pattern). Taxonomy:
- `case_info` — case metadata (reference, court, claim, summary)
- `party_lookup` — parties or representatives
- `deadline_query` — hearings, deadlines, dates
- `document_search` — "where is X mentioned", content search → vector search
- `summarize` — summarize a document or the whole case file
- `unknown` → return clarification question

Returns JSON: `{ intent, disambiguationQuestion }`.

On parse failure: fall back to `document_search`.

If `intent === "unknown"` and `disambiguationQuestion` set: return immediately with `{ answer: disambiguationQuestion, sources: [], needsDisambiguation: true }`.

**Step 2 — Retrieval by intent:**

- `case_info` → `getLegalCaseById(id)` — format all `legal_cases` fields as context text
- `party_lookup` → `getCaseParties(id)` — format all parties
- `deadline_query` → `getCaseDeadlines(id)` — format all deadlines sorted by due_date
- `summarize` → for each `case_documents` row with a `document_id`, call `getDocumentById(documentId)` and extract `full_text`, truncated at 6000 words per doc
- `document_search` → vector search:
  1. `getCaseChunks(id)` — load all chunks for case-linked documents
  2. If no chunks → contextText = "" (triggers fallback)
  3. `getEmbedding(message)` — embed the user's question via Voyage AI
  4. For each chunk: sql.js returns BLOBs as `Uint8Array` — wrap with `Buffer.from(chunk.embedding)` before calling `bufferToEmbedding(Buffer.from(chunk.embedding))` → `cosineSimilarity(queryEmbedding, chunkEmbedding)`
  5. Sort descending by score, take top 5
  6. If all scores < 0.65 → contextText = "" (triggers fallback)
  7. Otherwise: build contextText from top chunks; sources array from those chunks

**Fallback rule:**
```
if (!contextText.trim()) {
  return NextResponse.json({
    answer: "Nie znaleziono wystarczających informacji w materiałach sprawy.",
    sources: [],
    needsDisambiguation: false,
  });
}
```

**Step 3 — Sonnet generation:**
- Model: `process.env.CLAUDE_MODEL || "claude-sonnet-4-6"` (same env-based pattern as contracts/chat)
- Non-streaming: use `anthropic.messages.create()` and return a JSON response — no SSE needed (simpler, follows contracts/chat pattern exactly)
- Load system prompt from `prompts/case-chat.md` via `fs.readFile`
- `history.slice(-6)` for chat history (last 6 turns)
- User content: `[DANE SPRAWY]\n${contextText}\n\n[PYTANIE UŻYTKOWNIKA]\n${message}`
- Call Sonnet with `max_tokens: 2048`
- Return `{ answer, sources, needsDisambiguation: false }`

**Sources array shape:**
```ts
type Source = {
  documentName: string;
  documentId: number;
  score?: number; // only for document_search intent
}
```

For SQL intents (`case_info`, `party_lookup`, `deadline_query`): sources = `[]` (data comes from structured DB, not documents).
For `summarize`: sources = list of document names used.
For `document_search`: sources = top-K chunks' `{ documentName, documentId, score }`.

**Error handling:** outer `catch (err: unknown)` returns `{ error: err.message }` with 500.

**Imports needed:**
- `{ NextRequest, NextResponse }` from `"next/server"`
- `Anthropic` from `"@anthropic-ai/sdk"`
- `fs` from `"fs/promises"`
- `path` from `"path"`
- `{ auth }` from `"@/auth"`
- `{ ensureDb }` from `"@/lib/server-utils"`
- `{ getLegalCaseById, getCaseParties, getCaseDeadlines, getCaseDocuments, getDocumentById, getCaseChunks }` from `"@/lib/db-imports"`
- `{ getEmbedding, bufferToEmbedding }` from `"@/lib/embeddings-imports"`
- `{ cosineSimilarity }` from `"@/lib/search-imports"`

```
export const runtime = "nodejs";
```

### 6. `src/components/legal-hub/case-chat-panel.tsx` — new file

Adapted from `ContractChatPanel`. Key differences:

**Props:** `{ caseId: number }` — no `onClose`, no `selectedContractId`. The panel lives inside the Chat tab (no overlay/dismiss needed).

**API endpoint:** `POST /api/legal-hub/cases/${caseId}/chat`

**Request body:** `{ message, history }`

**Response handling:** `data.answer`, `data.sources`, `data.needsDisambiguation`

**ChatMessage type:**
```ts
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}
```

**Source card (new component `SourceCard`):**
```tsx
function SourceCard({ source }: { source: Source }) {
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{source.documentName}</div>
      {source.score != null && (
        <div className="text-muted-foreground">
          Trafność: {Math.round(source.score * 100)}%
        </div>
      )}
    </div>
  );
}
```

**Example prompts (Polish):**
- "Jaki jest numer referencyjny sprawy?"
- "Kto jest pozwanym w tej sprawie?"
- "Kiedy jest najbliższa rozprawa?"
- "Znajdź informacje w dokumentach sprawy"

**Header:** "Asystent sprawy" (no close button — it's a tab, not a panel).

**Input placeholder:** "Zadaj pytanie o sprawę…"

**Source display:** After `msg.content`, if `msg.sources && msg.sources.length > 0`, render a `SourceCard` list with heading "Źródła:" in `text-xs text-muted-foreground`.

**Layout:** Full-height flex column (same structure as `ContractChatPanel`). Outer `div` uses `h-full` without `minHeight` style override — height is determined by the tab container.

### 7. `src/components/legal-hub/case-detail-page.tsx` — modify Chat tab

**Change:** Replace the Chat tab "Coming soon" placeholder with `<CaseChatPanel caseId={caseId} />`.

Specifically, change lines 129–133:
```tsx
{activeTab === "chat" && (
  <div className="py-12 text-center text-muted-foreground text-sm">
    Coming soon — implemented in a future task.
  </div>
)}
```
to:
```tsx
{activeTab === "chat" && (
  <CaseChatPanel caseId={caseId} />
)}
```

Add import at the top of the imports section:
```ts
import { CaseChatPanel } from "./case-chat-panel";
```

---

## Context Formatters (helper functions inside the route)

These are pure functions defined after the POST handler in `route.ts`:

**`formatCaseInfoContext(legalCase)`** — formats all `legal_cases` fields as labeled key-value pairs.

**`formatPartiesContext(parties)`** — one block per party: type, name, address, representative info.

**`formatDeadlinesContext(deadlines)`** — one block per deadline: title, type, due date, status, description.

**`formatChunkContext(chunks, scores)`** — numbered list of chunk excerpts with document name header per chunk.

**`formatSummarizeContext(docs)`** — one section per document: name header, then truncated `full_text` (6000 words max).

---

## Classifier System Prompt (inline in route.ts)

```
You are an intent classifier for a legal case management assistant. Analyze the user's message and return ONLY valid JSON — no markdown, no explanation, no code blocks.

Intents:
- "case_info":       Questions about case metadata (court, reference number, claim amount, summary, judge)
- "party_lookup":    Questions about parties, defendants, plaintiffs, or their representatives
- "deadline_query":  Questions about hearings, deadlines, due dates, or scheduled events
- "document_search": Questions about document content, finding specific information in case files
- "summarize":       Requests to summarize a document or the entire case file
- "unknown":         Unclear request or not related to this case

Return exactly this structure:
{
  "intent": "case_info|party_lookup|deadline_query|document_search|summarize|unknown",
  "disambiguationQuestion": null
}

If intent is unknown, set disambiguationQuestion to a helpful clarifying question in Polish.
```

---

## Success Criteria Verification

| Criterion | Implementation |
|---|---|
| "Jaki jest numer referencyjny sprawy?" → cites reference_number | Haiku → `case_info` → `getLegalCaseById` → `reference_number` in contextText → Sonnet cites it |
| "Kto jest pozwanym?" → cites case_parties | Haiku → `party_lookup` → `getCaseParties` → party with type='defendant' in contextText |
| "Kiedy jest najbliższa rozprawa?" → cites case_deadlines | Haiku → `deadline_query` → `getCaseDeadlines` → nearest hearing in contextText |
| Upload PDF (Task 3), ask about content → cites document passage | Haiku → `document_search` → `getCaseChunks` → cosine similarity → top chunk in contextText |
| No case data → Polish fallback | `contextText === ""` triggers early return with fallback message |
| Chat history (last 6 turns) maintained | `history.slice(-6)` passed to Sonnet messages |
| Source references shown next to answers | `sources` array returned in response; `SourceCard` renders in UI |

---

## Risks and Trade-offs

1. **Model versions:** Haiku classifier uses `claude-haiku-4-5-20251001` (not the deprecated `claude-3-haiku-20240307` which retires April 19, 2026). Sonnet generator uses `process.env.CLAUDE_MODEL || "claude-sonnet-4-6"` — the same env-variable pattern as `contracts/chat/route.ts`.

2. **In-memory vector search:** `getCaseChunks` loads all chunks for case documents. For cases with many large documents this could be memory-heavy. This is the documented v1 limitation (see plan README "Known Limitations"). Acceptable for SQLite/solo-user scale.

3. **`getCaseChunks` with no case_documents rows:** If no documents are linked to the case (or none are indexed), the query returns `[]`. The code path correctly falls through to the fallback message — no error thrown.

4. **Voyage AI key:** `getEmbedding` throws if `VOYAGE_API_KEY` is not set. This is caught by the outer `catch (err: unknown)` and returned as a 500 error. Same behavior as other embedding-using routes.

5. **`cosineSimilarity` import:** `cosineSimilarity` is exported from `lib/search.js` and re-exported via `src/lib/search-imports.ts`. This import path is confirmed to exist and is already used by other routes.

6. **Auth gap in contracts/chat:** `contracts/chat/route.ts` does not call `auth()`. The case chat route will NOT replicate this gap — `auth()` will be the first statement, per the architectural constraint and per the Lead's clarification.

7. **HTTP 200 for chat response:** The chat endpoint is RPC-style (no persistent resource created). Returns 200, not 201. This matches the `contracts/chat/route.ts` pattern and the Lead's clarification.

8. **sql.js BLOB as Uint8Array:** sql.js returns BLOBs as `Uint8Array`, not `Buffer`. `bufferToEmbedding` in `lib/embeddings.js` expects a `Buffer`. The route must wrap: `bufferToEmbedding(Buffer.from(chunk.embedding))`. This is the established conversion path used in `lib/search.js` for cosine similarity — confirmed working.

9. **`case-detail-page.tsx` modification scope:** Only one JSX block and one import line change. The rest of the component is unchanged. No risk to Overview/Documents/Generate tabs.

---

## Dependency Notes

- `getCaseChunks` requires `case_documents` rows with `document_id IS NOT NULL` — these are created by Task 3's upload + processing pipeline. If Task 3 is not yet complete at test time, `document_search` will return empty context and trigger the fallback.
- `getCaseParties` and `getCaseDeadlines` are defined in Task 2 and already exported — no changes needed to those helpers.
- `case-detail-page.tsx` already imports `CaseDocumentsTab` and `CaseGenerateTab` — adding `CaseChatPanel` follows the same pattern.
- `lib/db.d.ts` and `src/lib/db-imports.ts` must be updated for `getCaseChunks` — this is a required export since the API route is in `src/app/api/` (TypeScript) and uses `@/lib/db-imports`.
