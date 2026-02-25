# Product Hub — Design Document

**Date:** 2026-02-25
**Status:** Approved
**Stack:** Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + SQLite (sql.js) + Claude API + Voyage AI

---

## Overview

Product Hub is a new tab that lets users define a product feature through a structured intake form, attach context from existing Drive documents, and generate professional product documentation (PRD, Tech Spec, Feature Brief, Business Case) using AI with streaming output.

---

## 1. Architecture

### Routing

| Route | Purpose |
|---|---|
| `/product-hub` | List view — card grid of all saved features |
| `/product-hub/[id]` | Full-page 4-step wizard (new + existing features) |

**Draft creation flow:** clicking "New Feature" on the list page immediately calls `POST /api/product-hub` to create a draft row, then navigates to `/product-hub/{newId}`. All subsequent changes auto-save.

### Navigation

Add to `src/components/layout/app-sidebar.tsx`:
```typescript
{ title: "Product Hub", href: "/product-hub", icon: Package }
```
Placed between Contracts and Settings.

---

## 2. Database Schema

Add `product_features` table in `lib/db.js` using the existing migration pattern:

```sql
CREATE TABLE IF NOT EXISTS product_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'Untitled Feature',
  intake_form_json TEXT,            -- JSON: all Step 1 fields (sections A, B, C)
  selected_document_ids TEXT,       -- JSON array of document IDs
  free_context TEXT,                -- Step 2 free text field
  selected_templates TEXT,          -- JSON array: ["prd","tech_spec","feature_brief","business_case"]
  generated_outputs_json TEXT,      -- JSON: { prd: { sections: {...}, gaps: [] }, tech_spec: {...} }
  status TEXT DEFAULT 'idea',       -- idea|in_spec|in_review|approved|in_development|shipped
  version_history_json TEXT,        -- JSON array of snapshots, capped at 20
  linked_contract_id INTEGER,       -- FK to documents.id (contract doc)
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**`intake_form_json` structure:**
```json
{
  "sectionA": {
    "problemStatement": "",
    "persona": "",
    "statusQuo": "",
    "whyNow": ""
  },
  "sectionB": {
    "featureDescription": "",
    "userFlow": "",
    "outOfScope": "",
    "acceptanceCriteria": ""
  },
  "sectionC": {
    "constraints": "",
    "kpis": "",
    "systems": "",
    "mustHave": "",
    "shouldHave": "",
    "niceToHave": ""
  }
}
```

**`generated_outputs_json` structure:**
```json
{
  "prd": {
    "sections": {
      "problem_statement": "...",
      "user_personas": "...",
      "user_stories": "...",
      "functional_requirements": "...",
      "non_functional_requirements": "...",
      "out_of_scope": "...",
      "success_metrics": "...",
      "risks_dependencies": "...",
      "open_questions": "..."
    },
    "gaps": ["KPI too vague — no baseline provided"]
  },
  "tech_spec": { "sections": { ... }, "gaps": [] },
  "feature_brief": { "sections": { ... }, "gaps": [] },
  "business_case": { "sections": { ... }, "gaps": [] }
}
```

**`version_history_json` structure:**
```json
[
  {
    "timestamp": "2026-02-25T14:32:00Z",
    "trigger": "generate",
    "templates": ["prd", "tech_spec"],
    "snapshot": { ...generated_outputs_json at that point... }
  }
]
```

---

## 3. Frontend Components

### Directory: `src/components/product-hub/`

| File | Purpose |
|---|---|
| `product-feature-card.tsx` | Card: title, status badge, date, doc count, linked contract, quick actions (Open / Export / Duplicate) |
| `status-badge.tsx` | Colored badge with status Select dropdown; calls PATCH on change |
| `wizard-progress-bar.tsx` | 4-step indicator: step labels + colored segments per completion state |
| `step1-intake-form.tsx` | Three collapsible sections (A/B/C) with required field validation and character counts |
| `step2-document-context.tsx` | Document picker (filterable, searchable, multi-select) + free context textarea + right-side summary panel |
| `step3-template-selector.tsx` | Four toggle cards (Feature Brief / PRD / Tech Spec / Business Case) + Generate button |
| `step4-output-viewer.tsx` | Tabs per template; renders `OutputSection` per section; streaming state management |
| `output-section.tsx` | TipTap editor block + section title + "↺ Regenerate this section" button |
| `export-menu.tsx` | Dropdown: PDF / DOCX / Markdown / Save to Drive |
| `version-history-drawer.tsx` | Right-side Sheet: snapshot list, preview panel, Restore button |
| `contract-link-dialog.tsx` | Dialog: searchable contract list → saves linked_contract_id |

### Page Components

- `src/app/product-hub/page.tsx` — list view, `"use client"`, card grid + "New Feature" button
- `src/app/product-hub/[id]/page.tsx` — wizard, `"use client"`, manages `featureData` state + auto-save

### Wizard State Management

Single `featureData` state object in `[id]/page.tsx`. Auto-save:
- `useEffect` with 30-second interval calls `PATCH /api/product-hub/[id]`
- `onBlur` on all textareas triggers immediate save
- Top bar shows `"Saved ✓"` / `"Saving…"` indicator

### Step 1 — Progress Bar Logic

Track required fields per section. Section turns green when all required fields are non-empty:
- Section A required: problemStatement, persona, statusQuo
- Section B required: featureDescription, userFlow, acceptanceCriteria
- Section C required: kpis

### Step 2 — Document Filter Chip Categories

Filter chips map to document types from the existing `documents.doc_type` field:
- **Regulatory & Compliance** → `doc_type IN ['regulation', 'compliance', 'standard']`
- **Existing Specifications** → `doc_type IN ['prd', 'specification', 'architecture', 'report']`
- **User Research & Feedback** → `doc_type IN ['research', 'feedback']`
- **Contracts / SLAs** → `doc_type IN ['contract', 'sla']`

Document hover tooltip shows first 200 chars of `full_text`.

### Step 4 — Streaming Display

During generation each `OutputSection` block shows a blinking cursor while tokens arrive via stream. Gaps detected by AI render as yellow `⚠️` callout boxes pinned to the top of the "Open Questions" section.

---

## 4. Backend API Endpoints

All under `src/app/api/product-hub/`:

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/product-hub` | GET | — | `{ features: [...] }` |
| `/api/product-hub` | POST | `{ title? }` | `{ id, title, status, created_at }` |
| `/api/product-hub/[id]` | GET | — | Full feature object |
| `/api/product-hub/[id]` | PATCH | Partial feature fields | `{ ok: true }` |
| `/api/product-hub/[id]` | DELETE | — | `{ ok: true }` |
| `/api/product-hub/[id]/generate` | POST | `{ templates, intake_form_json, selected_document_ids, free_context }` | **Streaming NDJSON** |
| `/api/product-hub/[id]/regenerate` | POST | `{ template, section, intake_form_json, selected_document_ids, free_context }` | **Streaming NDJSON** |
| `/api/product-hub/[id]/export-drive` | POST | `{ template, format: "markdown" }` | `{ driveFileId, documentId }` |

