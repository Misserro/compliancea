# Plan 022 — Legal Hub

**Status:** Approved
**Created:** 2026-03-18
**Author:** Feature Mode (Head of Technology)

---

## Overview

Legal Hub is a professional case management module for law firms built on top of the existing ComplianceA/Vaulta infrastructure. It provides a case registry, per-case document repository, structured template-based document generation, and a grounded AI chat assistant that answers exclusively from stored case data and documents.

The feature introduces 6 new database tables, a new `/legal-hub` route tree, and a dedicated UI section in the sidebar — reusing the existing Claude API, Voyage embeddings, document storage, audit log, tasks, and component conventions.

---

## Scope Decisions (from Stage 1 dialogue)

| Decision | Choice | Rationale |
|---|---|---|
| Multi-user roles | **Single-user for now** | Current app is single admin user; role-based case access deferred to a future plan |
| SQLite concurrency | **Accept + enable WAL mode** | Solo/small-team use; WAL pragma added for free read concurrency improvement |
| Template generation | **Structured fill-in only** | `{{variable}}` substitution from case data; no AI drafting in v1 |
| Case type schema | **Common core + `extension_data` JSON** | Flat professional schema covers all Polish matter types; typed sub-models deferred |

---

## Architecture Decisions

### Why new tables instead of extending `documents`

`documents` is the universal base entity — contracts are `documents` rows with contract-specific columns bolted on via ALTER TABLE. This approach has reached its ceiling (35+ columns, mixed concerns). Legal cases need a clean dedicated schema.

### Chat retrieval strategy

Follows the existing two-step pipeline (Haiku classifier → Sonnet generator). For structured queries (parties, deadlines, metadata), SQL retrieval is used first. For document content questions, embeddings are searched via `JOIN chunks → case_documents → documents`, scoped strictly to the selected case. This gives grounded answers without external knowledge.

### Template engine

`{{variable}}` placeholders in template body strings, resolved from a variable registry mapping names to case data paths. Fill is done at generation time server-side; output stored as HTML in `case_generated_docs.generated_content`, exportable to DOCX via the existing `docx` npm library.

### Reused infrastructure

- `audit_log` — entity_type `'legal_case'` for full activity trail
- `tasks` — entity_type `'legal_case'` for deadline reminders
- `chunks` + `embeddings.js` — case-scoped vector search
- `ContractChatPanel` pattern — direct UI reference for `CaseChatPanel`
- `contract_documents` table pattern — direct reference for `case_documents`
- Two-step LLM pipeline — identical to contracts chat

---

## Data Model

### New Tables

#### `legal_cases`
```sql
CREATE TABLE IF NOT EXISTS legal_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_number TEXT,           -- sygnatura akt (court-assigned)
  internal_number TEXT,            -- firm's internal reference
  title TEXT NOT NULL,             -- short descriptive title
  case_type TEXT NOT NULL,         -- civil, criminal, administrative, labor, family, commercial
  procedure_type TEXT,             -- postępowanie upominawcze, egzekucyjne, etc.
  court TEXT,
  court_division TEXT,             -- wydział
  judge TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  status_history_json TEXT DEFAULT '[]',  -- [{status, changed_at, note}]
  summary TEXT,                    -- factual basis / uzasadnienie
  claim_description TEXT,          -- what is being claimed
  claim_value REAL,                -- wartość przedmiotu sporu
  claim_currency TEXT DEFAULT 'PLN',
  tags TEXT DEFAULT '[]',          -- JSON array
  extension_data TEXT DEFAULT '{}', -- type-specific fields JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `case_parties`
```sql
CREATE TABLE IF NOT EXISTS case_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL,        -- plaintiff, defendant, third_party, witness, other
  name TEXT NOT NULL,
  address TEXT,
  representative_name TEXT,
  representative_address TEXT,
  representative_type TEXT,        -- attorney, legal_counsel, other
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `case_documents`
```sql
CREATE TABLE IF NOT EXISTS case_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  file_path TEXT,                  -- direct upload (not in doc library)
  file_name TEXT,
  document_category TEXT NOT NULL DEFAULT 'other',
  -- pleadings, evidence, correspondence, court_decisions,
  -- powers_of_attorney, contracts_annexes, invoices_costs,
  -- internal_notes, other
  label TEXT,
  date_filed DATE,
  filing_reference TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `case_deadlines`
```sql
CREATE TABLE IF NOT EXISTS case_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deadline_type TEXT NOT NULL,     -- hearing, response_deadline, appeal_deadline, filing_deadline, payment, other
  due_date DATE NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',   -- pending, met, missed, cancelled
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `case_templates`
```sql
CREATE TABLE IF NOT EXISTS case_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  document_type TEXT,              -- pozew, wezwanie, pismo, odpowiedz, etc.
  applicable_case_types TEXT DEFAULT '[]', -- JSON array of case types, empty = all
  template_body TEXT NOT NULL,     -- HTML with {{variable}} placeholders
  variables_json TEXT DEFAULT '[]', -- [{name, label, source, path, description}]
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `case_generated_docs`
```sql
CREATE TABLE IF NOT EXISTS case_generated_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES case_templates(id) ON DELETE SET NULL,
  template_name TEXT,              -- snapshot at generation time
  document_name TEXT NOT NULL,
  generated_content TEXT NOT NULL, -- filled HTML content (editable)
  filled_variables_json TEXT DEFAULT '{}', -- snapshot of values used for traceability
  file_path TEXT,                  -- exported .docx path if exported
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Indexes (to add)
```sql
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_case_type ON legal_cases(case_type);
CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_case ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_document ON case_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_case ON case_deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_due ON case_deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_case_generated_docs_case ON case_generated_docs(case_id);
```

