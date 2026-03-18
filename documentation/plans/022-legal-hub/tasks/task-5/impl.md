# Task 5 Implementation Notes — Grounded Case Chat

## Files Changed

### Created
- `prompts/case-chat.md` — Polish-language system prompt enforcing evidence-only answers from [DANE SPRAWY], with explicit fallback rule and concise answer format
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — POST endpoint, two-step pipeline (Haiku classify → retrieve → Sonnet generate), returns `{ answer, sources, needsDisambiguation }`
- `src/components/legal-hub/case-chat-panel.tsx` — Chat UI adapted from ContractChatPanel, with SourceCard component and Polish example prompts

### Modified
- `lib/db.js` — appended `getCaseChunks(caseId)` helper in new `// ---- Case Chunks (for chat) ----` section after `deleteCaseGeneratedDoc`
- `lib/db.d.ts` — appended `export function getCaseChunks(...args: any[]): any;`
- `src/lib/db-imports.ts` — added `getCaseChunks` to the export block
- `src/components/legal-hub/case-detail-page.tsx` — replaced Chat tab "Coming soon" placeholder with `<CaseChatPanel caseId={caseId} />`, added import

## Integration Points

- **Task 3 dependency**: `document_search` and `summarize` intents require `case_documents` rows with `document_id IS NOT NULL` (created when Task 3 uploads + processes PDFs). Without indexed documents, these intents return the Polish fallback message — correct behavior, not an error.
- **API route**: `POST /api/legal-hub/cases/[id]/chat` — callers send `{ message: string, history: { role, content }[] }`, receive `{ answer: string, sources: Source[], needsDisambiguation: boolean }`
- **Source type**: `{ documentName: string, documentId: number, score?: number }` — score is only present for `document_search` intent

## Key Decisions

- **Auth first**: `const session = await auth()` is the very first statement, before `ensureDb()`. This corrects the gap present in `contracts/chat/route.ts`.
- **Model IDs**: Haiku classifier = `claude-haiku-4-5-20251001` (not the deprecated `claude-3-haiku-20240307`); Sonnet generator = `process.env.CLAUDE_MODEL || "claude-sonnet-4-6"`
- **HTTP 200**: Chat is RPC-style (not creating a persistent resource), returns 200 not 201
- **Uint8Array wrapping**: sql.js BLOBs return as `Uint8Array`; wrapped with `Buffer.from(chunk.embedding)` before passing to `bufferToEmbedding()`
- **Non-streaming**: uses `anthropic.messages.create()` returning JSON response — same as contracts/chat, no SSE needed
- **Similarity threshold**: 0.65 (plan README value). All scores below threshold → fallback message returned immediately
- **summarize intent**: fetches unique document IDs from `getCaseChunks()` (not a separate `getCaseDocuments` call), then gets `full_text` via `getDocumentById()` — this ensures only indexed documents (with chunks) are summarized
- **History**: `history.slice(-6)` passed as prior messages to Sonnet — last 6 turns

## GOTCHA

- `getCaseChunks` joins `chunks` → `documents` for `document_name`, filtering to `document_id IN (SELECT document_id FROM case_documents WHERE case_id = ? AND document_id IS NOT NULL)`. This correctly excludes unindexed file-only attachments (where `document_id IS NULL`).
- The `summarize` path builds `sources` from the docs it actually included in context, not from all case documents — avoids citing documents that had no `full_text`.