---

## 5. AI Streaming Protocol

### Stream format (NDJSON, one JSON object per line)

```
{"type":"template_start","template":"prd"}
{"type":"section_start","template":"prd","section":"problem_statement"}
{"type":"token","template":"prd","section":"problem_statement","content":"The "}
{"type":"section_end","template":"prd","section":"problem_statement"}
...
{"type":"template_end","template":"prd"}
{"type":"gaps","template":"prd","gaps":["KPI too vague — no benchmark provided"]}
{"type":"template_start","template":"tech_spec"}
...
{"type":"done"}
```

Templates generate sequentially (prd → tech_spec → feature_brief → business_case). The client reads `response.body` as a `ReadableStream`, splits on `\n`, parses JSON, and updates component state per token.

### Prompt compilation

For each template:
1. Load system prompt from `prompts/prompt_prd.md` (or equivalent)
2. Append structured intake form (labeled sections)
3. Fetch top 8 RAG chunks from selected documents via `search.js` (filtered to `selectedDocumentIds`)
4. Append free context text
5. Append section delimiter instructions: sections separated by `===SECTION: {name}===`

The server splits Claude's output on `===SECTION:` markers to route tokens to the correct section.

### Section delimiter instruction (appended to every prompt)

```
Output each section preceded by exactly this delimiter on its own line:
===SECTION: problem_statement===
[section content]
===SECTION: user_personas===
[section content]
...
```