---

## API Routes

```
GET    /api/legal-hub/cases                          — list cases (search, filter by status/type)
POST   /api/legal-hub/cases                          — create case
GET    /api/legal-hub/cases/[id]                     — get case with parties, deadlines, documents
PATCH  /api/legal-hub/cases/[id]                     — update case metadata
DELETE /api/legal-hub/cases/[id]                     — delete case

GET    /api/legal-hub/cases/[id]/parties             — list parties
POST   /api/legal-hub/cases/[id]/parties             — add party
PATCH  /api/legal-hub/cases/[id]/parties/[pid]       — update party
DELETE /api/legal-hub/cases/[id]/parties/[pid]       — remove party

GET    /api/legal-hub/cases/[id]/documents           — list case documents
POST   /api/legal-hub/cases/[id]/documents           — attach (upload or link from library)
DELETE /api/legal-hub/cases/[id]/documents/[did]     — remove attachment
GET    /api/legal-hub/cases/[id]/documents/[did]/download — download file

GET    /api/legal-hub/cases/[id]/deadlines           — list deadlines
POST   /api/legal-hub/cases/[id]/deadlines           — add deadline
PATCH  /api/legal-hub/cases/[id]/deadlines/[did]     — update deadline
DELETE /api/legal-hub/cases/[id]/deadlines/[did]     — delete deadline

POST   /api/legal-hub/cases/[id]/status              — transition status with note
GET    /api/legal-hub/cases/[id]/activity            — audit trail for case

POST   /api/legal-hub/cases/[id]/chat                — grounded case chat
POST   /api/legal-hub/cases/[id]/generate            — fill template → generate document
GET    /api/legal-hub/cases/[id]/generated-documents           — list generated docs
GET    /api/legal-hub/cases/[id]/generated-documents/[gid]     — get generated doc
PATCH  /api/legal-hub/cases/[id]/generated-documents/[gid]     — update generated doc content
DELETE /api/legal-hub/cases/[id]/generated-documents/[gid]     — delete

GET    /api/legal-hub/templates                      — list templates
POST   /api/legal-hub/templates                      — create template
GET    /api/legal-hub/templates/[id]                 — get template
PATCH  /api/legal-hub/templates/[id]                 — update template
DELETE /api/legal-hub/templates/[id]                 — delete template
```

---

## UI Component Structure