---

## 6. Export

All triggered client-side from `export-menu.tsx` using the current TipTap content:

| Format | Method |
|---|---|
| **Markdown** | String join of section content → `Blob` → `<a download>` |
| **DOCX** | `docx` package: build `Document` with `HeadingLevel` + `Paragraph` nodes → `Packer.toBlob()` → download |
| **PDF** | `jspdf` package: `doc.text()` per section with page overflow → download |
| **Save to Drive** | POST to `/api/product-hub/[id]/export-drive` → server uploads via `googleapis` → returns drive file ID → triggers Documents tab pipeline (tagged as `product_spec`) |

### New npm packages required

```
@tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
jspdf
docx
```

---

## 7. Additional Features

### Feature Status Pipeline

Values: `idea → in_spec → in_review → approved → in_development → shipped`

Color mapping:
- `idea` — gray
- `in_spec` — blue
- `in_review` — amber
- `approved` — green
- `in_development` — purple
- `shipped` — emerald

Status updated via `<Select>` in `status-badge.tsx`, calls `PATCH /api/product-hub/[id]`.

### Version History Drawer

- Every Generate and Regenerate action pushes prior `generated_outputs_json` to `version_history_json` before overwriting
- Capped at 20 snapshots (oldest dropped)
- `version-history-drawer.tsx`: Sheet from right, shows timestamp + trigger, click to preview read-only, "Restore" replaces current outputs

### Contract Linking

- `contract-link-dialog.tsx` shows documents where `doc_type = 'contract'`
- On select, PATCH updates `linked_contract_id`
- Feature card shows linked contract as a Badge
- Contract list view (Contracts tab) — future: display back-reference to feature

---

## 8. File Structure Summary

```
src/
├── app/
│   ├── product-hub/
│   │   ├── page.tsx                      # List view
│   │   └── [id]/
│   │       └── page.tsx                  # Wizard (4 steps)
│   └── api/
│       └── product-hub/
│           ├── route.ts                  # GET list, POST create
│           └── [id]/
│               ├── route.ts              # GET, PATCH, DELETE
│               ├── generate/
│               │   └── route.ts          # POST streaming generate
│               ├── regenerate/
│               │   └── route.ts          # POST streaming regenerate section
│               └── export-drive/
│                   └── route.ts          # POST save to Drive
├── components/
│   └── product-hub/
│       ├── product-feature-card.tsx
│       ├── status-badge.tsx
│       ├── wizard-progress-bar.tsx
│       ├── step1-intake-form.tsx
│       ├── step2-document-context.tsx
│       ├── step3-template-selector.tsx
│       ├── step4-output-viewer.tsx
│       ├── output-section.tsx
│       ├── export-menu.tsx
│       ├── version-history-drawer.tsx
│       └── contract-link-dialog.tsx
lib/
└── db.js                                 # Add product_features table + CRUD functions
```

---

## 9. Deliverables Checklist

- [ ] `product_features` table added to `lib/db.js`
- [ ] CRUD functions for product features in `lib/db.js`
- [ ] Sidebar entry added (`app-sidebar.tsx`)
- [ ] List view page (`/product-hub`)
- [ ] Wizard page (`/product-hub/[id]`) — all 4 steps
- [ ] All 11 component files in `src/components/product-hub/`
- [ ] API routes: GET/POST list, GET/PATCH/DELETE single, streaming generate, streaming regenerate, export-drive
- [ ] Streaming AI generation with NDJSON protocol
- [ ] RAG integration (search.js filtered to selected doc IDs)
- [ ] Export: PDF (jspdf), DOCX (docx), Markdown, Save to Drive
- [ ] Version history: push snapshot on generate/regenerate, restore
- [ ] Status pipeline with color-coded badge + inline update
- [ ] Contract linking dialog
- [ ] Install new npm packages: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `jspdf`, `docx`