```
src/app/(app)/legal-hub/
  page.tsx                          — Matter dashboard (case list)
  [id]/
    page.tsx                        — Case detail (tab shell)
    loading.tsx
  templates/
    page.tsx                        — Template management

src/components/legal-hub/
  case-list.tsx                     — Searchable, filterable case list with status badges
  case-card.tsx                     — Single case row (reference, title, court, status, next deadline)
  new-case-dialog.tsx               — Modal: create new case
  case-header.tsx                   — Case title bar with reference, court, status badge, next deadline
  case-overview-tab.tsx             — Metadata form + parties table + status timeline + deadlines
  case-metadata-form.tsx            — Editable core fields (court, type, claim, summary)
  case-parties-section.tsx          — Party list with add/edit/remove
  case-status-section.tsx           — Status badge, history timeline, transition button
  case-deadlines-section.tsx        — Deadline list with status indicators
  case-documents-tab.tsx            — Categorized document repo with upload
  case-chat-panel.tsx               — Grounded chat panel (pattern: ContractChatPanel)
  case-generate-tab.tsx             — Template picker, fill form, editable preview, export
  template-list.tsx                 — Template management table
  template-form.tsx                 — Create/edit template with variable registry
```

---

## Data Flow

### Case data flow
1. User creates case via `new-case-dialog.tsx` → `POST /api/legal-hub/cases`
2. API inserts to `legal_cases`, logs to `audit_log` (entity_type='legal_case'), calls `saveDb()`
3. Case detail loaded via `GET /api/legal-hub/cases/[id]` joining parties, deadlines, document count
4. Edits via `PATCH /api/legal-hub/cases/[id]` → DB update → audit log entry

### Document flow
1. Upload via `case-documents-tab.tsx` → `POST /api/legal-hub/cases/[id]/documents` (multipart)
2. File saved to `DOCUMENTS_DIR/case-attachments/[case_id]/[filename]`
3. If file is PDF/DOCX and user wants it searchable: add to `documents` table, process chunks + embeddings via existing document processing pipeline
4. `case_documents` row links `case_id` → `document_id` (or stores `file_path` for unindexed files)

### Document generation flow
1. User picks template in `case-generate-tab.tsx`, preview renders with case data filled
2. `POST /api/legal-hub/cases/[id]/generate` → server resolves `{{variables}}` from case + parties data
3. Filled HTML stored in `case_generated_docs.generated_content` with `filled_variables_json` snapshot
4. User edits in TipTap editor (optional)
5. Export: server converts HTML → DOCX via `docx` library, stores at `DOCUMENTS_DIR/case-generated/`

### Chat flow
1. `POST /api/legal-hub/cases/[id]/chat` receives `{message, history}`
2. **Haiku classifier** detects intent: `case_info` | `party_lookup` | `deadline_query` | `document_search` | `summarize`
3. **Retrieval** based on intent:
   - `case_info`, `party_lookup`, `deadline_query` → SQL queries on `legal_cases`, `case_parties`, `case_deadlines`
   - `document_search` → cosine similarity search on `chunks` JOIN `case_documents` WHERE `case_id = ?`
   - `summarize` → fetch `documents.full_text` for all indexed case documents
4. **Sonnet generates** answer strictly from retrieved context; must cite sources
5. If evidence is absent → return "Nie znaleziono wystarczających informacji w materiałach sprawy"

---

## Prompts

New prompt file: `prompts/case-chat.md`

Key rules:
- Answer ONLY from retrieved case data and document excerpts provided in context
- If context is empty or insufficient, state explicitly that the case materials do not contain enough information
- Cite document name and, if available, the relevant excerpt
- No external legal knowledge, no general Polish law references unless they appear in the retrieved documents
- Language: Polish (match the language of the case materials)

---

## Known Limitations (v1)

| Limitation | Impact | Path forward |
|---|---|---|
| Single-user: no per-case access control | Auth gate is the only protection | Multi-user roles plan (future) |
| SQLite write locks under heavy concurrency | Rare at solo/small-team scale; WAL mode mitigates | Postgres migration plan |
| In-memory vector search for chat | All case chunks loaded into memory per query | Acceptable at SQLite scale; use indexed document limit |
| Template body is HTML | Requires sanitization on render | Use `DOMPurify` or render in sandboxed iframe |
| No OCR on new uploads | Scanned PDFs won't be searchable in chat | Existing document processing pipeline handles PDF text extraction |

---

## Task List

- [ ] **Task 1: DB schema + Case Registry API + Matter Dashboard UI**
  *A lawyer can create, browse, search, and open cases in the Legal Hub.*

- [ ] **Task 2: Case Detail UI — metadata, parties, status, deadlines**
  *A lawyer can fully view and edit all core case data, manage parties, track status history, and manage deadlines.*

- [ ] **Task 3: Case Document Repository**
  *A lawyer can upload and categorize documents for a case, browse them by category, and download them.*

- [ ] **Task 4: Template-based Document Generation**
  *A lawyer can select a legal template, review auto-filled case data, edit the result, and export it as DOCX.*

- [ ] **Task 5: Grounded Case Chat**
  *A lawyer can ask questions about a case and receive answers grounded exclusively in stored case data and case documents.*

---

## Task Details

### Task 1: DB schema + Case Registry API + Matter Dashboard UI

**Description:**
Add 6 new tables to `lib/db.js` (with WAL mode pragma). Add TypeScript interfaces to `src/lib/types.ts`. Implement `GET /api/legal-hub/cases` (list with search + status/type filter) and `POST /api/legal-hub/cases` (create). Add DB helper functions to `lib/db.js` and export from `src/lib/db-imports.ts`. Build the matter dashboard page at `/legal-hub` with a case list, status badges, next-deadline display, and a "New Case" dialog. Add "Legal Hub" to the sidebar navigation.

**Files:**
- `lib/db.js` — add 6 CREATE TABLE statements, 8 indexes, WAL pragma
- `src/lib/types.ts` — add `LegalCase`, `CaseParty`, `CaseDocument`, `CaseDeadline`, `CaseTemplate`, `CaseGeneratedDoc` interfaces
- `lib/db.js` — add `getLegalCases`, `getLegalCaseById`, `createLegalCase`, `updateLegalCase`, `deleteLegalCase` helpers
- `src/lib/db-imports.ts` — export new helpers
- `src/app/api/legal-hub/cases/route.ts` — GET + POST
- `src/app/(app)/legal-hub/page.tsx` — matter dashboard page
- `src/components/legal-hub/case-list.tsx`
- `src/components/legal-hub/case-card.tsx`
- `src/components/legal-hub/new-case-dialog.tsx`
- `src/components/layout/sidebar.tsx` (or equivalent) — add Legal Hub nav entry

**Success criteria:**
- Navigating to `/legal-hub` shows a list of cases (empty state when none exist)
- "New Case" dialog opens, user fills required fields (title, case_type), submits, case appears in list
- Search by title and filter by status + case_type work correctly
- Case card shows: reference number, title, court, status badge, created date
- Sidebar shows a "Legal Hub" entry that navigates correctly

**Dependencies:** None

---

### Task 2: Case Detail UI — metadata, parties, status, deadlines

**Description:**
Implement the case detail page at `/legal-hub/[id]` with a four-tab shell (Overview, Documents, Generate, Chat). The Overview tab contains: editable case metadata form (all `legal_cases` fields), parties section (add/edit/remove), status section (current badge, transition button, history timeline), and deadlines section (add/edit/mark-complete/delete). Add the case API endpoints for full CRUD on cases, parties, deadlines, and status transitions. Audit log entries created for all mutations.

**Files:**
- `src/app/api/legal-hub/cases/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/legal-hub/cases/[id]/parties/route.ts` — GET, POST
- `src/app/api/legal-hub/cases/[id]/parties/[pid]/route.ts` — PATCH, DELETE
- `src/app/api/legal-hub/cases/[id]/deadlines/route.ts` — GET, POST
- `src/app/api/legal-hub/cases/[id]/deadlines/[did]/route.ts` — PATCH, DELETE
- `src/app/api/legal-hub/cases/[id]/status/route.ts` — POST (status transition)
- `src/app/api/legal-hub/cases/[id]/activity/route.ts` — GET (audit log for case)
- `lib/db.js` — helpers for parties, deadlines, status history
- `src/lib/db-imports.ts` — export new helpers
- `src/app/(app)/legal-hub/[id]/page.tsx` — case detail page (tab shell)
- `src/components/legal-hub/case-header.tsx`
- `src/components/legal-hub/case-overview-tab.tsx`
- `src/components/legal-hub/case-metadata-form.tsx`
- `src/components/legal-hub/case-parties-section.tsx`
- `src/components/legal-hub/case-status-section.tsx`
- `src/components/legal-hub/case-deadlines-section.tsx`

**Success criteria:**
- Opening a case shows the case header (reference, title, court, status badge)
- Overview tab: all metadata fields editable and save correctly
- Parties section: add plaintiff + defendant, edit name/address/representative, remove party
- Status section: current status shown, transition dropdown changes status, previous statuses shown in timeline with timestamps
- Deadlines section: add hearing deadline with due date, mark as met, overdue deadlines shown in red
- All changes appear in the activity log accessible via `/api/legal-hub/cases/[id]/activity`

**Dependencies:** Task 1

---

### Task 3: Case Document Repository

**Description:**
Implement the Documents tab within the case detail view. Support two attachment modes: (1) upload a new file directly to the case, (2) link an existing document from the document library. Documents are organized by category (9 categories). Show document list with category filter, metadata (name, category, date filed, filing reference), and download. For uploaded PDF/DOCX files, optionally trigger the existing document processing pipeline to extract text and create embeddings so the file becomes searchable in chat. Store files at `DOCUMENTS_DIR/case-attachments/[case_id]/`.

**Files:**
- `src/app/api/legal-hub/cases/[id]/documents/route.ts` — GET, POST (multipart upload + library link)
- `src/app/api/legal-hub/cases/[id]/documents/[did]/route.ts` — DELETE
- `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts` — GET
- `lib/db.js` — helpers: `getCaseDocuments`, `addCaseDocument`, `removeCaseDocument`
- `src/lib/db-imports.ts` — export new helpers
- `src/components/legal-hub/case-documents-tab.tsx`

**Success criteria:**
- Documents tab shows empty state with upload prompt when no documents exist
- Upload a PDF → file saved, appears in list under selected category
- Link an existing library document → appears in list with link to original
- Category filter (e.g. "Pisma procesowe") shows only documents in that category
- Download button returns the file
- Uploading a PDF triggers text extraction; the document becomes queryable in chat (Task 5)
- Removing a document from the case does not delete it from the document library

**Dependencies:** Task 2

---

### Task 4: Template-based Document Generation

**Description:**
Implement the Generate tab within the case detail view, and a separate template management page at `/legal-hub/templates`. Templates use `{{variable}}` placeholders resolved from a variable registry mapping names to case data paths (e.g. `{{case.reference_number}}`, `{{parties.plaintiff.name}}`). The generate flow: pick template → preview with case data auto-filled → edit in TipTap → save to `case_generated_docs` → optional export as DOCX. The template management page allows creating, editing, and deleting templates with a variable reference panel.

**Variable sources supported:**
- `case.*` — any field on `legal_cases`
- `parties.plaintiff.*` — first party with type='plaintiff'
- `parties.defendant.*` — first party with type='defendant'
- `parties.representative.*` — first representative found
- `deadlines.next.*` — nearest pending deadline
- `today` — current date formatted

**Files:**
- `src/app/api/legal-hub/cases/[id]/generate/route.ts` — POST (fill template)
- `src/app/api/legal-hub/cases/[id]/generated-documents/route.ts` — GET
- `src/app/api/legal-hub/cases/[id]/generated-documents/[gid]/route.ts` — GET, PATCH, DELETE
- `src/app/api/legal-hub/templates/route.ts` — GET, POST
- `src/app/api/legal-hub/templates/[id]/route.ts` — GET, PATCH, DELETE
- `lib/db.js` — helpers for templates + generated docs
- `src/lib/db-imports.ts` — export new helpers
- `lib/templateEngine.js` — `fillTemplate(templateBody, caseData, parties, deadlines)` pure function
- `lib/docxExport.js` — `htmlToDocx(html, filename)` using `docx` npm library
- `src/app/(app)/legal-hub/templates/page.tsx`
- `src/components/legal-hub/case-generate-tab.tsx`
- `src/components/legal-hub/template-list.tsx`
- `src/components/legal-hub/template-form.tsx`
- `prompts/` — no new prompt needed for structured fill

**Success criteria:**
- Template management: create a template with `{{case.reference_number}}`, `{{parties.plaintiff.name}}`, `{{case.court}}` placeholders; save; edit; delete
- Generate tab: select the template, preview shows resolved values from the current case
- Missing variable renders as `[brak danych: parties.plaintiff.name]` (not blank, not error)
- User edits the filled document in TipTap editor
- Save stores content in `case_generated_docs` with `filled_variables_json` snapshot showing which values were used
- Export DOCX button downloads a `.docx` file with the correct content
- Generated documents list shows history of all generated documents for the case with timestamps

**Dependencies:** Task 2

---

### Task 5: Grounded Case Chat

**Description:**
Implement the Chat tab in the case detail view. The backend follows the existing two-step pipeline: (1) Haiku classifies intent from 5 categories, (2) retrieval from case data / indexed case documents, (3) Sonnet generates a grounded answer. Vector search is scoped strictly to documents linked to the current case via `case_documents`. The system prompt enforces that answers must come only from retrieved case evidence. Add a new prompt file `prompts/case-chat.md`. The UI adapts the existing `ContractChatPanel` pattern for the case context.

**Intent taxonomy:**
- `case_info` — questions about case metadata (court, reference, claim, summary)
- `party_lookup` — questions about parties or representatives
- `deadline_query` — questions about hearings, deadlines, dates
- `document_search` — "where is X mentioned", "find the document about Y" → vector search
- `summarize` — summarize a document or the whole case file
- `unknown` → clarification question returned

**Retrieval per intent:**
- `case_info` → SQL: `SELECT * FROM legal_cases WHERE id = ?`
- `party_lookup` → SQL: `SELECT * FROM case_parties WHERE case_id = ?`
- `deadline_query` → SQL: `SELECT * FROM case_deadlines WHERE case_id = ?`
- `document_search` → cosine similarity on `chunks` WHERE `document_id IN (SELECT document_id FROM case_documents WHERE case_id = ? AND document_id IS NOT NULL)`
- `summarize` → fetch `full_text` from all indexed case documents (truncated at 6000 words per doc)

**Fallback rule:** If retrieved context is empty or all similarity scores < 0.65 → Sonnet returns: _"Nie znaleziono wystarczających informacji w materiałach sprawy."_

**Files:**
- `src/app/api/legal-hub/cases/[id]/chat/route.ts` — POST
- `lib/db.js` — helper: `getCaseChunks(caseId)` returning chunks for case-linked documents
- `src/lib/db-imports.ts` — export new helper
- `prompts/case-chat.md` — system prompt (Polish, grounded-only rules)
- `src/components/legal-hub/case-chat-panel.tsx` — chat UI (adapted from ContractChatPanel)

**Success criteria:**
- Ask "Jaki jest numer referencyjny sprawy?" → answer cites the `reference_number` field value
- Ask "Kto jest pozwanym?" → answer cites the defendant from `case_parties`
- Ask "Kiedy jest najbliższa rozprawa?" → answer cites the nearest hearing deadline
- Upload a PDF to the case (Task 3), ask about its content → answer cites a passage from the document
- Ask a question with no supporting case data → response is "Nie znaleziono wystarczających informacji w materiałach sprawy"
- Chat history (last 6 turns) is maintained within the session
- Chat panel shows source references next to answers where available

**Dependencies:** Tasks 2, 3

---

## Documentation Updates

### Architecture docs to update
- `documentation/technology/architecture/database-schema.md` — add 6 new Legal Hub tables
- `documentation/technology/architecture/api-endpoints.md` — add all 22 new endpoints
- `documentation/technology/architecture/data-flow.md` — add Legal Hub chat and document generation flows

### Product docs to update
- `documentation/product/requirements/features.md` — add Legal Hub to feature list

### New files
- `documentation/product/requirements/legal-hub.md` — Legal Hub product requirements

---

## Assumptions

1. The single admin user is the only user in v1; no multi-user auth changes required
2. SQLite WAL mode (`PRAGMA journal_mode=WAL`) is safe to enable on the existing database
3. The `docx` npm library (already in package.json) is sufficient for DOCX export without additional dependencies
4. File storage follows the existing pattern: files in `DOCUMENTS_DIR/case-attachments/[case_id]/` relative to the app root
5. Vector search for case chat is in-memory cosine similarity, same as `/api/ask` — no external vector DB needed
6. Polish is the primary language for generated documents and chat responses; the UI labels should be in Polish or bilingual
7. Template HTML body is sanitized server-side before storage; client renders in a sandboxed context
8. `audit_log` entries with `entity_type = 'legal_case'` and `entity_id = case.id` provide the activity trail
9. The existing `tasks` table with `entity_type = 'legal_case'` can surface case deadlines as tasks if needed (out of scope for v1 UI)
10. No testing infrastructure exists in the project; no test files added
